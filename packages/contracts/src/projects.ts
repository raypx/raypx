import { cursorQueryFields } from "./common.js";
import { z } from "zod";
import { authoredResourceFields } from "./common.js";
import { createCursorPageSchema, procedure } from "./common.js";

export const projectScopeV2Schema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("personal") }),
  z.object({ type: z.literal("organization"), organizationId: z.string().trim().min(1) }),
]);

export const projectStageV2Schema = z.enum(["draft", "in_progress", "review", "delivered"]);

export const projectMemberRoleV2Schema = z.enum(["editor", "commenter", "viewer"]);

export const organizationRoleV2Schema = z.enum(["owner", "admin", "editor", "viewer"]);

export const projectV2Schema = z
  .object({
    id: z.string().min(1),
    createdByUserId: z.string().min(1),
    personalOwnerId: z.string().min(1).nullable(),
    organizationId: z.string().min(1).nullable(),
    title: z.string().min(1),
    description: z.string().nullable(),
    stage: projectStageV2Schema,
    archived: z.boolean(),
    deadline: z.date().nullable(),
    createdAt: z.date(),
    updatedAt: z.date(),
  })
  .superRefine((value, context) => {
    if ((value.personalOwnerId === null) === (value.organizationId === null)) {
      context.addIssue({
        code: "custom",
        path: ["personalOwnerId"],
        message: "Exactly one project ownership scope is required.",
      });
    }
  });

export const projectMemberV2Schema = z.object({
  projectId: z.string().min(1),
  userId: z.string().min(1),
  role: projectMemberRoleV2Schema,
  status: z.enum(["active", "removed"]),
});

export const organizationMemberV2Schema = z.object({
  organizationId: z.string().min(1),
  userId: z.string().min(1),
  role: organizationRoleV2Schema,
  status: z.enum(["active", "removed"]),
});

export const projectCapabilityV2Schema = z.enum([
  "project.read",
  "project.comment",
  "project.write",
  "project.manage",
]);

export const projectTaskStatusV2Schema = z.enum(["todo", "in_progress", "blocked", "done"]);

export const projectTaskV2Schema = z.object({
  ...authoredResourceFields,
  title: z.string().min(1),
  status: projectTaskStatusV2Schema,
  updatedAt: z.date(),
});

export const v2ProjectPage = createCursorPageSchema(projectV2Schema);

export const v2ListProjects = procedure(cursorQueryFields, v2ProjectPage);

export const v2GetProject = procedure(
  { projectId: z.string().min(1) },
  z.object({ project: projectV2Schema, access: z.enum(["read", "comment", "write", "manage"]) }),
);

export const v2CreateProject = procedure(
  {
    title: z.string().trim().min(1).max(500),
    description: z.string().max(10_000).nullable().optional(),
  },
  projectV2Schema,
);

export const v2UpdateProject = procedure(
  {
    projectId: z.string().min(1),
    title: z.string().trim().min(1).max(500).optional(),
    description: z.string().max(10_000).nullable().optional(),
    stage: projectStageV2Schema.optional(),
    deadline: z.date().nullable().optional(),
  },
  projectV2Schema,
);

export const v2ArchiveProject = procedure({ projectId: z.string().min(1) }, projectV2Schema);

export const v2RestoreProject = v2ArchiveProject;

export const v2DeleteProject = procedure(
  { projectId: z.string().min(1) },
  z.object({ deleted: z.literal(true) }),
);

export const v2ListProjectTasks = procedure(
  { projectId: z.string().min(1) },
  createCursorPageSchema(projectTaskV2Schema),
);

export const v2CreateProjectTask = procedure(
  { projectId: z.string().min(1), title: z.string().trim().min(1).max(500) },
  projectTaskV2Schema,
);

export const v2UpdateProjectTask = procedure(
  {
    taskId: z.string().min(1),
    title: z.string().trim().min(1).max(500).optional(),
    status: projectTaskStatusV2Schema.optional(),
  },
  projectTaskV2Schema,
);

export const v2ListProjectMembers = procedure(
  { projectId: z.string().min(1) },
  createCursorPageSchema(projectMemberV2Schema),
);

export const v2AddProjectMember = procedure(
  {
    projectId: z.string().min(1),
    userId: z.string().trim().min(1),
    role: projectMemberRoleV2Schema,
  },
  projectMemberV2Schema,
);

export const v2UpdateProjectMember = v2AddProjectMember;

export const v2RemoveProjectMember = procedure(
  { projectId: z.string().min(1), userId: z.string().trim().min(1) },
  projectMemberV2Schema,
);

export type ProjectScopeV2Dto = z.infer<typeof projectScopeV2Schema>;

export type ProjectV2Dto = z.infer<typeof projectV2Schema>;

export type ProjectMemberV2Dto = z.infer<typeof projectMemberV2Schema>;

export type OrganizationMemberV2Dto = z.infer<typeof organizationMemberV2Schema>;

export type ProjectCapabilityV2Dto = z.infer<typeof projectCapabilityV2Schema>;
