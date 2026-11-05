import { ORPCError } from "@orpc/server";
import type { RpcBoundary } from "./boundary.ts";
import { checkReadiness } from "../app/readiness.ts";

export function createAdministrationHandlers({
  os,
  options,
  requirePermission,
}: Pick<RpcBoundary, "os" | "options" | "requirePermission">) {
  return {
    overview: os.admin.overview.handler(async ({ context, input }) => {
      await requirePermission(context, "admin.read", "admin.overview");
      if (!options.administration) throw new ORPCError("SERVICE_UNAVAILABLE");
      try {
        return await options.administration.overview(input.days);
      } catch {
        throw new ORPCError("SERVICE_UNAVAILABLE");
      }
    }),
    health: os.admin.health.handler(async ({ context }) => {
      await requirePermission(context, "admin.read", "admin.health");
      const checks = await checkReadiness(options.readiness ?? {});
      return {
        observedAt: new Date().toISOString(),
        checks: {
          database: checks.database ?? ("not-configured" as const),
          redis: checks.redis ?? ("not-configured" as const),
          relay: checks.relay ?? ("not-configured" as const),
        },
      };
    }),
    audit: os.admin.audit.handler(async ({ context, input }) => {
      await requirePermission(context, "audit.read", "admin.audit");
      if (!options.administration) throw new ORPCError("SERVICE_UNAVAILABLE");
      try {
        return await options.administration.list(input);
      } catch (error) {
        throw new ORPCError(
          error instanceof Error && error.message === "INVALID_INPUT"
            ? "BAD_REQUEST"
            : "SERVICE_UNAVAILABLE",
        );
      }
    }),
  };
}
