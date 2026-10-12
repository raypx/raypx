import { executionContext } from "./execution.js";
import {
  canProjectCapabilityV2,
  resolveProjectAccessV2,
  ProjectV2DomainError,
  type ProjectV2,
  type ProjectAccessV2,
  type ProjectCapabilityV2,
} from "@voidmix/core";
import type { ProjectOptions } from "./types.js";
export function createProjectAccess(
  options: Pick<ProjectOptions, "projects" | "projectMembers" | "organizationMembers">,
) {
  const accessFor = async (actorId: string, project: ProjectV2): Promise<ProjectAccessV2> => {
    const [projectMember, organizationMember] = await Promise.all([
      options.projectMembers.getByProjectAndUser({ projectId: project.id, userId: actorId }),
      project.organizationId
        ? options.organizationMembers.getByOrganizationAndUser({
            organizationId: project.organizationId,
            userId: actorId,
          })
        : Promise.resolve(null),
    ]);
    return resolveProjectAccessV2({
      actorId,
      project,
      ...(projectMember ? { projectMember } : {}),
      ...(organizationMember ? { organizationMember } : {}),
    });
  };

  const requireProject = async (
    actorId: string,
    projectId: string,
    capability: ProjectCapabilityV2,
    message: string,
  ): Promise<ProjectV2> => {
    const project = await options.projects.getById(projectId);
    if (!project || !canProjectCapabilityV2(await accessFor(actorId, project), capability)) {
      throw new ProjectV2DomainError("PROJECT_ACCESS_DENIED", message);
    }
    return project;
  };

  const assertCapability = ({
    actorId,
    projectId,
    capability,
  }: {
    actorId: string;
    projectId: string;
    capability: ProjectCapabilityV2;
  }) => requireProject(actorId, projectId, capability, "Project access denied.");
  return { accessFor, requireProject, assertCapability };
}
export type ProjectContext = ReturnType<typeof createProjectAccess> &
  ReturnType<typeof executionContext> & { options: ProjectOptions };

/** Missing resources deliberately share the access-denied identity. */
export function requireResource<T>(value: T | null, message: string): T {
  if (!value) throw new ProjectV2DomainError("PROJECT_ACCESS_DENIED", message);
  return value;
}

export function requiredText(value: string, label: string): string {
  const text = value.trim();
  if (!text) throw new ProjectV2DomainError("PROJECT_SCOPE_INVALID", `${label} is required.`);
  return text;
}
