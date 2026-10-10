import { loadServerEnv, type ServerEnv } from "@raypx/env/server";
import { configureLogging, createLogger } from "@raypx/logger";
import { RuntimeLifecycle } from "@raypx/api/runtime";

import { createHttpMetrics } from "@raypx/api/metrics";
import { createRateLimiter } from "@raypx/api/security";
import { createDatabase } from "@raypx/db";
import { user } from "@raypx/db/schema";
import { createAuth, type AuthInstance } from "@raypx/auth";

const routes = [
  "/",
  "/components",
  "/api/health",
  "/api/ready",
  "/api/metrics",
  "/api/session",
  "/api/me",
  "/api/auth/*",
];
function initialize() {
  const env = loadServerEnv();
  process.env.NITRO_HOST = env.HOST;
  process.env.NITRO_PORT = String(env.PORT);
  configureLogging({ environment: env.NODE_ENV, level: env.LOG_LEVEL, version: env.APP_VERSION });
  const runtime = new RuntimeLifecycle();
  const metrics = createHttpMetrics({ routes });
  const limiter = createRateLimiter({
    limit: env.API_RATE_LIMIT_MAX ?? 120,
    windowMs: env.API_RATE_LIMIT_WINDOW_MS ?? 60_000,
  });
  let auth: AuthInstance | undefined;
  if (env.AUTH_ENABLED) {
    if (!env.BETTER_AUTH_URL || !env.BETTER_AUTH_SECRET)
      throw new Error("Authentication is not configured");
    const connection = createDatabase(env.DATABASE_PATH ?? "./data/raypx.db");
    try {
      connection.checkHealth();
      connection.db.select({ id: user.id }).from(user).limit(1).all();
      auth = createAuth({
        database: connection.db,
        secret: env.BETTER_AUTH_SECRET,
        baseURL: env.BETTER_AUTH_URL,
        environment: env.NODE_ENV,
      });
    } catch {
      connection.close();
      throw new Error(
        "Authentication database is not ready. Run bun run db:migrate before starting the application.",
      );
    }
    runtime.register({
      name: "database",
      check: () => connection.checkHealth(),
      dispose: () => connection.close(),
    });
  }
  runtime.markReady();
  return { env, runtime, metrics, limiter, auth };
}
// Nitro and Start can bundle this module separately. Share resources across both.
const key = Symbol.for("@raypx/web/runtime/v2");
const shared = globalThis as typeof globalThis & { [key]?: ReturnType<typeof initialize> };
export const services = (shared[key] ??= initialize());
export const runtime = services.runtime;
export const runtimeLogger = createLogger({ name: "web" });
export const runtimeEnv: ServerEnv = services.env;

/** Maps only known routes to metric labels, keeping arbitrary paths out of metrics. */
export function requestRoute(path: string): string {
  if (path.startsWith("/api/auth/")) return "/api/auth/*";
  return routes.includes(path) ? path : "unmatched";
}
