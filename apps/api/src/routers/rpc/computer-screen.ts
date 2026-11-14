import { ORPCError } from "@orpc/server";
import { ComputerScreenError } from "@raypx/computers/server";
import { SpaceNotFound } from "@raypx/core/spaces";
import type { SpaceScope } from "@raypx/spaces/server";
import type { AccountContext } from "../../middleware/rpc.js";
import type { RpcSetup } from "./setup.js";

export function createComputerScreenHandlers({
  os,
  options,
  withRpcPermission,
  requireTrustedOrigin,
  limitAccount,
}: RpcSetup) {
  async function scoped<T>(
    context: AccountContext,
    spaceId: SpaceScope["spaceId"],
    run: (scope: SpaceScope) => Promise<T>,
  ) {
    try {
      return await run(await options.spaces.resolve(context.auth.user.id, spaceId));
    } catch (error) {
      if (error instanceof SpaceNotFound) throw new ORPCError("NOT_FOUND");
      if (error instanceof ComputerScreenError) {
        const status = {
          SCREEN_UNAVAILABLE: "SERVICE_UNAVAILABLE",
          SCREEN_NOT_RUNNING: "CONFLICT",
          SCREEN_CONTROL_HELD: "CONFLICT",
          SCREEN_CONTROL_REQUIRED: "FORBIDDEN",
          SCREEN_OWNER_REQUIRED: "FORBIDDEN",
          SCREEN_INVALID_INPUT: "BAD_REQUEST",
        } as const;
        throw new ORPCError(status[error.code], {
          data: { error: { code: error.code }, requestId: context.requestId },
        });
      }
      throw error;
    }
  }
  const write = withRpcPermission();
  const quota = limitAccount({ window: 60, max: 60 });
  return {
    screenAvailability: os.computers.screenAvailability
      .use(withRpcPermission({ window: 60, max: 60 }))
      .handler(({ context, input }) =>
        scoped(context, input.spaceId, (scope) => options.computerScreens.availability(scope)),
      ),
    startScreen: os.computers.startScreen
      .use(write)
      .use(requireTrustedOrigin)
      .use(quota)
      .handler(({ context, input }) =>
        scoped(context, input.spaceId, (scope) => options.computerScreens.start(scope)),
      ),
    stopScreen: os.computers.stopScreen
      .use(write)
      .use(requireTrustedOrigin)
      .use(quota)
      .handler(({ context, input }) =>
        scoped(context, input.spaceId, (scope) => options.computerScreens.stop(scope)),
      ),
    acquireControl: os.computers.acquireControl
      .use(write)
      .use(requireTrustedOrigin)
      .use(quota)
      .handler(({ context, input }) =>
        scoped(context, input.spaceId, (scope) =>
          options.computerScreens.acquire(scope, input.viewerId),
        ),
      ),
    renewControl: os.computers.renewControl
      .use(write)
      .use(requireTrustedOrigin)
      .use(quota)
      .handler(({ context, input }) =>
        scoped(context, input.spaceId, (scope) =>
          options.computerScreens.renew(scope, input.grantId),
        ),
      ),
    releaseControl: os.computers.releaseControl
      .use(write)
      .use(requireTrustedOrigin)
      .use(quota)
      .handler(({ context, input }) =>
        scoped(context, input.spaceId, (scope) =>
          options.computerScreens.release(scope, input.grantId),
        ),
      ),
    forceReleaseControl: os.computers.forceReleaseControl
      .use(write)
      .use(requireTrustedOrigin)
      .use(quota)
      .handler(({ context, input }) =>
        scoped(context, input.spaceId, (scope) => options.computerScreens.forceRelease(scope)),
      ),
    screenInput: os.computers.screenInput
      .use(write)
      .use(requireTrustedOrigin)
      .use(limitAccount({ window: 60, max: 600 }))
      .handler(({ context, input }) =>
        scoped(context, input.spaceId, async (scope) => {
          await options.computerScreens.input(scope, input.grantId, input.input);
          return { accepted: true as const };
        }),
      ),
  };
}
