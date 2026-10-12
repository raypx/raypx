import { pgEnum } from "drizzle-orm/pg-core";

export const roleEnum = pgEnum("role", ["user", "admin", "owner"]);

export const userStatusEnum = pgEnum("user_status", ["active", "suspended"]);

export const auditActionEnum = pgEnum("audit_action", [
  "user.status.changed",
  "admin.created",
  "system.settings.updated",
  "system.mail.test.sent",
]);

export const auditTargetTypeEnum = pgEnum("audit_target_type", ["user", "system_setting"]);

export const assetStatusEnum = pgEnum("asset_status", ["active", "deleted"]);

export const syncConflictStatusEnum = pgEnum("sync_conflict_status", ["open", "resolved"]);

export const agentRunStatusEnum = pgEnum("agent_run_status", [
  "queued",
  "running",
  "waiting_for_approval",
  "succeeded",
  "failed",
  "cancelled",
]);

export const agentStepStatusEnum = pgEnum("agent_step_status", [
  "queued",
  "running",
  "waiting_for_approval",
  "succeeded",
  "failed",
  "cancelled",
]);

export const workspaceMembershipRoleEnum = pgEnum("workspace_membership_role", [
  "owner",
  "editor",
  "viewer",
]);

export const workspaceMembershipStatusEnum = pgEnum("workspace_membership_status", [
  "active",
  "suspended",
]);

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

export const v2AgentRunStatusEnum = pgEnum("agent_run_status_v2", [
  "queued",
  "running",
  "waiting_for_approval",
  "succeeded",
  "failed",
  "cancelled",
]);

export const reviewStatusEnum = pgEnum("review_status", [
  "draft",
  "open",
  "changes_requested",
  "approved",
  "closed",
]);

export const feedbackStatusEnum = pgEnum("feedback_status", ["open", "resolved"]);

export const activityTypeEnum = pgEnum("activity_type", [
  "project.created",
  "project.updated",
  "project.stage.changed",
  "project.archived",
  "project.restored",
  "asset.added",
  "asset.version.committed",
  "review.created",
  "review.status.changed",
  "feedback.created",
  "feedback.resolved",
  "pi.session.started",
  "pi.session.completed",
]);

export const projectMemberRoleEnum = pgEnum("project_member_role", [
  "owner",
  "editor",
  "commenter",
  "viewer",
]);

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

export const projectMemberStatusEnum = pgEnum("project_member_status", ["active", "removed"]);

export const scheduledTaskStatusEnum = pgEnum("scheduled_task_status", ["active", "paused"]);
