import { Hono } from "hono";
import type { ApiAppOptions } from "../app/options.js";
import { authPreflight, type AuthRouteEnv } from "../middleware/auth-preflight.js";
import { detectLanguage } from "../middleware/language.js";

export function createAuthRoutes(options: ApiAppOptions) {
  const auth = new Hono<AuthRouteEnv>();
  return auth.on(["GET", "POST"], "/*", detectLanguage, authPreflight(options), (c) =>
    options.authHandler(c.req.raw),
  );
}
