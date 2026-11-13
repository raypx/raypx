import { ORPCError } from "@orpc/server";
import { RoutineError } from "@raypx/jobs/routines";
import { SpaceNotFound, type SpaceId } from "@raypx/core/spaces";
import type { SpaceScope } from "@raypx/spaces/server";
import type { AccountContext } from "../../middleware/rpc.js";
import type { RpcSetup } from "./setup.js";

export function createRoutineHandlers({
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
  ): Promise<T> {
    try {
      return await operation(await options.spaces.resolve(context.auth.user.id, spaceId));
    } catch (error) {
      if (error instanceof SpaceNotFound) throw new ORPCError("NOT_FOUND");
      if (!(error instanceof RoutineError)) throw new ORPCError("SERVICE_UNAVAILABLE");
      if (error.code === "NOT_FOUND" || error.code === "UNAUTHORIZED")
        throw new ORPCError("NOT_FOUND");
      if (error.code === "RATE_LIMITED") throw new ORPCError("TOO_MANY_REQUESTS");
      if (error.code === "BODY_MISMATCH" || error.code === "DISABLED")
        throw new ORPCError("CONFLICT", { message: error.code });
      throw new ORPCError("BAD_REQUEST", { message: error.code });
    }
  }
  const read = withRpcPermission({ window: 60, max: 60 });
  const write = withRpcPermission();
  const quota = limitAccount({ window: 60, max: 30 });
  return {
    list: os.routines.list
      .use(read)
      .handler(({ context, input }) =>
        scoped(context, input.spaceId, (scope) =>
          options.routines.list(scope, input.agentId, input.limit),
        ),
      ),
    get: os.routines.get
      .use(read)
      .handler(({ context, input }) =>
        scoped(context, input.spaceId, (scope) => options.routines.get(scope, input.id)),
      ),
    history: os.routines.history
      .use(read)
      .handler(({ context, input }) =>
        scoped(context, input.spaceId, (scope) =>
          options.routines.history(scope, input.id, input.limit),
        ),
      ),
    events: os.routines.events
      .use(read)
      .handler(({ context, input }) =>
        scoped(context, input.spaceId, (scope) =>
          options.routines.events(scope, input.id, input.limit),
        ),
      ),
    create: os.routines.create
      .use(write)
      .use(requireTrustedOrigin)
      .use(quota)
      .handler(({ context, input }) =>
        scoped(context, input.spaceId, (scope) => options.routines.create(scope, input.routine)),
      ),
    update: os.routines.update
      .use(write)
      .use(requireTrustedOrigin)
      .use(quota)
      .handler(({ context, input }) =>
        scoped(context, input.spaceId, (scope) =>
          options.routines.update(scope, input.id, input.routine),
        ),
      ),
    pause: os.routines.pause
      .use(write)
      .use(requireTrustedOrigin)
      .use(quota)
      .handler(({ context, input }) =>
        scoped(context, input.spaceId, (scope) => options.routines.pause(scope, input.id)),
      ),
    resume: os.routines.resume
      .use(write)
      .use(requireTrustedOrigin)
      .use(quota)
      .handler(({ context, input }) =>
        scoped(context, input.spaceId, (scope) => options.routines.resume(scope, input.id)),
      ),
    delete: os.routines.delete
      .use(write)
      .use(requireTrustedOrigin)
      .use(quota)
      .handler(({ context, input }) =>
        scoped(context, input.spaceId, (scope) => options.routines.delete(scope, input.id)),
      ),
    test: os.routines.test
      .use(write)
      .use(requireTrustedOrigin)
      .use(quota)
      .handler(({ context, input }) =>
        scoped(context, input.spaceId, (scope) =>
          options.routines.test(scope, input.id, input.idempotencyKey),
        ),
      ),
    rotateWebhookKey: os.routines.rotateWebhookKey
      .use(write)
      .use(requireTrustedOrigin)
      .use(quota)
      .handler(({ context, input }) =>
        scoped(context, input.spaceId, (scope) =>
          options.routines.rotateWebhookKey(scope, input.id),
        ),
      ),
  };
}
