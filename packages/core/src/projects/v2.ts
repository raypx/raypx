import type { CursorPage, VisibleResourceQuery } from "../pagination.js";
import { DomainError } from "@voidmix/shared";

/** The canonical V2 project lifecycle. */
export const projectStagesV2 = ["draft", "in_progress", "review", "delivered"] as const;
export type ProjectStageV2 = (typeof projectStagesV2)[number];

export type ProjectScope =
  | { type: "personal"; userId: string }
  | { type: "organization"; organizationId: string };

/**
 * V2 deliberately separates authorship from ownership. createdByUserId is
 * attribution only; authorization is derived from the scope and memberships.
 */
export interface ProjectV2 {
  id: string;
  createdByUserId: string;
  personalOwnerId: string | null;
  organizationId: string | null;
  title: string;
  description: string | null;
  stage: ProjectStageV2;
  archived: boolean;
  deadline: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export const projectMemberRolesV2 = ["editor", "commenter", "viewer"] as const;
export type ProjectMemberRoleV2 = (typeof projectMemberRolesV2)[number];

export const membershipStatusesV2 = ["active", "removed"] as const;
export type MembershipStatusV2 = (typeof membershipStatusesV2)[number];

export interface ProjectMemberV2 {
  projectId: string;
  userId: string;
  role: ProjectMemberRoleV2;
  status: MembershipStatusV2;
}

export const organizationRolesV2 = ["owner", "admin", "editor", "viewer"] as const;
export type OrganizationRoleV2 = (typeof organizationRolesV2)[number];

export interface OrganizationMemberV2 {
  organizationId: string;
  userId: string;
  role: OrganizationRoleV2;
  status: MembershipStatusV2;
}

export interface ProjectV2Repository {
  getById(id: string): Promise<ProjectV2 | null>;
  listVisible(query: VisibleResourceQuery): Promise<CursorPage<ProjectV2>>;
  create(input: {
    id: string;
    createdByUserId: string;
    scope: ProjectScope;
    title: string;
    description?: string | null;
    now: Date;
  }): Promise<ProjectV2>;
  update(input: {
    id: string;
    title?: string;
    description?: string | null;
    stage?: ProjectStageV2;
    deadline?: Date | null;
    now: Date;
  }): Promise<ProjectV2 | null>;
  setArchived(input: { id: string; archived: boolean; now: Date }): Promise<ProjectV2 | null>;
  delete(id: string): Promise<boolean>;
}

export interface ProjectMemberV2Repository {
  getByProjectAndUser(input: {
    projectId: string;
    userId: string;
  }): Promise<ProjectMemberV2 | null>;
  listByProject(projectId: string): Promise<ProjectMemberV2[]>;
  upsert(input: {
    projectId: string;
    userId: string;
    role: ProjectMemberRoleV2;
    now: Date;
  }): Promise<ProjectMemberV2>;
  remove(input: { projectId: string; userId: string; now: Date }): Promise<ProjectMemberV2 | null>;
}

export interface OrganizationMemberV2Repository {
  getByOrganizationAndUser(input: {
    organizationId: string;
    userId: string;
  }): Promise<OrganizationMemberV2 | null>;
  listByUser(userId: string): Promise<OrganizationMemberV2[]>;
}

export type ProjectAccessV2 = "none" | "read" | "comment" | "write" | "manage";

const accessRank: Record<ProjectAccessV2, number> = {
  none: 0,
  read: 1,
  comment: 2,
  write: 3,
  manage: 4,
};

function minAccess(left: ProjectAccessV2, right: ProjectAccessV2): ProjectAccessV2 {
  return accessRank[left] <= accessRank[right] ? left : right;
}

const projectMemberAccess: Record<ProjectMemberRoleV2, ProjectAccessV2> = {
  editor: "write",
  commenter: "comment",
  viewer: "read",
};
const organizationMemberAccess: Record<OrganizationRoleV2, ProjectAccessV2> = {
  owner: "manage",
  admin: "manage",
  editor: "write",
  viewer: "read",
};

export interface ResolveProjectAccessV2Input {
  actorId: string;
  project: Pick<ProjectV2, "createdByUserId" | "personalOwnerId" | "organizationId">;
  projectMember?: Pick<ProjectMemberV2, "role" | "status"> | null;
  organizationMember?: Pick<OrganizationMemberV2, "role" | "status"> | null;
}

/**
 * Resolve one capability value for both personal and organization projects.
 * Project membership can narrow organization access but never elevate it.
 */
export function resolveProjectAccessV2(input: ResolveProjectAccessV2Input): ProjectAccessV2 {
  const { actorId, project } = input;
  const isPersonal = project.personalOwnerId !== null;
  const isOrganization = project.organizationId !== null;
  if (isPersonal === isOrganization) return "none";

  if (isPersonal && project.personalOwnerId === actorId) return "manage";

  const member = input.projectMember;
  if (member?.status === "removed") return "none";
  if (isPersonal) {
    return member?.status === "active" ? projectMemberAccess[member.role] : "none";
  }

  let base: ProjectAccessV2 = "none";
  if (isOrganization && input.organizationMember?.status === "active") {
    base = organizationMemberAccess[input.organizationMember.role];
  }

  if (!member) return base;
  return minAccess(base, projectMemberAccess[member.role]);
}

export type ProjectCapabilityV2 =
  | "project.read"
  | "project.comment"
  | "project.write"
  | "project.manage";

const capabilityAccess: Record<ProjectCapabilityV2, ProjectAccessV2> = {
  "project.read": "read",
  "project.comment": "comment",
  "project.write": "write",
  "project.manage": "manage",
};

export function canProjectCapabilityV2(
  access: ProjectAccessV2,
  capability: ProjectCapabilityV2,
): boolean {
  return accessRank[access] >= accessRank[capabilityAccess[capability]];
}

export class ProjectV2DomainError extends DomainError<
  | "PROJECT_SCOPE_INVALID"
  | "PROJECT_ACCESS_DENIED"
  | "PROJECT_MEMBER_NOT_FOUND"
  | "PROJECT_MEMBER_INVALID_ROLE"
> {
  constructor(
    code:
      | "PROJECT_SCOPE_INVALID"
      | "PROJECT_ACCESS_DENIED"
      | "PROJECT_MEMBER_NOT_FOUND"
      | "PROJECT_MEMBER_INVALID_ROLE",
    message: string,
  ) {
    super(code, message);
    this.name = "ProjectV2DomainError";
  }
}

export function assertProjectScopeV2(scope: ProjectScope): void {
  if (scope.type === "personal" && !scope.userId.trim()) {
    throw new ProjectV2DomainError("PROJECT_SCOPE_INVALID", "Personal project owner is required.");
  }
  if (scope.type === "organization" && !scope.organizationId.trim()) {
    throw new ProjectV2DomainError(
      "PROJECT_SCOPE_INVALID",
      "Organization project owner is required.",
    );
  }
}
