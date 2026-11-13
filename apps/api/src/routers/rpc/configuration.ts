import { ConfigurationError } from "../../config/service.js";
import type { ConfigurationService } from "../../config/types.js";
import type { RpcContext } from "../../middleware/rpc.js";
import { ORPCError } from "@orpc/server";
import { hasPermission } from "@raypx/account/access";
import type { RpcBoundary } from "./boundary.js";
export function createConfigurationHandlers({
  os,
  requirePermission,
  withPermission,
  limitAccount,
  requireTrustedOrigin,
  options,
  access,
}: Pick<
  RpcBoundary,
  | "os"
  | "requirePermission"
  | "withPermission"
  | "limitAccount"
  | "requireTrustedOrigin"
  | "options"
  | "access"
>) {
  async function configurationCall<T>(
    context: RpcContext,
    run: (service: ConfigurationService) => Promise<T>,
  ) {
    if (!options.configuration) throw new ORPCError("SERVICE_UNAVAILABLE");
    try {
      return await run(options.configuration);
    } catch (error) {
      return configurationFailure(error, context);
    }
  }
  function configurationFailure(error: unknown, context: RpcContext): never {
    if (!(error instanceof ConfigurationError)) throw error;
    const status =
      error.code === "CONFIGURATION_CONFLICT"
        ? "CONFLICT"
        : error.code === "INVALID_INPUT" || error.code === "STORAGE_ENDPOINT_REQUIRES_OPERATOR"
          ? "BAD_REQUEST"
          : error.code === "UNAUTHORIZED" || error.code === "FORBIDDEN"
            ? error.code
            : "SERVICE_UNAVAILABLE";
    throw new ORPCError(status, {
      data: { error: { code: error.code }, requestId: context.requestId },
    });
  }

  const canUpdateConfiguration = withPermission("configuration.update");
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
    update: os.configuration.update
      .use(canUpdateConfiguration)
      .use(limitAccount({ procedure: "configuration.update", window: 60, max: 10 }))
      .use(requireTrustedOrigin)
      .handler(({ context, input }) =>
        configurationCall(context, (service) => service.update(input, context.auth)),
      ),
    storage: os.configuration.storage.handler(async ({ context }) => {
      await requirePermission(context, "configuration.read");
      if (!options.storageSettings) throw new ORPCError("SERVICE_UNAVAILABLE");
      try {
        return await options.storageSettings.read();
      } catch (error) {
        return configurationFailure(error, context);
      }
    }),
    updateStorage: os.configuration.updateStorage
      .use(canUpdateConfiguration)
      .use(limitAccount({ procedure: "configuration.updateStorage", window: 60, max: 10 }))
      .use(requireTrustedOrigin)
      .handler(async ({ context, input }) => {
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
    updateResend: os.configuration.updateResend
      .use(canUpdateConfiguration)
      .use(limitAccount({ procedure: "configuration.updateResend", window: 60, max: 10 }))
      .use(requireTrustedOrigin)
      .handler(async ({ context, input }) => {
        if (!options.resendSettings) throw new ORPCError("SERVICE_UNAVAILABLE");
        try {
          return await options.resendSettings.update(input);
        } catch (error) {
          return configurationFailure(error, context);
        }
      }),
  };
}
