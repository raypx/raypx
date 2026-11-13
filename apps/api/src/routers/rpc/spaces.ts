import { ComputerFilesError, ComputerOperationError } from "@raypx/computers/server";
import { InvalidConversationCursor } from "@raypx/core/conversation";
import { ORPCError } from "@orpc/server";
import { SpaceNotFound, type SpaceId } from "@raypx/core/spaces";
import type { SpaceScope } from "@raypx/spaces/server";
import type { AccountContext } from "../../middleware/rpc.js";
import type { RpcSetup } from "./setup.js";

export function createSpaceHandlers({
  os,
  options,
  withRpcPermission,
  requireTrustedOrigin,
  limitAccount,
}: RpcSetup) {
  async function call<T>(context: AccountContext, run: () => Promise<T>) {
    try {
      return await run();
    } catch (error) {
      if (error instanceof ComputerFilesError)
        throw new ORPCError(error.code === "FILE_NOT_FOUND" ? "NOT_FOUND" : "BAD_REQUEST", {
          data: { error: { code: error.code }, requestId: context.requestId },
        });
      if (error instanceof ComputerOperationError)
        throw new ORPCError("CONFLICT", { message: error.code });
      if (error instanceof InvalidConversationCursor) throw new ORPCError("BAD_REQUEST");
      if (!(error instanceof SpaceNotFound)) throw error;
      throw new ORPCError("NOT_FOUND", {
        data: { error: { code: "NOT_FOUND" }, requestId: context.requestId },
      });
    }
  }
  function scoped<T>(
    context: AccountContext,
    requested: SpaceId,
    run: (scope: SpaceScope) => Promise<T>,
  ) {
    return call(context, async () =>
      run(await options.spaces.resolve(context.auth.user.id, requested)),
    );
  }
  const read = withRpcPermission({ window: 60, max: 60 });
  const write = withRpcPermission();
  const quota = limitAccount({ window: 60, max: 30 });
  return {
    computers: {
      get: os.computers.get
        .use(read)
        .handler(({ context, input }) =>
          scoped(context, input.spaceId, (scope) => options.computers.get(scope)),
        ),
      listDirectory: os.computers.listDirectory
        .use(read)
        .handler(({ context, input }) =>
          scoped(context, input.spaceId, (scope) =>
            options.computers.listDirectory(scope, input.path, input.limit),
          ),
        ),
      readFile: os.computers.readFile
        .use(read)
        .handler(({ context, input }) =>
          scoped(context, input.spaceId, (scope) =>
            options.computers.readFile(scope, input.path, input.maxBytes),
          ),
        ),
      start: os.computers.start
        .use(write)
        .use(requireTrustedOrigin)
        .use(quota)
        .handler(({ context, input }) =>
          scoped(context, input.spaceId, (scope) => options.computers.start(scope)),
        ),
      stop: os.computers.stop
        .use(write)
        .use(requireTrustedOrigin)
        .use(quota)
        .handler(({ context, input }) =>
          scoped(context, input.spaceId, (scope) => options.computers.stop(scope)),
        ),
    },
    conversations: {
      stop: os.conversations.stop
        .use(write)
        .use(requireTrustedOrigin)
        .use(quota)
        .handler(({ context, input }) =>
          scoped(context, input.spaceId, (scope) =>
            options.conversations.stop(scope, input.conversationId, input.runId),
          ),
        ),
      send: os.conversations.send
        .use(write)
        .use(requireTrustedOrigin)
        .use(quota)
        .handler(({ context, input }) =>
          scoped(context, input.spaceId, (scope) =>
            options.conversations.send(scope, input.conversationId, input.message),
          ),
        ),
      events: os.conversations.events
        .use(read)
        .handler(({ context, input }) =>
          scoped(context, input.spaceId, (scope) =>
            options.conversations.events(scope, input.conversationId, input.after, input.limit),
          ),
        ),
      snapshot: os.conversations.snapshot
        .use(read)
        .handler(({ context, input }) =>
          scoped(context, input.spaceId, (scope) =>
            options.conversations.snapshot(scope, input.conversationId),
          ),
        ),
    },
    spaces: {
      list: os.spaces.list
        .use(read)
        .handler(({ context }) => call(context, () => options.spaces.list(context.auth.user.id))),
      create: os.spaces.create
        .use(write)
        .use(requireTrustedOrigin)
        .use(quota)
        .handler(({ context, input }) =>
          call(context, () => options.spaces.create(context.auth.user.id, input)),
        ),
    },
    agents: {
      models: os.agents.models
        .use(read)
        .handler(({ context, input }) =>
          scoped(context, input.spaceId, (scope) => options.conversationModels.list(scope)),
        ),
      list: os.agents.list
        .use(read)
        .handler(({ context, input }) =>
          scoped(context, input.spaceId, (scope) => options.agents.list(scope, input.limit)),
        ),
      get: os.agents.get
        .use(read)
        .handler(({ context, input }) =>
          scoped(context, input.spaceId, (scope) => options.agents.get(scope, input.id)),
        ),
      create: os.agents.create
        .use(write)
        .use(requireTrustedOrigin)
        .use(quota)
        .handler(({ context, input }) =>
          scoped(context, input.spaceId, (scope) => options.agents.create(scope, input.agent)),
        ),
      update: os.agents.update
        .use(write)
        .use(requireTrustedOrigin)
        .use(quota)
        .handler(({ context, input }) =>
          scoped(context, input.spaceId, (scope) =>
            options.agents.update(scope, input.id, input.agent),
          ),
        ),
      delete: os.agents.delete
        .use(write)
        .use(requireTrustedOrigin)
        .use(quota)
        .handler(({ context, input }) =>
          scoped(context, input.spaceId, (scope) => options.agents.delete(scope, input.id)),
        ),
    },
  };
}
