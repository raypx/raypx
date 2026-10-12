"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.scheduledTaskStatusEnum = exports.projectMemberStatusEnum = exports.v2ProjectMemberStatusEnum = exports.v2ProjectMemberRoleEnum = exports.organizationMembershipStatusEnum = exports.organizationRoleEnum = exports.projectMemberRoleEnum = exports.activityTypeEnum = exports.feedbackStatusEnum = exports.reviewStatusEnum = exports.v2AgentRunStatusEnum = exports.v2ReviewStatusEnum = exports.projectTaskStatusEnum = exports.projectStageEnum = exports.workspaceMembershipStatusEnum = exports.workspaceMembershipRoleEnum = exports.agentStepStatusEnum = exports.agentRunStatusEnum = exports.syncConflictStatusEnum = exports.assetStatusEnum = exports.auditTargetTypeEnum = exports.auditActionEnum = exports.userStatusEnum = exports.roleEnum = void 0;
var pg_core_1 = require("drizzle-orm/pg-core");
exports.roleEnum = (0, pg_core_1.pgEnum)("role", ["user", "admin", "owner"]);
exports.userStatusEnum = (0, pg_core_1.pgEnum)("user_status", ["active", "suspended"]);
exports.auditActionEnum = (0, pg_core_1.pgEnum)("audit_action", [
    "user.status.changed",
    "admin.created",
    "system.settings.updated",
    "system.mail.test.sent",
]);
exports.auditTargetTypeEnum = (0, pg_core_1.pgEnum)("audit_target_type", ["user", "system_setting"]);
exports.assetStatusEnum = (0, pg_core_1.pgEnum)("asset_status", ["active", "deleted"]);
exports.syncConflictStatusEnum = (0, pg_core_1.pgEnum)("sync_conflict_status", ["open", "resolved"]);
exports.agentRunStatusEnum = (0, pg_core_1.pgEnum)("agent_run_status", [
    "queued",
    "running",
    "waiting_for_approval",
    "succeeded",
    "failed",
    "cancelled",
]);
exports.agentStepStatusEnum = (0, pg_core_1.pgEnum)("agent_step_status", [
    "queued",
    "running",
    "waiting_for_approval",
    "succeeded",
    "failed",
    "cancelled",
]);
exports.workspaceMembershipRoleEnum = (0, pg_core_1.pgEnum)("workspace_membership_role", [
    "owner",
    "editor",
    "viewer",
]);
exports.workspaceMembershipStatusEnum = (0, pg_core_1.pgEnum)("workspace_membership_status", [
    "active",
    "suspended",
]);
exports.projectStageEnum = (0, pg_core_1.pgEnum)("project_stage", [
    "draft",
    "in_progress",
    "review",
    "delivered",
]);
exports.projectTaskStatusEnum = (0, pg_core_1.pgEnum)("project_task_status", [
    "todo",
    "in_progress",
    "blocked",
    "done",
]);
exports.v2ReviewStatusEnum = (0, pg_core_1.pgEnum)("review_status_v2", ["open", "approved", "rejected"]);
exports.v2AgentRunStatusEnum = (0, pg_core_1.pgEnum)("agent_run_status_v2", [
    "queued",
    "running",
    "waiting_for_approval",
    "succeeded",
    "failed",
    "cancelled",
]);
exports.reviewStatusEnum = (0, pg_core_1.pgEnum)("review_status", [
    "draft",
    "open",
    "changes_requested",
    "approved",
    "closed",
]);
exports.feedbackStatusEnum = (0, pg_core_1.pgEnum)("feedback_status", ["open", "resolved"]);
exports.activityTypeEnum = (0, pg_core_1.pgEnum)("activity_type", [
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
exports.projectMemberRoleEnum = (0, pg_core_1.pgEnum)("project_member_role", [
    "owner",
    "editor",
    "commenter",
    "viewer",
]);
exports.organizationRoleEnum = (0, pg_core_1.pgEnum)("organization_role", [
    "owner",
    "admin",
    "editor",
    "viewer",
]);
exports.organizationMembershipStatusEnum = (0, pg_core_1.pgEnum)("organization_membership_status", [
    "active",
    "removed",
]);
exports.v2ProjectMemberRoleEnum = (0, pg_core_1.pgEnum)("v2_project_member_role", [
    "editor",
    "commenter",
    "viewer",
]);
exports.v2ProjectMemberStatusEnum = (0, pg_core_1.pgEnum)("v2_project_member_status", ["active", "removed"]);
exports.projectMemberStatusEnum = (0, pg_core_1.pgEnum)("project_member_status", ["active", "removed"]);
exports.scheduledTaskStatusEnum = (0, pg_core_1.pgEnum)("scheduled_task_status", ["active", "paused"]);
//# sourceMappingURL=enums.js.map