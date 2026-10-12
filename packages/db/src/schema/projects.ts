import { dateColumn, timestamps, requiredReference } from "./columns.js";
import { sql } from "drizzle-orm";
import { boolean, check, index, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";
import { users } from "./identity.js";
import {
  organizationRoleEnum,
  organizationMembershipStatusEnum,
  projectStageEnum,
  v2ProjectMemberRoleEnum,
  v2ProjectMemberStatusEnum,
  projectTaskStatusEnum,
} from "./enums.js";

export const organizations = pgTable(
  "organizations",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    createdByUserId: requiredReference("created_by_user_id", () => users.id, "restrict"),
    ...timestamps(),
  },
  (table) => [index("organizations_created_by_user_id_idx").on(table.createdByUserId)],
);

export const organizationMembers = pgTable(
  "organization_members",
  {
    id: text("id").primaryKey(),
    organizationId: requiredReference("organization_id", () => organizations.id, "cascade"),
    userId: requiredReference("user_id", () => users.id, "cascade"),
    role: organizationRoleEnum("role").notNull().default("viewer"),
    status: organizationMembershipStatusEnum("status").notNull().default("active"),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex("organization_members_organization_user_idx").on(
      table.organizationId,
      table.userId,
    ),
    index("organization_members_user_status_idx").on(table.userId, table.status),
  ],
);

export const v2Projects = pgTable(
  "projects_v2",
  {
    id: text("id").primaryKey(),
    createdByUserId: requiredReference("created_by_user_id", () => users.id, "restrict"),
    personalOwnerId: text("personal_owner_id").references(() => users.id, { onDelete: "restrict" }),
    organizationId: text("organization_id").references(() => organizations.id, {
      onDelete: "restrict",
    }),
    title: text("title").notNull(),
    description: text("description"),
    stage: projectStageEnum("stage").notNull().default("draft"),
    archived: boolean("archived").notNull().default(false),
    deadline: dateColumn("deadline"),
    ...timestamps(),
  },
  (table) => [
    check(
      "projects_v2_single_owner_scope",
      sql.raw(
        '(("personal_owner_id" IS NOT NULL)::int + ("organization_id" IS NOT NULL)::int) = 1',
      ),
    ),
    index("projects_v2_personal_owner_updated_idx").on(table.personalOwnerId, table.updatedAt),
    index("projects_v2_organization_updated_idx").on(table.organizationId, table.updatedAt),
  ],
);

export const v2ProjectMembers = pgTable(
  "project_members_v2",
  {
    id: text("id").primaryKey(),
    projectId: requiredReference("project_id", () => v2Projects.id, "cascade"),
    userId: requiredReference("user_id", () => users.id, "cascade"),
    role: v2ProjectMemberRoleEnum("role").notNull(),
    status: v2ProjectMemberStatusEnum("status").notNull().default("active"),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex("project_members_v2_project_user_idx").on(table.projectId, table.userId),
    index("project_members_v2_user_status_idx").on(table.userId, table.status),
  ],
);

export const v2ProjectTasks = pgTable(
  "project_tasks_v2",
  {
    id: text("id").primaryKey(),
    projectId: requiredReference("project_id", () => v2Projects.id, "cascade"),
    title: text("title").notNull(),
    status: projectTaskStatusEnum("status").notNull().default("todo"),
    createdByUserId: requiredReference("created_by_user_id", () => users.id, "restrict"),
    ...timestamps(),
  },
  (table) => [index("project_tasks_v2_project_updated_idx").on(table.projectId, table.updatedAt)],
);
