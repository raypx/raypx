import { createExecutionHandlers } from "./execution-handlers.js";
import { createApiError } from "./canonical-errors.js";
import { actorInput, type RouterContext } from "./router-context.js";
import { createReviewsHandlers } from "./reviews-handlers.js";
import { createAssetsHandlers } from "./assets-handlers.js";
export function createProjectHandlers(context: RouterContext) {
  const { authenticated, v2Projects, call, command, list } = context;
  return {
    list: authenticated.projects.list.handler(({ context, input }) =>
      call(() => v2Projects().listForUser(context.principal.user.id, actorInput(context, input))),
    ),
    get: authenticated.projects.get.handler(async ({ context, input }) => {
      const result = await call(() => v2Projects().get(actorInput(context, input)));
      if (!result || result.access === "none")
        throw createApiError("NOT_FOUND", "PROJECT_NOT_FOUND");
      return { project: result.project, access: result.access };
    }),
    create: authenticated.projects.create.handler(({ context, input }) =>
      call(() =>
        v2Projects().create({
          actorId: context.principal.user.id,
          scope: { type: "personal", userId: context.principal.user.id },
          title: input.title,
          ...(input.description !== undefined ? { description: input.description } : {}),
        }),
      ),
    ),
    update: authenticated.projects.update.handler(command(() => v2Projects().updateProject)),
    archive: authenticated.projects.archive.handler(command(() => v2Projects().archiveProject)),
    restore: authenticated.projects.restore.handler(command(() => v2Projects().restoreProject)),
    delete: authenticated.projects.delete.handler(async ({ context, input }) => {
      await call(() => v2Projects().deleteProject(actorInput(context, input)));
      return { deleted: true as const };
    }),
    tasks: {
      list: authenticated.projects.tasks.list.handler(list(() => v2Projects().listTasks)),
      create: authenticated.projects.tasks.create.handler(command(() => v2Projects().createTask)),
      update: authenticated.projects.tasks.update.handler(command(() => v2Projects().updateTask)),
    },
    members: {
      list: authenticated.projects.members.list.handler(list(() => v2Projects().listMembers)),
      add: authenticated.projects.members.add.handler(command(() => v2Projects().addMember)),
      update: authenticated.projects.members.update.handler(
        command(() => v2Projects().updateMember),
      ),
      remove: authenticated.projects.members.remove.handler(
        command(() => v2Projects().removeMember),
      ),
    },
    reviews: createReviewsHandlers(context),
    assets: createAssetsHandlers(context),
    agentRuns: createExecutionHandlers(context).agentRuns,
  };
}
