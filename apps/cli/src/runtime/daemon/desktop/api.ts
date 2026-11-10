import { apiExposure } from "@raypx/contracts/api";
import { desktopApiRequestSchema, type DesktopApiResponse } from "@raypx/contracts/desktop";
import { z } from "zod";
import { LocalError } from "../../errors.ts";
import { abortable } from "../cancellation.ts";
import { parseSessionCookie, type SessionCookies } from "./cookies.ts";

const authPaths = new Set([
  "/api/auth/get-session",
  "/api/auth/sign-in/email",
  "/api/auth/sign-up/email",
  "/api/auth/sign-out",
  "/api/auth/send-verification-email",
  "/api/auth/verify-email",
  "/api/auth/request-password-reset",
  "/api/auth/reset-password",
  "/api/auth/update-user",
  "/api/auth/list-sessions",
  "/api/auth/revoke-session",
  "/api/auth/revoke-other-sessions",
]);
const rendererPaths = new Set<string>(),
  privatePaths = new Set<string>();
for (const [group, methods] of Object.entries(apiExposure))
  for (const [method, exposure] of Object.entries(methods)) {
    const path = `/rpc/${group}/${method}`;
    if (exposure === "renderer") rendererPaths.add(path);
    if (exposure === "native") privatePaths.add(path);
  }
const permittedHeaders = new Set(["accept", "accept-language", "content-type"]);
const invalidRequest = () => new LocalError("INVALID_API_REQUEST", "API request is not permitted");
const invalidResponse = () => new LocalError("INVALID_API_RESPONSE", "Invalid API response");
const responseLimit = 8 * 1024 * 1024;
type Fetch = (request: Request) => Promise<Response>;

function authBody(path: string, body: string) {
  if (!authPaths.has(path) || !body) return body;
  try {
    const value: unknown = JSON.parse(body);
    const redact = (input: unknown) => {
      if (input && typeof input === "object") {
        if ("token" in input) delete input.token;
        if (
          "session" in input &&
          input.session &&
          typeof input.session === "object" &&
          "token" in input.session
        )
          delete input.session.token;
      }
    };
    if (Array.isArray(value)) value.forEach(redact);
    else redact(value);
    return JSON.stringify(value);
  } catch {
    throw invalidResponse();
  }
}
async function readBody(response: Response, signal: AbortSignal) {
  if (Number(response.headers.get("content-length")) > responseLimit) throw invalidResponse();
  const reader = response.body?.getReader();
  if (!reader) return "";
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    for (;;) {
      const { value, done } = await abortable(signal, () => reader.read());
      if (done) break;
      size += value.byteLength;
      if (size > responseLimit) throw invalidResponse();
      chunks.push(value);
    }
    return Buffer.concat(chunks).toString("utf8");
  } finally {
    void reader.cancel().catch(() => {});
  }
}

/** HTTP policy and session state belong to the daemon, independent of a renderer lifetime. */
export class DesktopApi {
  private readonly requests = new Map<string, AbortController>();
  private active = 0;
  constructor(
    readonly cookies: SessionCookies,
    private readonly fetch: Fetch = (request) =>
      globalThis.fetch(request, { redirect: "manual", credentials: "omit" }),
  ) {}
  cancel(client: string, id: string) {
    this.requests.get(`${client}:${id}`)?.abort();
    return true;
  }
  async request(
    raw: unknown,
    client: string,
    parent: AbortSignal,
    privileged = false,
  ): Promise<DesktopApiResponse> {
    const parsed = desktopApiRequestSchema.safeParse(raw);
    if (!parsed.success) throw invalidRequest();
    const input = parsed.data;
    if (!input.path.startsWith("/") || input.path.startsWith("//") || /[\s#\\]/.test(input.path))
      throw invalidRequest();
    const url = new URL(input.path, this.cookies.origin);
    const rpc = rendererPaths.has(url.pathname) || (privileged && privatePaths.has(url.pathname));
    if (
      url.origin !== this.cookies.origin.origin ||
      url.username ||
      url.password ||
      (!authPaths.has(url.pathname) && !rpc) ||
      (rpc && input.method !== "POST")
    )
      throw invalidRequest();
    if (input.body !== undefined && Buffer.byteLength(input.body) > 256 * 1024)
      throw invalidRequest();
    const headers = new Headers();
    if (Object.keys(input.headers).length > 32) throw invalidRequest();
    for (const [name, value] of Object.entries(input.headers)) {
      if (!permittedHeaders.has(name.toLowerCase()) || /[\r\n\0]/.test(value) || headers.has(name))
        throw invalidRequest();
      headers.set(name, value);
    }
    headers.set("origin", "views://main");
    const cookie = this.cookies.header(url);
    if (cookie) headers.set("cookie", cookie);
    const key = input.id === undefined ? undefined : `${client}:${input.id}`;
    if (this.active >= 128 || (key && this.requests.has(key)))
      throw new LocalError("API_BUSY", "API transport busy or duplicate identity");
    const controller = new AbortController();
    const signal = AbortSignal.any([controller.signal, parent, AbortSignal.timeout(30_000)]);
    signal.throwIfAborted();
    if (key) this.requests.set(key, controller);
    this.active++;
    let response: Response | undefined;
    try {
      const request = new Request(url.href, {
        method: input.method,
        headers,
        signal,
        ...(input.body === undefined ? {} : { body: input.body }),
        redirect: "manual",
        credentials: "omit",
      });
      response = await abortable<Response>(signal, () =>
        this.fetch(request).then((value) => {
          if (signal.aborted) {
            void value.body?.cancel().catch(() => {});
            throw new LocalError("CANCELLED", "API request cancelled");
          }
          return value;
        }),
      );
      // Redirects may expose cookies or credentials to another origin; never follow or return them.
      if (response.status >= 300 && response.status < 400) throw invalidResponse();
      const rawCookies = response.headers.getSetCookie();
      if (rawCookies.length > 32) throw invalidResponse();
      const changes = rawCookies.flatMap((rawCookie) => {
        const change = parseSessionCookie(this.cookies.origin, rawCookie);
        return change ? [change] : [];
      });
      const body = await readBody(response, signal);
      signal.throwIfAborted();
      this.cookies.apply(changes);
      const output: Record<string, string> = {};
      for (const name of ["content-type", "retry-after", "x-request-id"]) {
        const value = response.headers.get(name);
        if (value !== null) output[name] = value;
      }
      return { status: response.status, headers: output, body: authBody(url.pathname, body) };
    } catch (error) {
      if (error instanceof LocalError) throw error;
      if (signal.aborted) throw new LocalError("CANCELLED", "API request cancelled");
      throw new LocalError("API_UNAVAILABLE", "API request failed");
    } finally {
      void response?.body?.cancel().catch(() => {});
      if (key) this.requests.delete(key);
      this.active--;
    }
  }
  async rpc(procedure: string, input: unknown, signal: AbortSignal): Promise<unknown> {
    const response = await this.request(
      {
        path: `/rpc/${procedure.replaceAll(".", "/")}`,
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ json: input }),
      },
      "daemon",
      signal,
      true,
    );
    if (response.status === 401) throw new LocalError("AUTH_REQUIRED", "AUTH_REQUIRED");
    const envelopeSchema = z.object({
      json: z.unknown(),
      meta: z.array(z.never()).optional(),
      maps: z.array(z.never()).optional(),
      blobs: z.array(z.never()).optional(),
    });
    let envelope: z.infer<typeof envelopeSchema>;
    try {
      envelope = envelopeSchema.parse(JSON.parse(response.body));
    } catch {
      throw invalidResponse();
    }
    if (!Object.hasOwn(envelope, "json")) throw invalidResponse();
    if (response.status >= 400) {
      const error = z
        .object({ code: z.enum(["NOT_FOUND", "FORBIDDEN", "BAD_REQUEST"]) })
        .safeParse(envelope.json);
      if (error.success) throw new LocalError(error.data.code, error.data.code);
      throw new LocalError("API_UNAVAILABLE", "API request failed");
    }
    return envelope.json;
  }
}
