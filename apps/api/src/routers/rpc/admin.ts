import { ORPCError } from "@orpc/server";
import type { RpcSetup } from "./setup.js";
import type { ReadReadiness } from "../../app/readiness.js";

export function createAdministrationHandlers(
  {
    os,
    options,
    withRpcPermission,
    requireTrustedOrigin,
  }: Pick<RpcSetup, "os" | "options" | "withRpcPermission" | "requireTrustedOrigin">,
  readReadiness: ReadReadiness,
) {
  return {
    issuePasswordReset: os.admin.issuePasswordReset
      .use(withRpcPermission({ window: 60, max: 3 }))
      .use(requireTrustedOrigin)
      .handler(async ({ context, input }) => {
        if (!options.passwordResetLinks) throw new ORPCError("SERVICE_UNAVAILABLE");
        return options.passwordResetLinks(context.auth.user.id, input.userId);
      }),
    overview: os.admin.overview
      .use(withRpcPermission({ window: 60, max: 60 }))
      .handler(async ({ input }) => {
        try {
          return await options.administration.overview(input.days);
        } catch {
          throw new ORPCError("SERVICE_UNAVAILABLE");
        }
      }),
    health: os.admin.health.use(withRpcPermission({ window: 60, max: 60 })).handler(async () => {
      const checks = await readReadiness();
      return {
        observedAt: new Date().toISOString(),
        checks: {
          database: checks.database ?? ("not-configured" as const),
          redis: checks.redis ?? ("not-configured" as const),
          relay: checks.relay ?? ("not-configured" as const),
        },
      };
    }),
    audit: os.admin.audit
      .use(withRpcPermission({ window: 60, max: 60 }))
      .handler(async ({ input }) => {
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
