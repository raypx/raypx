import { ORPCError } from "@orpc/server";
import { SkillError } from "@raypx/core/skills";
import { SpaceNotFound, type SpaceId } from "@raypx/core/spaces";
import type { SpaceScope } from "@raypx/spaces/server";
import type { AccountContext } from "../../middleware/rpc.js";
import type { RpcSetup } from "./setup.js";

export function createSkillsHandlers({
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
      if (error instanceof SkillError) {
        const code = error.code === "SKILL_NOT_FOUND" ? "NOT_FOUND" : "BAD_REQUEST";
        throw new ORPCError(code, {
          message: error.code,
          data: { error: { code: error.code }, requestId: context.requestId },
        });
      }
      throw new ORPCError("INTERNAL_SERVER_ERROR", { message: "SKILL_OPERATION_FAILED" });
    }
  }
  return {
    list: os.skills.list
      .use(read)
      .handler(({ context, input }) =>
        scoped(context, input.spaceId, (scope) => options.skills.list(scope, input.availableOnly)),
      ),
    get: os.skills.get
      .use(read)
      .handler(({ context, input }) =>
        scoped(context, input.spaceId, (scope) => options.skills.get(scope, input.id)),
      ),
    create: os.skills.create
      .use(write)
      .use(requireTrustedOrigin)
      .use(quota)
      .handler(({ context, input }) =>
        scoped(context, input.spaceId, (scope) =>
          options.skills.create(scope, input.skill, input.availability),
        ),
      ),
    update: os.skills.update
      .use(write)
      .use(requireTrustedOrigin)
      .use(quota)
      .handler(({ context, input }) =>
        scoped(context, input.spaceId, (scope) =>
          options.skills.update(scope, input.id, input.skill),
        ),
      ),
    delete: os.skills.delete
      .use(write)
      .use(requireTrustedOrigin)
      .use(quota)
      .handler(({ context, input }) =>
        scoped(context, input.spaceId, (scope) => options.skills.delete(scope, input.id)),
      ),
    setAvailability: os.skills.setAvailability
      .use(write)
      .use(requireTrustedOrigin)
      .use(quota)
      .handler(({ context, input }) =>
        scoped(context, input.spaceId, (scope) =>
          options.skills.setAvailability(scope, input.id, input.availability),
        ),
      ),
    agentSkills: os.skills.agentSkills
      .use(read)
      .handler(({ context, input }) =>
        scoped(context, input.spaceId, (scope) => options.skills.runCatalog(scope, input.agentId)),
      ),
    setAgentSkills: os.skills.setAgentSkills
      .use(write)
      .use(requireTrustedOrigin)
      .use(quota)
      .handler(({ context, input }) =>
        scoped(context, input.spaceId, (scope) =>
          options.skills.setAgentSkills(scope, input.agentId, input.ids),
        ),
      ),
    import: os.skills.import
      .use(write)
      .use(requireTrustedOrigin)
      .use(quota)
      .handler(({ context, input }) =>
        scoped(context, input.spaceId, (scope) =>
          options.skills.import(scope, input.package, input.availability),
        ),
      ),
  };
}
