import { ORPCError } from "@orpc/server";
import { hasPermission } from "@raypx/account/access";
import type { RpcBoundary } from "./boundary.js";
export function createConfigurationHandlers({
  os,
  configurationCall,
  configurationFailure,
  requirePermission,
  options,
  allowedOrigins,
  access,
}: Pick<
  RpcBoundary,
  | "os"
  | "configurationCall"
  | "configurationFailure"
  | "requirePermission"
  | "options"
  | "allowedOrigins"
  | "access"
>) {
  function requireOrigin({ headers, requestId }: { headers: Headers; requestId: string }) {
    const origin = headers.get("origin");
    if (!origin || !allowedOrigins.includes(origin))
      throw new ORPCError("FORBIDDEN", {
        data: { error: { code: "ORIGIN_REJECTED" }, requestId },
      });
  }
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
          mailConfigured: (await options.mailAvailable?.()) ?? false,
        },
      }));
    }),
    update: os.configuration.update.handler(async ({ context, input }) => {
      const auth = await requirePermission(context, "configuration.update", "configuration.update");
      requireOrigin(context);
      return configurationCall(context, (service) => service.update(input, auth));
    }),
    storage: os.configuration.storage.handler(async ({ context }) => {
      await requirePermission(context, "configuration.read");
      if (!options.storageSettings) throw new ORPCError("SERVICE_UNAVAILABLE");
      try {
        return await options.storageSettings.read();
      } catch (error) {
        return configurationFailure(error, context);
      }
    }),
    updateStorage: os.configuration.updateStorage.handler(async ({ context, input }) => {
      await requirePermission(context, "configuration.update", "configuration.updateStorage");
      requireOrigin(context);
      if (!options.storageSettings) throw new ORPCError("SERVICE_UNAVAILABLE");
      try {
        return await options.storageSettings.update(input);
      } catch (error) {
        return configurationFailure(error, context);
      }
    }),
    resend: os.configuration.resend.handler(async ({ context }) => {
      await requirePermission(context, "configuration.read");
      if (!options.resendSettings) throw new ORPCError("SERVICE_UNAVAILABLE");
      try {
        return await options.resendSettings.read();
      } catch (error) {
        return configurationFailure(error, context);
      }
    }),
    updateResend: os.configuration.updateResend.handler(async ({ context, input }) => {
      await requirePermission(context, "configuration.update", "configuration.updateResend");
      requireOrigin(context);
      if (!options.resendSettings) throw new ORPCError("SERVICE_UNAVAILABLE");
      try {
        return await options.resendSettings.update(input);
      } catch (error) {
        return configurationFailure(error, context);
      }
    }),
  };
}
