import { ProjectV2DomainError } from "@voidmix/core";
import type { ProjectApplication } from "./types.js";
import type { ProjectContext } from "./context.js";
export function membersCommands({ options, now, requireProject }: ProjectContext) {
  const commands: Pick<
    ProjectApplication,
    "listMembers" | "addMember" | "updateMember" | "removeMember"
  > = {
    async listMembers({ actorId, projectId }) {
      await requireProject(actorId, projectId, "project.manage", "Project member access denied.");
      return options.projectMembers.listByProject(projectId);
    },

    async addMember({ actorId, projectId, userId, role }) {
      const project = await requireProject(
        actorId,
        projectId,
        "project.manage",
        "Project member access denied.",
      );
      const normalizedUserId = userId.trim();
      if (!normalizedUserId) {
        throw new ProjectV2DomainError(
          "PROJECT_MEMBER_INVALID_ROLE",
          "Member user id is required.",
        );
      }
      if (project.personalOwnerId === normalizedUserId) {
        throw new ProjectV2DomainError(
          "PROJECT_MEMBER_INVALID_ROLE",
          "The personal project owner is not a project member.",
        );
      }
      return options.projectMembers.upsert({
        projectId,
        userId: normalizedUserId,
        role,
        now: now(),
      });
    },

    async updateMember({ actorId, projectId, userId, role }) {
      await requireProject(actorId, projectId, "project.manage", "Project member access denied.");
      const existing = await options.projectMembers.getByProjectAndUser({ projectId, userId });
      if (!existing || existing.status !== "active") {
        throw new ProjectV2DomainError("PROJECT_MEMBER_NOT_FOUND", "Project member not found.");
      }
      return options.projectMembers.upsert({ projectId, userId, role, now: now() });
    },

    async removeMember({ actorId, projectId, userId }) {
      await requireProject(actorId, projectId, "project.manage", "Project member access denied.");
      const removed = await options.projectMembers.remove({ projectId, userId, now: now() });
      if (!removed) {
        throw new ProjectV2DomainError("PROJECT_MEMBER_NOT_FOUND", "Project member not found.");
      }
      return removed;
    },
  };
  return commands;
}
