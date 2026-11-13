import { ORPCError } from "@orpc/server";
import { SpaceMemoryError } from "@raypx/core/space-memory";
import { SpaceNotFound, type SpaceId } from "@raypx/core/spaces";
import type { SpaceScope } from "@raypx/spaces/server";
import type { AccountContext } from "../../middleware/rpc.js";
import type { RpcSetup } from "./setup.js";

export function createSpaceMemoryHandlers({
  os,
  options,
  withRpcPermission,
  requireTrustedOrigin,
  limitAccount,
}: RpcSetup) {
  async function scoped<T>(
    context: AccountContext,
    spaceId: SpaceId,
    operation: (scope: SpaceScope) => Promise<T>,
  ) {
    try {
      return await operation(await options.spaces.resolve(context.auth.user.id, spaceId));
    } catch (error) {
      if (error instanceof SpaceNotFound) throw new ORPCError("NOT_FOUND");
      if (!(error instanceof SpaceMemoryError)) throw error;
      const code = error.code === "MEMORY_NOT_FOUND" ? "NOT_FOUND" : "CONFLICT";
      throw new ORPCError(code, {
        data: { error: { code: error.code }, requestId: context.requestId },
      });
    }
  }
  const read = withRpcPermission({ window: 60, max: 60 });
  const write = withRpcPermission();
  const quota = limitAccount({ window: 60, max: 30 });
  return {
    list: os.spaceMemory.list.use(read).handler(({ context, input }) => {
      const { spaceId, ...filters } = input;
      return scoped(context, spaceId, (scope) =>
        options.spaceMemory.list(scope, {
          includeRemoved: filters.includeRemoved,
          limit: filters.limit,
          ...(filters.agentId ? { agentId: filters.agentId } : {}),
          ...(filters.scope ? { scope: filters.scope } : {}),
        }),
      );
    }),
    get: os.spaceMemory.get
      .use(read)
      .handler(({ context, input }) =>
        scoped(context, input.spaceId, (scope) => options.spaceMemory.get(scope, input.id)),
      ),
    history: os.spaceMemory.history
      .use(read)
      .handler(({ context, input }) =>
        scoped(context, input.spaceId, (scope) =>
          options.spaceMemory.history(scope, input.id, input.limit),
        ),
      ),
    create: os.spaceMemory.create
      .use(write)
      .use(requireTrustedOrigin)
      .use(quota)
      .handler(({ context, input }) =>
        scoped(context, input.spaceId, (scope) =>
          options.spaceMemory.create(scope, input.document),
        ),
      ),
    update: os.spaceMemory.update
      .use(write)
      .use(requireTrustedOrigin)
      .use(quota)
      .handler(({ context, input }) =>
        scoped(context, input.spaceId, (scope) =>
          options.spaceMemory.update(scope, input.id, input.expectedRevision, input.document),
        ),
      ),
    remove: os.spaceMemory.remove
      .use(write)
      .use(requireTrustedOrigin)
      .use(quota)
      .handler(({ context, input }) =>
        scoped(context, input.spaceId, (scope) =>
          options.spaceMemory.remove(scope, input.id, input.expectedRevision),
        ),
      ),
    restore: os.spaceMemory.restore
      .use(write)
      .use(requireTrustedOrigin)
      .use(quota)
      .handler(({ context, input }) =>
        scoped(context, input.spaceId, (scope) =>
          options.spaceMemory.restore(scope, input.id, input.expectedRevision, input.revision),
        ),
      ),
  };
}
