import { assertProjectScopeV2, canProjectCapabilityV2, ProjectV2DomainError } from "@voidmix/core";
import type { ProjectApplication } from "./types.js";
import { requireResource, type ProjectContext } from "./context.js";
export function projectsCommands({ options, now, id, accessFor, requireProject }: ProjectContext) {
  const setArchived =
    (archived: boolean, message: string): ProjectApplication["archiveProject"] =>
    async ({ actorId, projectId }) => {
      await requireProject(actorId, projectId, "project.manage", message);
      return requireResource(
        await options.projects.setArchived({ id: projectId, archived, now: now() }),
        message,
      );
    };
  const commands: Pick<
    ProjectApplication,
    | "get"
    | "listForUser"
    | "create"
    | "assertCapability"
    | "updateProject"
    | "archiveProject"
    | "restoreProject"
    | "deleteProject"
  > = {
    async get({ actorId, projectId }) {
      const project = await options.projects.getById(projectId);
      if (!project) return null;
      const access = await accessFor(actorId, project);
      return access === "none" ? null : { project, access };
    },

    listForUser: (actorId, query = {}) => options.projects.listVisible({ actorId, ...query }),

    async create({ actorId, scope, title, description }) {
      assertProjectScopeV2(scope);
      if (!title.trim()) {
        throw new ProjectV2DomainError("PROJECT_SCOPE_INVALID", "Project title is required.");
      }
      if (scope.type === "personal" && scope.userId !== actorId) {
        throw new ProjectV2DomainError(
          "PROJECT_ACCESS_DENIED",
          "Personal project creation denied.",
        );
      }
      if (scope.type === "organization") {
        const membership = await options.organizationMembers.getByOrganizationAndUser({
          organizationId: scope.organizationId,
          userId: actorId,
        });
        if (!membership || membership.status !== "active" || membership.role === "viewer") {
          throw new ProjectV2DomainError(
            "PROJECT_ACCESS_DENIED",
            "Organization project creation denied.",
          );
        }
      }
      return options.projects.create({
        id: id(),
        createdByUserId: actorId,
        scope,
        title: title.trim(),
        ...(description !== undefined ? { description } : {}),
        now: now(),
      });
    },

    async assertCapability({ actorId, projectId, capability }) {
      const result = await commands.get({ actorId, projectId });
      if (!result || !canProjectCapabilityV2(result.access, capability)) {
        throw new ProjectV2DomainError("PROJECT_ACCESS_DENIED", "Project access denied.");
      }
      return result.project;
    },

    async updateProject({ actorId, projectId, title, description, stage, deadline }) {
      await requireProject(actorId, projectId, "project.write", "Project update denied.");
      if (title !== undefined && !title.trim()) {
        throw new ProjectV2DomainError("PROJECT_SCOPE_INVALID", "Project title is required.");
      }
      const updated = await options.projects.update({
        id: projectId,
        ...(title !== undefined ? { title: title.trim() } : {}),
        ...(description !== undefined ? { description } : {}),
        ...(stage !== undefined ? { stage } : {}),
        ...(deadline !== undefined ? { deadline } : {}),
        now: now(),
      });
      return requireResource(updated, "Project update denied.");
    },

    archiveProject: setArchived(true, "Project archive denied."),
    restoreProject: setArchived(false, "Project restore denied."),

    async deleteProject({ actorId, projectId }) {
      await requireProject(actorId, projectId, "project.manage", "Project delete denied.");
      const deleted = await options.projects.delete(projectId);
      if (!deleted)
        throw new ProjectV2DomainError("PROJECT_ACCESS_DENIED", "Project delete denied.");
    },
  };
  return commands;
}
