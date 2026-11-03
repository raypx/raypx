import { AuditUnavailable } from "./administration/audit.js";
import { checkReadiness } from "./app/readiness.js";
import type { ApiEventLogger } from "./logging.js";
import type { ApiAppOptions } from "./app/options.js";
import { createRpcRouter } from "./rpc/router.js";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { secureHeaders } from "hono/secure-headers";
import { RPCHandler } from "@orpc/server/fetch";
import { TimeoutHandlerPlugin } from "@orpc/server/plugins";
import { normalizeTrustedOrigins } from "@raypx/auth/origins";
import { createRpcLoggingPlugin, diagnosticRoute } from "./logging.js";

/**
 * Letters only, so log redaction never mistakes an ID for a card or phone number and
 * masks it: the same ID must appear in responses, logs and error reports.
 */
export function newRequestId(): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyz";
  return `req_${Array.from(crypto.getRandomValues(new Uint8Array(24)), (byte) => alphabet[byte % 26]).join("")}`;
}
export function createApiApp(options: ApiAppOptions) {
  const allowedOrigins = normalizeTrustedOrigins(options.allowedOrigins);
  const app = new Hono<{
    Variables: {
      requestId: string;
      requestLog?: ApiEventLogger<"http.request">;
      rpcLogged: boolean;
    };
  }>();
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
      // The API serves JSON only: nothing may load, frame or embed its responses.
      contentSecurityPolicy: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] },
      xFrameOptions: "DENY",
      // Web and Desktop read responses cross-origin; CORS remains the access control.
      crossOriginResourcePolicy: false,
    }),
  );
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
  app.use("*", async (c, next) => {
    const path = decodeURIComponent(c.req.path).replace(/\/+$/, "");
    const action =
      c.req.method !== "POST"
        ? null
        : path === "/api/auth/admin/set-role"
          ? "user.role.update"
          : path === "/rpc/configuration/update"
            ? "configuration.update"
            : null;
    if (!action || !options.audit) return next();
    try {
      const session = await options.readSession(c.req.raw.headers);
      if (!session) return next();
      if (
        options.rateLimit &&
        !(await options.rateLimit(`admin.audit:${session.user.id}`, { window: 60, max: 60 }))
      )
        return c.json({ code: "RATE_LIMITED", message: "Too many administration requests" }, 429);
      await options.audit.run(
        { action, actorId: session.user.id, source: "http", requestId: c.get("requestId") },
        async () => {
          await next();
          return c.res;
        },
      );
    } catch (error) {
      if (error instanceof AuditUnavailable && path.startsWith("/rpc/"))
        return c.json(
          {
            json: {
              defined: false,
              code: "SERVICE_UNAVAILABLE",
              message: "Administration audit is unavailable",
              data: { error: { code: "AUDIT_UNAVAILABLE" }, requestId: c.get("requestId") },
            },
          },
          503,
        );
      if (error instanceof AuditUnavailable)
        return c.json(
          { code: "AUDIT_UNAVAILABLE", message: "Administration audit is unavailable" },
          503,
        );
      throw error;
    }
  });
  app.get("/health", (c) => c.json({ status: "ok" }));
  // Readiness, unlike liveness, checks dependencies so platforms can drain an instance
  // that cannot reach PostgreSQL or Redis. Results name dependencies, never errors.
  app.get("/ready", async (c) => {
    const checks = await checkReadiness(options.readiness ?? {});
    const ready = Object.values(checks).every((value) => value === "ok");
    return c.json({ status: ready ? "ok" : "unavailable", checks }, ready ? 200 : 503);
  });
  app.on(["GET", "POST"], "/api/auth/*", async (c) => {
    const path = decodeURIComponent(c.req.path).replace(/\/+$/, "");
    if (
      options.mailAvailable === false &&
      c.req.method === "POST" &&
      [
        "/api/auth/sign-up/email",
        "/api/auth/send-verification-email",
        "/api/auth/request-password-reset",
      ].includes(path)
    ) {
      return c.json(
        { code: "MAIL_NOT_CONFIGURED", message: "Authentication email is unavailable" },
        503,
      );
    }
    if (c.req.method === "POST" && path === "/api/auth/sign-up/email" && options.configuration) {
      try {
        // Cheap early answer; the auth user-create hook re-checks with a fresh read.
        if (!(await options.configuration.readCached()).values.registrationEnabled)
          return c.json({ code: "REGISTRATION_DISABLED", message: "Registration is closed" }, 403);
      } catch {
        return c.json(
          { code: "CONFIGURATION_UNAVAILABLE", message: "Configuration is unavailable" },
          503,
        );
      }
    }
    return options.authHandler(c.req.raw);
  });
  const router = createRpcRouter(options);
  const rpc = new RPCHandler(router, {
    plugins: [
      new TimeoutHandlerPlugin({ timeout: options.rpcTimeoutMs ?? 15_000 }),
      ...(options.logger ? [createRpcLoggingPlugin(options.logger)] : []),
    ],
  });
  app.all("/rpc/*", async (c) => {
    const headers = new Headers(c.req.raw.headers);
    // Use the same server-owned ID in the plugin, response and error contract.
    headers.set("x-request-id", c.get("requestId"));
    // Nitro can supply a Request-compatible wrapper without Undici's private
    // state. Build from public fields so Node can accept it, preserving the
    // request stream and cancellation signal without reading the body.
    const request = new Request(c.req.url, {
      method: c.req.method,
      headers,
      body: c.req.raw.body,
      signal: c.req.raw.signal,
      duplex: "half",
    });
    c.set("rpcLogged", Boolean(options.logger));
    const result = await rpc.handle(request, {
      prefix: "/rpc",
      context: { headers: c.req.raw.headers, requestId: c.get("requestId") },
    });
    return result.matched ? result.response : c.notFound();
  });
  app.notFound((c) => c.json({ error: { code: "NOT_FOUND" }, requestId: c.get("requestId") }, 404));
  app.onError((error, c) => {
    if (!c.get("rpcLogged")) c.get("requestLog")?.error(error);
    return c.json({ error: { code: "INTERNAL_SERVER_ERROR" }, requestId: c.get("requestId") }, 500);
  });
  return app;
}
