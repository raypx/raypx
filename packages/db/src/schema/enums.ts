import { pgEnum } from "drizzle-orm/pg-core";

export const roleEnum = pgEnum("role", ["user", "admin", "owner"]);

export const userStatusEnum = pgEnum("user_status", ["active", "suspended"]);

export const projectStageEnum = pgEnum("project_stage", [
  "draft",
  "in_progress",
  "review",
  "delivered",
]);

export const projectTaskStatusEnum = pgEnum("project_task_status", [
  "todo",
  "in_progress",
  "blocked",
  "done",
]);

export const v2ReviewStatusEnum = pgEnum("review_status_v2", ["open", "approved", "rejected"]);

export const organizationRoleEnum = pgEnum("organization_role", [
  "owner",
  "admin",
  "editor",
  "viewer",
]);

export const organizationMembershipStatusEnum = pgEnum("organization_membership_status", [
  "active",
  "removed",
]);

export const v2ProjectMemberRoleEnum = pgEnum("v2_project_member_role", [
  "editor",
  "commenter",
  "viewer",
]);

export const v2ProjectMemberStatusEnum = pgEnum("v2_project_member_status", ["active", "removed"]);
