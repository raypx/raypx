import type { Hono } from "hono";
import { cors } from "hono/cors";
import { secureHeaders } from "hono/secure-headers";
import { normalizeTrustedOrigins } from "@raypx/core/auth";
import type { ApiAppOptions } from "../app/options.js";
import { diagnosticRoute } from "../logging.js";
import { openApiDocsPath } from "../routers/openapi-paths.js";
import type { ApiRouterEnv } from "../routers/request.js";

export const apiContentSecurityPolicy = "default-src 'none'; frame-ancestors 'none'";

/**
 * Letters only, so log redaction never mistakes an ID for a card or phone number and
 * masks it: the same ID must appear in responses, logs and error reports.
 */
export function newRequestId(): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyz";
  return `req_${Array.from(crypto.getRandomValues(new Uint8Array(24)), (byte) => alphabet[byte % 26]).join("")}`;
}

export function registerApiMiddleware(app: Hono<ApiRouterEnv>, options: ApiAppOptions) {
  const allowedOrigins = normalizeTrustedOrigins(options.allowedOrigins);
  app.use("*", async (c, next) => {
    const requestId = newRequestId();
    c.set("requestId", requestId);
    c.set("rpcLogged", false);
    const log = options.logger?.createLogger({
      operation: "http.request",
      requestId,
      method: c.req.method,
      route: diagnosticRoute(c.req.path),
    });
    if (log) c.set("requestLog", log);
    try {
      await next();
    } finally {
      c.header("x-request-id", requestId);
      // CORS preflights and non-RPC requests finish here. The RPC plugin owns
      // matched and unmatched RPC requests, including their errors.
      if (!c.get("rpcLogged")) {
        if (c.res.status >= 500 && !c.error) log?.error(new Error("HTTP request failed"));
        log?.emit({ status: c.res.status });
      }
    }
  });
  app.use(
    "*",
    secureHeaders({
      xFrameOptions: "DENY",
      // Web and Desktop read responses cross-origin; CORS remains the access control.
      crossOriginResourcePolicy: false,
    }),
  );
  app.use("*", async (c, next) => {
    await next();
    if (c.req.path !== openApiDocsPath || !c.res.headers.has("content-security-policy"))
      c.header("content-security-policy", apiContentSecurityPolicy);
  });
  app.use(
    "*",
    cors({
      origin: (origin) => (allowedOrigins.includes(origin) ? origin : undefined),
      credentials: true,
      allowMethods: ["GET", "HEAD", "POST", "OPTIONS"],
      allowHeaders: ["Content-Type", "Authorization", "Accept-Language", "X-Request-Id"],
      exposeHeaders: ["X-Request-Id", "Retry-After", "X-Retry-After"],
      // Every JSON RPC call is preflighted; let browsers reuse the answer for ten minutes.
      maxAge: 600,
    }),
  );
}
