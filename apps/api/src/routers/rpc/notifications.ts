import { ORPCError } from "@orpc/server";
import { SpaceNotFound } from "@raypx/core/spaces";
import type { RpcSetup } from "./setup.js";
export function createNotificationsHandlers(setup: RpcSetup) {
  const { os, options, withRpcPermission, requireTrustedOrigin, limitAccount } = setup;
  const read = withRpcPermission({ window: 60, max: 60 });
  const write = withRpcPermission();
  const quota = limitAccount({ window: 60, max: 60 });
  async function call<T>(operation: () => Promise<T>) {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof SpaceNotFound) throw new ORPCError("NOT_FOUND");
      throw error;
    }
  }
  return {
    list: os.notifications.list
      .use(read)
      .handler(({ context }) => options.notifications.list(context.auth.user.id)),
    read: os.notifications.read
      .use(write)
      .use(requireTrustedOrigin)
      .use(quota)
      .handler(({ context, input }) =>
        call(() => options.notifications.read(context.auth.user.id, input)),
      ),
    viewed: os.notifications.viewed
      .use(write)
      .use(requireTrustedOrigin)
      .use(quota)
      .handler(({ context, input }) =>
        call(async () =>
          options.notifications.viewed(
            await options.spaces.resolve(context.auth.user.id, input.spaceId),
            input.conversationId,
          ),
        ),
      ),
  };
}
