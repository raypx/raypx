import { ORPCError } from "@orpc/server";
import { SpaceNotFound, type SpaceId } from "@raypx/core/spaces";
import type { SpaceScope } from "@raypx/spaces/server";
import type { AccountContext } from "../../middleware/rpc.js";
import { McpServerError } from "../../conversations/mcp-servers.js";
import type { RpcSetup } from "./setup.js";

export function createMcpServersHandlers({
  os,
  options,
  withRpcPermission,
  requireTrustedOrigin,
  limitAccount,
}: RpcSetup) {
  const read = withRpcPermission({ window: 60, max: 60 });
  const write = withRpcPermission();
  const quota = limitAccount({ window: 60, max: 30 });
  async function perform<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof SpaceNotFound) throw new ORPCError("NOT_FOUND");
      if (error instanceof McpServerError)
        throw new ORPCError(error.code === "NOT_FOUND" ? "NOT_FOUND" : "BAD_REQUEST", {
          message: error.code,
          data: { error: { code: error.code } },
        });
      throw new ORPCError("INTERNAL_SERVER_ERROR", { message: "MCP_OPERATION_FAILED" });
    }
  }
  async function scoped<T>(
    context: AccountContext,
    spaceId: SpaceId,
    operation: (scope: SpaceScope) => Promise<T>,
  ): Promise<T> {
    return perform(async () =>
      operation(await options.spaces.resolve(context.auth.user.id, spaceId)),
    );
  }
  return {
    list: os.mcpServers.list
      .use(read)
      .handler(({ context }) => perform(() => options.mcpServers.list(context.auth.user.id))),
    create: os.mcpServers.create
      .use(write)
      .use(requireTrustedOrigin)
      .use(quota)
      .handler(({ context, input }) =>
        perform(() =>
          options.mcpServers.create(context.auth.user.id, input.server, input.credentialHeaders),
        ),
      ),
    update: os.mcpServers.update
      .use(write)
      .use(requireTrustedOrigin)
      .use(quota)
      .handler(({ context, input }) =>
        perform(() =>
          options.mcpServers.update(
            context.auth.user.id,
            input.id,
            input.server,
            input.credentialHeaders,
          ),
        ),
      ),
    delete: os.mcpServers.delete
      .use(write)
      .use(requireTrustedOrigin)
      .use(quota)
      .handler(({ context, input }) =>
        perform(() => options.mcpServers.delete(context.auth.user.id, input.id)),
      ),
    test: os.mcpServers.test
      .use(write)
      .use(requireTrustedOrigin)
      .use(quota)
      .handler(({ context, input }) =>
        perform(() => options.mcpServers.test(context.auth.user.id, input.id)),
      ),
    setAvailability: os.mcpServers.setAvailability
      .use(write)
      .use(requireTrustedOrigin)
      .use(quota)
      .handler(({ context, input }) =>
        perform(() =>
          options.mcpServers.setAvailability(context.auth.user.id, input.id, input.availability),
        ),
      ),
    enabled: os.mcpServers.enabled
      .use(read)
      .handler(({ context, input }) =>
        scoped(context, input.spaceId, (scope) => options.mcpServers.enabled(scope, input.agentId)),
      ),
    setEnabled: os.mcpServers.setEnabled
      .use(write)
      .use(requireTrustedOrigin)
      .use(quota)
      .handler(({ context, input }) =>
        scoped(context, input.spaceId, (scope) =>
          options.mcpServers.setEnabled(scope, input.agentId, input.serverIds),
        ),
      ),
  };
}
