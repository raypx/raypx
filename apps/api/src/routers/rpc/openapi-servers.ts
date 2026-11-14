import { ORPCError } from "@orpc/server";
import { SpaceNotFound, type SpaceId } from "@raypx/core/spaces";
import type { SpaceScope } from "@raypx/spaces/server";
import type { AccountContext } from "../../middleware/rpc.js";
import { OpenApiServerError } from "../../conversations/openapi-servers.js";
import type { RpcSetup } from "./setup.js";
export function createOpenApiServersHandlers({
  os,
  options,
  withRpcPermission,
  requireTrustedOrigin,
  limitAccount,
}: RpcSetup) {
  const read = withRpcPermission({ window: 60, max: 60 });
  const write = withRpcPermission();
  const quota = limitAccount({ window: 60, max: 30 });
  async function scoped<T>(
    context: AccountContext,
    spaceId: SpaceId,
    operation: (scope: SpaceScope) => Promise<T>,
  ): Promise<T> {
    try {
      return await operation(await options.spaces.resolve(context.auth.user.id, spaceId));
    } catch (error) {
      if (error instanceof SpaceNotFound) throw new ORPCError("NOT_FOUND");
      if (error instanceof OpenApiServerError)
        throw new ORPCError(error.code === "NOT_FOUND" ? "NOT_FOUND" : "BAD_REQUEST", {
          message: error.code,
          data: { error: { code: error.code } },
        });
      throw new ORPCError("INTERNAL_SERVER_ERROR", { message: "OPENAPI_OPERATION_FAILED" });
    }
  }
  return {
    list: os.openApiServers.list
      .use(read)
      .handler(({ context, input }) =>
        scoped(context, input.spaceId, (scope) => options.openApiServers.list(scope)),
      ),
    create: os.openApiServers.create
      .use(write)
      .use(requireTrustedOrigin)
      .use(quota)
      .handler(({ context, input }) =>
        scoped(context, input.spaceId, (scope) =>
          options.openApiServers.create(scope, input.server, input.source, input.credential),
        ),
      ),
    update: os.openApiServers.update
      .use(write)
      .use(requireTrustedOrigin)
      .use(quota)
      .handler(({ context, input }) =>
        scoped(context, input.spaceId, (scope) =>
          options.openApiServers.update(scope, input.id, input.server, input.credential),
        ),
      ),
    delete: os.openApiServers.delete
      .use(write)
      .use(requireTrustedOrigin)
      .use(quota)
      .handler(({ context, input }) =>
        scoped(context, input.spaceId, (scope) => options.openApiServers.delete(scope, input.id)),
      ),
    test: os.openApiServers.test
      .use(write)
      .use(requireTrustedOrigin)
      .use(quota)
      .handler(({ context, input }) =>
        scoped(context, input.spaceId, (scope) => options.openApiServers.test(scope, input.id)),
      ),
  };
}
