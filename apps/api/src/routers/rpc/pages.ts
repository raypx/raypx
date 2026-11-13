import { ORPCError } from "@orpc/server";
import { PageError } from "@raypx/core/pages";
import { SpaceNotFound, type SpaceId } from "@raypx/core/spaces";
import type { SpaceScope } from "@raypx/spaces/server";
import type { AccountContext } from "../../middleware/rpc.js";
import type { RpcSetup } from "./setup.js";

export function createPagesHandlers({
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
      if (!(error instanceof PageError)) throw error;
      const status = error.code === "PAGE_NOT_FOUND" ? "NOT_FOUND" : "CONFLICT";
      throw new ORPCError(status, {
        data: { error: { code: error.code }, requestId: context.requestId },
      });
    }
  }
  const read = withRpcPermission({ window: 60, max: 60 });
  const write = withRpcPermission();
  const quota = limitAccount({ window: 60, max: 30 });
  return {
    list: os.pages.list.use(read).handler(({ context, input }) =>
      scoped(context, input.spaceId, (scope) =>
        options.pages.list(scope, {
          limit: input.limit,
          ...(input.agentId ? { agentId: input.agentId } : {}),
        }),
      ),
    ),
    get: os.pages.get
      .use(read)
      .handler(({ context, input }) =>
        scoped(context, input.spaceId, (scope) =>
          options.pages.get(scope, input.id, input.version),
        ),
      ),
    versions: os.pages.versions
      .use(read)
      .handler(({ context, input }) =>
        scoped(context, input.spaceId, (scope) =>
          options.pages.versions(scope, input.id, input.limit),
        ),
      ),
    shareLinks: os.pages.shareLinks
      .use(read)
      .handler(({ context, input }) =>
        scoped(context, input.spaceId, (scope) => options.pages.shareLinks(scope, input.id)),
      ),
    create: os.pages.create
      .use(write)
      .use(requireTrustedOrigin)
      .use(quota)
      .handler(({ context, input }) =>
        scoped(context, input.spaceId, (scope) => options.pages.create(scope, input.page)),
      ),
    update: os.pages.update
      .use(write)
      .use(requireTrustedOrigin)
      .use(quota)
      .handler(({ context, input }) =>
        scoped(context, input.spaceId, (scope) =>
          options.pages.update(scope, input.id, input.expectedVersion, input.body),
        ),
      ),
    rename: os.pages.rename
      .use(write)
      .use(requireTrustedOrigin)
      .use(quota)
      .handler(({ context, input }) =>
        scoped(context, input.spaceId, (scope) =>
          options.pages.rename(scope, input.id, input.expectedVersion, input.title),
        ),
      ),
    delete: os.pages.delete
      .use(write)
      .use(requireTrustedOrigin)
      .use(quota)
      .handler(({ context, input }) =>
        scoped(context, input.spaceId, (scope) =>
          options.pages.delete(scope, input.id, input.expectedVersion),
        ),
      ),
    restore: os.pages.restore
      .use(write)
      .use(requireTrustedOrigin)
      .use(quota)
      .handler(({ context, input }) =>
        scoped(context, input.spaceId, (scope) =>
          options.pages.restore(scope, input.id, input.expectedVersion, input.version),
        ),
      ),
    createShareLink: os.pages.createShareLink
      .use(write)
      .use(requireTrustedOrigin)
      .use(quota)
      .handler(({ context, input }) =>
        scoped(context, input.spaceId, (scope) =>
          options.pages.createShareLink(scope, input.id, input.version, input.expiresAt),
        ),
      ),
    revokeShareLink: os.pages.revokeShareLink
      .use(write)
      .use(requireTrustedOrigin)
      .use(quota)
      .handler(({ context, input }) =>
        scoped(context, input.spaceId, (scope) =>
          options.pages.revokeShareLinks(scope, input.id, input.linkId),
        ),
      ),
    revokeShareLinks: os.pages.revokeShareLinks
      .use(write)
      .use(requireTrustedOrigin)
      .use(quota)
      .handler(({ context, input }) =>
        scoped(context, input.spaceId, (scope) => options.pages.revokeShareLinks(scope, input.id)),
      ),
  };
}
