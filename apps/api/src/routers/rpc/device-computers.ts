import { ORPCError } from "@orpc/server";
import { DeviceComputerError } from "@raypx/computers/server";
import { SpaceNotFound, type SpaceId } from "@raypx/core/spaces";
import type { SpaceScope } from "@raypx/spaces/server";
import type { AccountContext } from "../../middleware/rpc.js";
import type { RpcSetup } from "./setup.js";
export function createDeviceComputersHandlers(setup: RpcSetup) {
  const { os, options, withRpcPermission, requireTrustedOrigin, limitAccount } = setup;
  const read = withRpcPermission({ window: 60, max: 60 });
  const write = withRpcPermission();
  const quota = limitAccount({ window: 60, max: 20 });
  async function scoped<T>(
    context: AccountContext,
    id: SpaceId,
    operation: (scope: SpaceScope) => Promise<T>,
  ) {
    try {
      return await operation(await options.spaces.resolve(context.auth.user.id, id));
    } catch (error) {
      if (error instanceof SpaceNotFound) throw new ORPCError("NOT_FOUND");
      if (!(error instanceof DeviceComputerError)) throw error;
      let status: "NOT_FOUND" | "CONFLICT" | "FORBIDDEN" = "CONFLICT";
      if (error.code === "NOT_FOUND") status = "NOT_FOUND";
      else if (error.code === "ACCESS_DENIED") status = "FORBIDDEN";
      throw new ORPCError(status, {
        data: { error: { code: error.code }, requestId: context.requestId },
      });
    }
  }
  return {
    list: os.deviceComputers.list
      .use(read)
      .handler(({ context, input }) =>
        scoped(context, input.spaceId, (scope) => options.deviceComputers.list(scope)),
      ),
    createPairing: os.deviceComputers.createPairing
      .use(write)
      .use(requireTrustedOrigin)
      .use(quota)
      .handler(({ context, input }) =>
        scoped(context, input.spaceId, (scope) => options.deviceComputers.createPairing(scope)),
      ),
    requestGrant: os.deviceComputers.requestGrant
      .use(write)
      .use(requireTrustedOrigin)
      .use(quota)
      .handler(({ context, input }) =>
        scoped(context, input.spaceId, (scope) =>
          options.deviceComputers.requestGrant(scope, input.deviceId),
        ),
      ),
    revokeGrant: os.deviceComputers.revokeGrant
      .use(write)
      .use(requireTrustedOrigin)
      .use(quota)
      .handler(({ context, input }) =>
        scoped(context, input.spaceId, (scope) =>
          options.deviceComputers.revokeGrant(scope, input.deviceId, input.grantId),
        ),
      ),
    revoke: os.deviceComputers.revoke
      .use(write)
      .use(requireTrustedOrigin)
      .use(quota)
      .handler(({ context, input }) =>
        scoped(context, input.spaceId, (scope) =>
          options.deviceComputers.revoke(scope, input.deviceId),
        ),
      ),
    getSelection: os.deviceComputers.getSelection
      .use(read)
      .handler(({ context, input }) =>
        scoped(context, input.spaceId, (scope) =>
          options.deviceComputers.getSelection(scope, input.conversationId),
        ),
      ),
    select: os.deviceComputers.select
      .use(write)
      .use(requireTrustedOrigin)
      .use(quota)
      .handler(({ context, input }) =>
        scoped(context, input.spaceId, (scope) =>
          options.deviceComputers.select(scope, input.conversationId, input.selection),
        ),
      ),
  };
}
