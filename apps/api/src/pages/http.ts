import { Hono } from "hono";
import type { AuthSession } from "@raypx/core/auth";
import { PageError, pageIdSchema } from "@raypx/core/pages";
import { SpaceNotFound, spaceIdSchema } from "@raypx/core/spaces";
import {
  pageResponseHeaders,
  pageTokenHash,
  renderPage,
  type PagesService,
} from "@raypx/pages/server";
import type { SpaceAccess } from "@raypx/spaces/server";
import type { RateLimiter } from "../rate-limit/types.js";
import type { ApiRouterEnv } from "../routers/request.js";

export interface PagesHttpOptions {
  pages: PagesService;
  spaces: SpaceAccess;
  readSession(headers: Headers): Promise<AuthSession | null>;
  allowedOrigins: string[];
  rateLimit?: RateLimiter;
  clientIpHeader?: string;
}
/** Used in isolated in-process applications; production injects the shared DB limiter. */
function localLimiter(): RateLimiter {
  const windows = new Map<string, { until: number; count: number }>();
  return async (key, rule) => {
    const now = Date.now();
    const previous = windows.get(key);
    if (previous && previous.until > now) {
      previous.count += 1;
      return previous.count <= rule.max;
    }
    if (windows.size >= 10_000) {
      for (const [candidate, value] of windows) if (value.until <= now) windows.delete(candidate);
      if (windows.size >= 10_000) return false;
    }
    windows.set(key, { until: now + rule.window * 1_000, count: 1 });
    return true;
  };
}
export function createPagesRoutes(options: PagesHttpOptions) {
  const app = new Hono<ApiRouterEnv>();
  const limit = options.rateLimit ?? localLimiter();
  function response(body: string, status = 200) {
    return new Response(body, { status, headers: pageResponseHeaders(options.allowedOrigins) });
  }
  function missing() {
    return response("Not found", 404);
  }
  app.use("*", async (c, next) => {
    await next();
    for (const [name, value] of pageResponseHeaders(options.allowedOrigins))
      c.res.headers.set(name, value);
    c.res.headers.delete("set-cookie");
    c.res.headers.delete("x-frame-options");
  });
  app.onError((_error, _c) => response("Unavailable", 503));
  // This path never resolves a session or reads a Cookie header. Tokens authorize
  // exactly one Page and cannot authorize any API procedure.
  app.get("/public/:token", async (c) => {
    const address = c.req.header(options.clientIpHeader ?? "x-raypx-client-ip") ?? "unknown";
    const admitted = await limit(`pages:address:${await pageTokenHash(address)}`, {
      window: 60,
      max: 120,
    });
    if (!admitted) {
      const result = response("Rate limited", 429);
      result.headers.set("retry-after", "60");
      return result;
    }
    const token = c.req.param("token");
    if (
      !(await limit(`pages:token:${await pageTokenHash(token.slice(0, 128))}`, {
        window: 60,
        max: 60,
      }))
    ) {
      const result = response("Rate limited", 429);
      result.headers.set("retry-after", "60");
      return result;
    }
    const page = await options.pages.resolveShare(token);
    return page ? response(renderPage(page)) : missing();
  });
  app.get("/member/:spaceId/:pageId", async (c) => {
    const spaceId = spaceIdSchema.safeParse(c.req.param("spaceId"));
    const pageId = pageIdSchema.safeParse(c.req.param("pageId"));
    const requested = c.req.query("version");
    if (
      !spaceId.success ||
      !pageId.success ||
      (requested !== undefined && !/^[1-9]\d{0,8}$/.test(requested))
    )
      return missing();
    const session = await options.readSession(c.req.raw.headers);
    if (!session) return missing();
    try {
      const scope = await options.spaces.resolve(session.user.id, spaceId.data);
      const page = await options.pages.get(
        scope,
        pageId.data,
        requested === undefined ? undefined : Number(requested),
      );
      return response(renderPage(page));
    } catch (error) {
      if (error instanceof SpaceNotFound || error instanceof PageError) return missing();
      throw error;
    }
  });
  app.notFound(missing);
  return app;
}
