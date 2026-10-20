import { Hono } from "hono";
import { cors } from "hono/cors";
import { implement, ORPCError } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";
import { apiContract } from "@raypx/contracts/api";
import type { AuthSession } from "@raypx/auth/types";
import { createAccountService } from "@raypx/account/server";
import type { RequestLogger } from "@raypx-kit/logger";
import { createRpcLoggingPlugin, diagnosticRoute, type ApiLogging } from "./logging.js";

export interface ApiAppOptions {
  authHandler(request: Request): Promise<Response>;
  readSession(headers: Headers): Promise<AuthSession | null>;
  allowedOrigins: string[];
  mailAvailable?: boolean;
  logger?: ApiLogging;
}
export function createApiApp(options: ApiAppOptions) {
  const accountService = createAccountService({
    readSession: (headers) => options.readSession(headers),
  });
  const app = new Hono<{
    Variables: { requestId: string; requestLog?: RequestLogger; rpcLogged: boolean };
  }>();
  app.use("*", async (c, next) => {
    const requestId = crypto.randomUUID();
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
    cors({
      origin: (origin) => (options.allowedOrigins.includes(origin) ? origin : undefined),
      credentials: true,
      allowMethods: ["GET", "HEAD", "POST", "OPTIONS"],
      allowHeaders: ["Content-Type", "Authorization", "Accept-Language", "X-Request-Id"],
      exposeHeaders: ["X-Request-Id"],
    }),
  );
  app.get("/health", (c) => c.json({ status: "ok" }));
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
    return options.authHandler(c.req.raw);
  });
  const os = implement(apiContract).$context<{ headers: Headers; requestId: string }>();
  const router = os.router({
    account: {
      get: os.account.get.handler(async ({ context }) => {
        const account = await accountService.get(context.headers);
        if (!account)
          throw new ORPCError("UNAUTHORIZED", {
            data: { error: { code: "AUTH_REQUIRED" }, requestId: context.requestId },
          });
        return account;
      }),
    },
  });
  const rpc = new RPCHandler(router, {
    plugins: options.logger ? [createRpcLoggingPlugin(options.logger)] : [],
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
