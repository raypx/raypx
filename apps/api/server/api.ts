import { Hono } from "hono";
import { cors } from "hono/cors";
import { implement, ORPCError } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";
import { apiContract } from "@raypx/contracts/api";
import type { AuthSession } from "@raypx/auth/types";
export interface ApiAppOptions {
  authHandler(request: Request): Promise<Response>;
  readSession(headers: Headers): Promise<AuthSession | null>;
  allowedOrigins: string[];
  mailAvailable?: boolean;
}
export function createApiApp(options: ApiAppOptions) {
  const app = new Hono<{ Variables: { requestId: string } }>();
  app.use("*", async (c, next) => {
    const requestId = crypto.randomUUID();
    c.set("requestId", requestId);
    await next();
    c.header("x-request-id", requestId);
  });
  app.use(
    "*",
    cors({
      origin: (origin) => (options.allowedOrigins.includes(origin) ? origin : undefined),
      credentials: true,
      allowMethods: ["GET", "HEAD", "POST", "OPTIONS"],
      allowHeaders: [
        "Content-Type",
        "Authorization",
        "Accept-Language",
        "X-Request-Id",
        "expo-origin",
        "expo-platform",
      ],
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
        const session = await options.readSession(context.headers);
        if (!session)
          throw new ORPCError("UNAUTHORIZED", {
            data: { error: { code: "AUTH_REQUIRED" }, requestId: context.requestId },
          });
        const { id, email, name } = session.user;
        return { id, email, name };
      }),
    },
  });
  const rpc = new RPCHandler(router);
  app.all("/rpc/*", async (c) => {
    const result = await rpc.handle(c.req.raw, {
      prefix: "/rpc",
      context: { headers: c.req.raw.headers, requestId: c.get("requestId") },
    });
    return result.matched ? result.response : c.notFound();
  });
  app.notFound((c) => c.json({ error: { code: "NOT_FOUND" }, requestId: c.get("requestId") }, 404));
  app.onError((_error, c) =>
    c.json({ error: { code: "INTERNAL_SERVER_ERROR" }, requestId: c.get("requestId") }, 500),
  );
  return app;
}
