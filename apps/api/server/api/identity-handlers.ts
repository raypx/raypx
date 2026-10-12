import type { CreateApiRouterOptions } from "./api-types.js";
import type { RouterContext } from "./router-context.js";
import { createApiError } from "./canonical-errors.js";
export function createIdentityHandlers(
  { os, requirePermission, call }: RouterContext,
  options: CreateApiRouterOptions,
) {
  return {
    users: {
      list: os.admin.users.list.use(requirePermission("admin.users.read")).handler(({ input }) =>
        options.modules.users.list({
          limit: input.limit,
          ...(input.role ? { role: input.role } : {}),
          ...(input.status ? { status: input.status } : {}),
          ...(input.query ? { query: input.query } : {}),
          ...(input.cursor ? { cursor: input.cursor } : {}),
        }),
      ),
      get: os.admin.users.get
        .use(requirePermission("admin.users.read"))
        .handler(async ({ input }) => {
          const user = await options.modules.users.get(input.userId);
          if (!user) throw createApiError("NOT_FOUND", "USER_NOT_FOUND");
          return user;
        }),
      updateStatus: os.admin.users.updateStatus
        .use(requirePermission("admin.users.write"))
        .handler(({ context, input }) =>
          call(() =>
            options.modules.users.updateStatus({
              actorId: context.principal.user.id,
              userId: input.userId,
              status: input.status,
            }),
          ),
        ),
    },
    audit: {
      list: os.admin.audit.list
        .use(requirePermission("admin.audit.read"))
        .handler(({ input }) => options.modules.users.audit(input.limit)),
    },
  };
}
