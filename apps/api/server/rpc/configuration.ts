import { ORPCError } from "@orpc/server";
import { hasPermission } from "@raypx/account/access";
import type { RpcBoundary } from "./boundary.ts";
export function createConfigurationHandlers({
  os,
  configurationCall,
  requirePermission,
  options,
  allowedOrigins,
  access,
}: Pick<
  RpcBoundary,
  "os" | "configurationCall" | "requirePermission" | "options" | "allowedOrigins" | "access"
>) {
  return {
    public: os.configuration.public.handler(({ context }) =>
      configurationCall(context, async (service) => {
        const { values } = await service.readCached();
        return { siteName: values.siteName, registrationEnabled: values.registrationEnabled };
      }),
    ),
    access: os.configuration.access.handler(async ({ context }) => ({
      allowed: hasPermission(
        access(await options.readSession(context.headers)),
        "configuration.read",
      ),
    })),
    get: os.configuration.get.handler(async ({ context }) => {
      await requirePermission(context, "configuration.read");
      return configurationCall(context, async (service) => ({
        ...(await service.read()),
        deployment: {
          jobsEnabled: options.jobsEnabled ?? false,
          mailConfigured: options.mailAvailable ?? false,
        },
      }));
    }),
    update: os.configuration.update.handler(async ({ context, input }) => {
      const auth = await requirePermission(context, "configuration.update", "configuration.update");
      // Cookie-authenticated writes require an explicit trusted browser origin.
      const origin = context.headers.get("origin");
      if (!origin || !allowedOrigins.includes(origin))
        throw new ORPCError("FORBIDDEN", {
          data: { error: { code: "ORIGIN_REJECTED" }, requestId: context.requestId },
        });
      return configurationCall(context, (service) => service.update(input, auth));
    }),
  };
}
