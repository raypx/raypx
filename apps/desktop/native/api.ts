import type { DesktopApiRequest, DesktopApiResponse } from "../api";
import { parseServerOrigin } from "../config";

export { parseServerOrigin as parseApiOrigin } from "../config";

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
export type CookieMutation = { cookie: Cookie } | { url: string; name: string };
export interface NativeCookies {
  get(filter: { url: string }): Cookie[];
  set(cookie: Cookie): boolean;
  remove(url: string, name: string): boolean;
  apply?(changes: CookieMutation[]): boolean;
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
  "/rpc/observed/list",
  "/rpc/observed/get",
  "/rpc/jobs/list",
  "/rpc/jobs/create",
  "/rpc/jobs/update",
  "/rpc/jobs/remove",
  "/rpc/jobs/run",
  "/rpc/jobs/history",
  "/rpc/memory/list",
  "/rpc/memory/get",
  "/rpc/memory/create",
  "/rpc/memory/update",
  "/rpc/memory/archive",
  "/rpc/memory/delete",
  "/rpc/memory/history",
  "/rpc/memory/restore",
  "/rpc/memory/resolve",
]);
const nativeRpcPaths = new Set(["/rpc/hosts/authorize", "/rpc/hosts/revoke"]);
const requestHeaders = new Set(["accept", "accept-language", "content-type"]);
const responseHeaders = new Set(["content-type", "retry-after", "x-request-id"]);

/** WebKit can reject third-party cookies from views://. Keep the cookie jar in Native. */
export function createDesktopApi(
  rawOrigin: unknown,
  cookies: NativeCookies,
  send: (input: string, init: RequestInit) => Promise<Response> = fetch,
) {
  const nativePermission = Symbol("native-api-permission");
  const origin = parseServerOrigin(rawOrigin);
  const base = new URL(origin);
  let poisoned = false;
  const requests = new Map<string, AbortController>();
  function parseCookie(raw: string): CookieMutation | undefined {
    if (raw.length > 16_384) throw new Error("API cookie exceeds limit");
    const [pair, ...attributes] = raw.split(";");
    const equal = pair!.indexOf("=");
    if (equal < 1) return;
    const name = pair!.slice(0, equal).trim();
    if (!authCookie(name)) return;
    const value = pair!.slice(equal + 1).trim();
    if (!/^[\x21\x23-\x2b\x2d-\x3a\x3c-\x5b\x5d-\x7e]*$/.test(value))
      throw new Error("Invalid API cookie");
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
    if (
      /[\s?#\\]/.test(path) ||
      (path !== "/" && !path.startsWith("/api/") && !path.startsWith("/rpc/"))
    )
      throw new Error("Invalid API cookie path");
    const maxAge = fields.has("max-age") ? Number(fields.get("max-age")) : undefined;
    const expires = fields.has("expires") ? Date.parse(fields.get("expires")!) / 1000 : undefined;
    if (
      (maxAge !== undefined &&
        (!/^-?\d+$/.test(fields.get("max-age")!) || !Number.isSafeInteger(maxAge))) ||
      (expires !== undefined && !Number.isFinite(expires))
    )
      throw new Error("Invalid API cookie expiration");
    const secure = fields.has("secure");
    const httpOnly = fields.has("httponly");
    if ((base.protocol === "https:" || name.startsWith("__Secure-")) && (!secure || !httpOnly))
      throw new Error("Insecure API session cookie");
    const sameSite = fields.get("samesite")?.toLowerCase();
    if (sameSite !== undefined && !["none", "lax", "strict"].includes(sameSite))
      throw new Error("Invalid API cookie SameSite");
    const expirationDate =
      maxAge !== undefined && Number.isFinite(maxAge) ? Date.now() / 1000 + maxAge : expires;
    if (
      expirationDate !== undefined &&
      Number.isFinite(expirationDate) &&
      expirationDate <= Date.now() / 1000
    ) {
      const url = new URL(path, origin).href;
      return { url, name };
    }
    return {
      cookie: {
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
      },
    };
  }
  function commit(changes: CookieMutation[]) {
    if (!changes.length) return;
    if (cookies.apply) {
      if (!cookies.apply(changes)) throw new Error("Unable to persist API session");
      return;
    }
    const urls = changes.map((change) =>
      "cookie" in change ? new URL(change.cookie.path ?? "/", origin).href : change.url,
    );
    const before = [
      ...new Map(
        urls
          .flatMap((url) => cookies.get({ url }))
          .map((cookie) => [cookie.name + ":" + cookie.path, { ...cookie }]),
      ).values(),
    ];
    try {
      for (const change of changes)
        if (
          !("cookie" in change
            ? cookies.set(change.cookie)
            : cookies.remove(change.url, change.name))
        )
          throw new Error("Unable to persist API session");
    } catch {
      poisoned = true;
      let restored = true;
      for (const [index, change] of changes.entries())
        try {
          if (!cookies.remove(urls[index]!, "cookie" in change ? change.cookie.name : change.name))
            restored = false;
        } catch {
          restored = false;
        }
      for (const cookie of before)
        try {
          if (!cookies.set(cookie)) restored = false;
        } catch {
          restored = false;
        }
      poisoned = !restored;
      throw new Error("Unable to persist API session");
    }
  }
  const api = {
    cancel(id: string) {
      requests.get(id)?.abort();
      return true;
    },
    async request(
      this: void,
      input: DesktopApiRequest,
      callerSignal?: AbortSignal,
      permission?: symbol,
    ): Promise<DesktopApiResponse> {
      if (poisoned) throw new Error("Native session storage unavailable; restart required");
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
        (!authPaths.has(url.pathname) &&
          !rpcPaths.has(url.pathname) &&
          !(permission === nativePermission && nativeRpcPaths.has(url.pathname)))
      )
        throw new Error("API path is not permitted");
      if (
        (rpcPaths.has(url.pathname) || nativeRpcPaths.has(url.pathname)) &&
        input.method !== "POST"
      )
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
      const controller = new AbortController();
      if (input.id !== undefined && (!/^[a-f0-9-]{36}$/.test(input.id) || requests.has(input.id)))
        throw new Error("Invalid API request identity");
      if (requests.size >= 128) throw new Error("Too many API requests");
      if (input.id) requests.set(input.id, controller);
      try {
        const response = await send(url.href, {
          method: input.method,
          headers,
          ...(input.body === undefined ? {} : { body: input.body }),
          redirect: "manual",
          signal: AbortSignal.any([
            controller.signal,
            AbortSignal.timeout(30_000),
            ...(callerSignal ? [callerSignal] : []),
          ]),
        });
        const setCookies = response.headers.getSetCookie();
        if (setCookies.length > 32) throw new Error("Too many API response cookies");
        const changes = setCookies
          .map(parseCookie)
          .filter((change): change is CookieMutation => change !== undefined);
        commit(changes);
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
      } finally {
        if (input.id) requests.delete(input.id);
      }
    },
  };
  return Object.assign(api, {
    fetch: async (input: string, init?: RequestInit): Promise<Response> => {
      const request = new Request(input, init);
      const url = new URL(request.url);
      if (url.origin !== origin) throw new Error("Invalid native API origin");
      const result = await api.request(
        {
          id: crypto.randomUUID(),
          path: url.pathname + url.search,
          method: request.method,
          headers: Object.fromEntries(
            [...request.headers].filter(([name]) => requestHeaders.has(name)),
          ),
          ...(request.body === null ? {} : { body: await request.text() }),
        },
        request.signal,
        nativePermission,
      );
      return new Response([204, 205, 304].includes(result.status) ? null : result.body, {
        status: result.status,
        headers: result.headers,
      });
    },
  });
}
