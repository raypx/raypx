import type { ProjectApplication } from "./types.js";
import { requireResource, requiredText, type ProjectContext } from "./context.js";
export function tasksCommands({ options, now, id, requireProject }: ProjectContext) {
  const commands: Pick<ProjectApplication, "listTasks" | "createTask" | "updateTask"> = {
    async listTasks({ actorId, projectId }) {
      await requireProject(actorId, projectId, "project.read", "Task access denied.");
      return options.tasks.listByProject(projectId);
    },

    async createTask({ actorId, projectId, title }) {
      const project = await requireProject(
        actorId,
        projectId,
        "project.write",
        "Task access denied.",
      );
      const trimmed = requiredText(title, "Task title");
      return options.tasks.create({
        id: id(),
        projectId: project.id,
        createdByUserId: actorId,
        title: trimmed,
        now: now(),
      });
    },

    async updateTask({ actorId, taskId, title, status }) {
      const task = requireResource(await options.tasks.getById(taskId), "Task access denied.");
      await requireProject(actorId, task.projectId, "project.write", "Task access denied.");
      const updated = await options.tasks.update({
        id: taskId,
        ...(title !== undefined ? { title: title.trim() } : {}),
        ...(status !== undefined ? { status } : {}),
        now: now(),
      });
      return requireResource(updated, "Task access denied.");
    },
  };
  return commands;
}
