import type { DesktopApiRequest, DesktopApiResponse } from "../api";

interface Cookie {
  name: string;
  value: string;
  domain?: string;
  path?: string;
  secure?: boolean;
  httpOnly?: boolean;
  sameSite?: "no_restriction" | "lax" | "strict";
  expirationDate?: number;
}
export interface NativeCookies {
  get(filter: { url: string }): Cookie[];
  set(cookie: Cookie): boolean;
  remove(url: string, name: string): boolean;
}
const authCookie = (name: string) => /^(?:__Secure-)?better-auth\.[a-zA-Z0-9_.-]+$/.test(name);
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
const rpcPaths = new Set([
  "/rpc/account/get",
  "/rpc/devices/register",
  "/rpc/devices/refreshGrant",
  "/rpc/devices/list",
  "/rpc/devices/revoke",
  "/rpc/tasks/list",
  "/rpc/tasks/get",
  "/rpc/approvals/list",
  "/rpc/relay/ticket",
]);
const requestHeaders = new Set(["accept", "accept-language", "content-type"]);
const responseHeaders = new Set(["content-type", "retry-after", "x-request-id"]);

export function parseApiOrigin(raw: unknown) {
  if (typeof raw !== "string") throw new Error("API configuration unavailable");
  const url = new URL(raw);
  if (
    (url.protocol !== "https:" &&
      !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))) ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  )
    throw new Error("Invalid packaged API origin");
  return url.origin;
}

/** WebKit can reject third-party cookies from views://. Keep the cookie jar in Native. */
export function createDesktopApi(
  rawOrigin: unknown,
  cookies: NativeCookies,
  send: (input: string, init: RequestInit) => Promise<Response> = fetch,
) {
  const origin = parseApiOrigin(rawOrigin);
  const base = new URL(origin);
  function store(raw: string) {
    if (raw.length > 16_384) throw new Error("API cookie exceeds limit");
    const [pair, ...attributes] = raw.split(";");
    const equal = pair!.indexOf("=");
    if (equal < 1) return;
    const name = pair!.slice(0, equal).trim();
    if (!authCookie(name)) return;
    const value = pair!.slice(equal + 1).trim();
    if (/[\r\n;]/.test(value)) throw new Error("Invalid API cookie");
    const fields = new Map(
      attributes.map((attribute) => {
        const offset = attribute.indexOf("=");
        return offset < 0
          ? [attribute.trim().toLowerCase(), ""]
          : [attribute.slice(0, offset).trim().toLowerCase(), attribute.slice(offset + 1).trim()];
      }),
    );
    const domain = (fields.get("domain") ?? base.hostname).toLowerCase();
    const host = domain.replace(/^\./, "");
    if (base.hostname !== host && !base.hostname.endsWith("." + host))
      throw new Error("Invalid API cookie domain");
    const path = fields.get("path") ?? "/";
    if (path !== "/" && !path.startsWith("/api/") && !path.startsWith("/rpc/"))
      throw new Error("Invalid API cookie path");
    const maxAge = fields.has("max-age") ? Number(fields.get("max-age")) : undefined;
    const expires = fields.has("expires") ? Date.parse(fields.get("expires")!) / 1000 : undefined;
    const expirationDate =
      maxAge !== undefined && Number.isFinite(maxAge) ? Date.now() / 1000 + maxAge : expires;
    if (
      expirationDate !== undefined &&
      Number.isFinite(expirationDate) &&
      expirationDate <= Date.now() / 1000
    ) {
      const url = new URL(path, origin).href;
      if (cookies.get({ url }).some((cookie) => cookie.name === name) && !cookies.remove(url, name))
        throw new Error("Unable to clear API session");
      return;
    }
    const secure = fields.has("secure");
    const httpOnly = fields.has("httponly");
    if (base.protocol === "https:" && (!secure || !httpOnly))
      throw new Error("Insecure API session cookie");
    const sameSite = fields.get("samesite")?.toLowerCase();
    if (
      !cookies.set({
        name,
        value,
        // Native only calls one API host, so keep even parent-domain cookies host-scoped.
        domain: base.hostname,
        path,
        secure,
        httpOnly,
        sameSite: sameSite === "strict" ? "strict" : sameSite === "lax" ? "lax" : "no_restriction",
        ...(expirationDate !== undefined && Number.isFinite(expirationDate)
          ? { expirationDate }
          : {}),
      })
    )
      throw new Error("Unable to persist API session");
  }
  const api = {
    async request(this: void, input: DesktopApiRequest): Promise<DesktopApiResponse> {
      if (
        !input ||
        typeof input.path !== "string" ||
        input.path.length > 16_384 ||
        !input.path.startsWith("/") ||
        input.path.startsWith("//") ||
        !["GET", "POST"].includes(input.method) ||
        !input.headers ||
        typeof input.headers !== "object" ||
        Array.isArray(input.headers) ||
        Object.entries(input.headers).some(
          ([name, value]) =>
            !requestHeaders.has(name.toLowerCase()) ||
            typeof value !== "string" ||
            value.length > 1024,
        ) ||
        (input.body !== undefined &&
          (typeof input.body !== "string" || Buffer.byteLength(input.body) > 256 * 1024))
      )
        throw new Error("Invalid API request");
      const url = new URL(input.path, origin);
      if (
        url.origin !== origin ||
        url.hash ||
        (!authPaths.has(url.pathname) && !rpcPaths.has(url.pathname))
      )
        throw new Error("API path is not permitted");
      if (rpcPaths.has(url.pathname) && input.method !== "POST")
        throw new Error("Invalid RPC method");
      const headers = new Headers(input.headers);
      headers.set("origin", "views://main");
      const stored = cookies.get({ url: url.href }).filter((cookie) => {
        const host = cookie.domain?.replace(/^\./, "").toLowerCase();
        return (
          authCookie(cookie.name) &&
          !/[\r\n;]/.test(cookie.value) &&
          host !== undefined &&
          (base.hostname === host || base.hostname.endsWith("." + host)) &&
          (!cookie.secure || base.protocol === "https:") &&
          (cookie.expirationDate === undefined || cookie.expirationDate > Date.now() / 1000) &&
          url.pathname.startsWith(cookie.path ?? "/")
        );
      });
      if (stored.length > 32) throw new Error("Too many API session cookies");
      if (stored.length)
        headers.set("cookie", stored.map((cookie) => cookie.name + "=" + cookie.value).join("; "));
      const response = await send(url.href, {
        method: input.method,
        headers,
        ...(input.body === undefined ? {} : { body: input.body }),
        redirect: "manual",
        signal: AbortSignal.timeout(10_000),
      });
      const setCookies = response.headers.getSetCookie();
      if (setCookies.length > 32) throw new Error("Too many API response cookies");
      for (const value of setCookies) store(value);
      // Read with a byte limit before crossing the native RPC boundary.
      const reader = response.body?.getReader();
      const chunks: Uint8Array[] = [];
      let length = 0;
      if (reader)
        try {
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            length += value.byteLength;
            if (length > 8 * 1024 * 1024) throw new Error("API response exceeds limit");
            chunks.push(value);
          }
        } finally {
          await reader.cancel();
        }
      const body = Buffer.concat(chunks).toString("utf8");
      return {
        status: response.status,
        headers: Object.fromEntries(
          [...response.headers].filter(([name]) => responseHeaders.has(name)),
        ),
        body,
      };
    },
  };
  return Object.assign(api, {
    fetch: async (input: string, init?: RequestInit): Promise<Response> => {
      const request = new Request(input, init);
      const url = new URL(request.url);
      if (url.origin !== origin) throw new Error("Invalid native API origin");
      const result = await api.request({
        path: url.pathname + url.search,
        method: request.method,
        headers: Object.fromEntries(
          [...request.headers].filter(([name]) => requestHeaders.has(name)),
        ),
        ...(request.body === null ? {} : { body: await request.text() }),
      });
      return new Response([204, 205, 304].includes(result.status) ? null : result.body, {
        status: result.status,
        headers: result.headers,
      });
    },
  });
}
