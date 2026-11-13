import type { MiddlewareHandler } from "hono";
import { rateLimiter } from "hono-rate-limiter";
import { AuditUnavailable, type AuditIntent } from "../admin/audit.js";
import type { ApiAppOptions } from "../app/options.js";
import type { ApiRouterEnv } from "../routers/request.js";

export function auditMutations(options: ApiAppOptions): MiddlewareHandler<ApiRouterEnv> {
  const { audit, rateLimit } = options;
  const limitAdmission = rateLimit
    ? rateLimiter<ApiRouterEnv>({
        binding: {
          async limit({ key }) {
            return { success: await rateLimit(key, { window: 60, max: 60 }) };
          },
        },
        keyGenerator: (c) => `admin.audit:${c.get("auditActorId")}`,
        message: { code: "RATE_LIMITED", message: "Too many administration requests" },
      })
    : undefined;
  return async (c, next) => {
    const path = decodeURIComponent(c.req.path).replace(/\/+$/, "");
    // Audited RPC procedures declare `rpcAudit` on their contract; oRPC runs those.
    const action =
      c.req.method === "POST" && path === "/api/auth/admin/set-role" ? "user.role.update" : null;
    if (!action || !audit) return next();
    try {
      const session = await options.readSession(c.req.raw.headers);
      if (!session) return c.json({ code: "FORBIDDEN", message: "Access denied" }, 403);
      const actorId = session.user.id;
      const intent: AuditIntent = {
        action,
        actorId,
        source: "http",
        requestId: c.get("requestId"),
      };
      const auditRequest = async () => {
        await audit.run(intent, async () => {
          await next();
          return c.res;
        });
      };
      if (!limitAdmission) return await auditRequest();
      c.set("auditActorId", actorId);
      return await limitAdmission(c, auditRequest);
    } catch (error) {
      if (error instanceof AuditUnavailable)
        return c.json(
          { code: "AUDIT_UNAVAILABLE", message: "Administration audit is unavailable" },
          503,
        );
      throw error;
    }
  };
}
