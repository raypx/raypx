import { ConfigurationError } from "../../config/service.js";
import type { ConfigurationService } from "../../config/types.js";
import type { RpcContext } from "../../middleware/rpc.js";
import { ORPCError } from "@orpc/server";
import { hasPermission } from "@raypx/account/access";
import type { RpcBoundary } from "./boundary.js";
export function createConfigurationHandlers({
  os,
  withRpcPermission,
  withPublicRpcAccess,
  requireTrustedOrigin,
  options,
  access,
}: Pick<
  RpcBoundary,
  "os" | "withRpcPermission" | "withPublicRpcAccess" | "requireTrustedOrigin" | "options" | "access"
>) {
  async function configurationCall<T>(
    context: RpcContext,
    run: (service: ConfigurationService) => Promise<T>,
  ) {
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

  const canReadConfiguration = withRpcPermission();
  return {
    public: os.configuration.public.use(withPublicRpcAccess).handler(({ context }) =>
      configurationCall(context, async (service) => {
        const { values } = await service.readCached();
        return { siteName: values.siteName, registrationEnabled: values.registrationEnabled };
      }),
    ),
    access: os.configuration.access.use(withPublicRpcAccess).handler(async ({ context }) => ({
      allowed: hasPermission(
        access(await options.readSession(context.headers)),
        "configuration.read",
      ),
    })),
    get: os.configuration.get.use(canReadConfiguration).handler(async ({ context }) => {
      return configurationCall(context, async (service) => ({
        ...(await service.read()),
        deployment: {
          jobsEnabled: options.jobsEnabled ?? false,
          mailConfigured: (await options.mailAvailable?.()) ?? false,
        },
      }));
    }),
    update: os.configuration.update
      .use(withRpcPermission({ window: 60, max: 10 }))
      .use(requireTrustedOrigin)
      .handler(({ context, input }) =>
        configurationCall(context, (service) => service.update(input, context.auth)),
      ),
    storage: os.configuration.storage.use(canReadConfiguration).handler(async ({ context }) => {
      try {
        return await options.storageSettings.read();
      } catch (error) {
        return configurationFailure(error, context);
      }
    }),
    updateStorage: os.configuration.updateStorage
      .use(withRpcPermission({ window: 60, max: 10 }))
      .use(requireTrustedOrigin)
      .handler(async ({ context, input }) => {
        try {
          return await options.storageSettings.update(input);
        } catch (error) {
          return configurationFailure(error, context);
        }
      }),
    resend: os.configuration.resend.use(canReadConfiguration).handler(async ({ context }) => {
      try {
        return await options.resendSettings.read();
      } catch (error) {
        return configurationFailure(error, context);
      }
    }),
    updateResend: os.configuration.updateResend
      .use(withRpcPermission({ window: 60, max: 10 }))
      .use(requireTrustedOrigin)
      .handler(async ({ context, input }) => {
        try {
          return await options.resendSettings.update(input);
        } catch (error) {
          return configurationFailure(error, context);
        }
      }),
  };
}
