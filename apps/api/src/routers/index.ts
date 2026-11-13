import { Hono } from "hono";
import type { ApiAppOptions } from "../app/options.js";
import { createReadinessCheck } from "../app/readiness.js";
import { auditMutations } from "../middleware/audit.js";
import { createAuthRoutes } from "./auth.js";
import { createHealthRoutes } from "./health.js";
import { registerApiMiddleware } from "../middleware/http.js";
import { createOpenApiRoutes } from "./openapi.js";
import type { ApiRouterEnv } from "./request.js";
import { createRpcRouter, createRpcRoutes, rpcPrefix } from "./rpc/index.js";
import { createRoutineIngressRoutes } from "../routines/http.js";

export function createApiApp(options: ApiAppOptions) {
  const app = new Hono<ApiRouterEnv>();
  registerApiMiddleware(app, options);
  app.use("*", auditMutations(options));

  const readReadiness = createReadinessCheck(options.readiness);
  const health = createHealthRoutes(readReadiness);
  const router = createRpcRouter(options, readReadiness);
  const timeout = options.rpcTimeoutMs ?? 15_000;
  app
    .route(
      "/routines",
      createRoutineIngressRoutes({
        routines: options.routines,
        ...(options.routineEmailRelayToken
          ? { emailRelayToken: options.routineEmailRelayToken }
          : {}),
      }),
    )
    .route("/", health)
    .on(
      ["GET", "HEAD"],
      ["/.well-known/openid-configuration", "/.well-known/oauth-authorization-server"],
      (c) => options.authHandler(c.req.raw),
    )
    .route("/api/auth", createAuthRoutes(options))
    .route("/", createOpenApiRoutes(router, health, timeout))
    .route(rpcPrefix, createRpcRoutes(router, timeout, options.logger));

  app.notFound((c) => c.json({ error: { code: "NOT_FOUND" }, requestId: c.get("requestId") }, 404));
  app.onError((error, c) => {
    if (!c.get("rpcLogged")) c.get("requestLog")?.error(error);
    return c.json({ error: { code: "INTERNAL_SERVER_ERROR" }, requestId: c.get("requestId") }, 500);
  });
  return app;
}
