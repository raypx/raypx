"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.scheduledTasks = exports.piSessionEvents = exports.piSessions = exports.activities = exports.feedback = exports.reviews = exports.projectMembers = exports.projectTasks = exports.projects = exports.workspaceMemberships = void 0;
var columns_js_1 = require("./columns.js");
var pg_core_1 = require("drizzle-orm/pg-core");
var identity_js_1 = require("./identity.js");
var enums_js_1 = require("./enums.js");
var legacy_assets_js_1 = require("./legacy-assets.js");
exports.workspaceMemberships = (0, pg_core_1.pgTable)("workspace_memberships", __assign({ id: (0, pg_core_1.text)("id").primaryKey(), workspaceId: (0, pg_core_1.text)("workspace_id").notNull(), userId: (0, columns_js_1.requiredReference)("user_id", function () { return identity_js_1.users.id; }, "cascade"), role: (0, enums_js_1.workspaceMembershipRoleEnum)("role").notNull().default("viewer"), status: (0, enums_js_1.workspaceMembershipStatusEnum)("status").notNull().default("active") }, (0, columns_js_1.timestamps)()), function (table) { return [
    (0, pg_core_1.uniqueIndex)("workspace_memberships_workspace_user_idx").on(table.workspaceId, table.userId),
    (0, pg_core_1.index)("workspace_memberships_user_id_idx").on(table.userId),
    (0, pg_core_1.index)("workspace_memberships_workspace_status_idx").on(table.workspaceId, table.status),
]; });
exports.projects = (0, pg_core_1.pgTable)("projects", __assign({ id: (0, pg_core_1.text)("id").primaryKey(), workspaceId: (0, pg_core_1.text)("workspace_id").notNull(), ownerId: (0, columns_js_1.requiredReference)("owner_id", function () { return identity_js_1.users.id; }, "restrict"), title: (0, pg_core_1.text)("title").notNull(), description: (0, pg_core_1.text)("description"), stage: (0, enums_js_1.projectStageEnum)("stage").notNull().default("draft"), archived: (0, pg_core_1.boolean)("archived").notNull().default(false), archivedAt: (0, columns_js_1.dateColumn)("archived_at"), previousStage: (0, enums_js_1.projectStageEnum)("previous_stage"), deadline: (0, columns_js_1.dateColumn)("deadline"), cover: (0, pg_core_1.text)("cover"), thumbnail: (0, pg_core_1.text)("thumbnail") }, (0, columns_js_1.timestamps)()), function (table) { return [
    (0, pg_core_1.index)("projects_workspace_id_updated_at_idx").on(table.workspaceId, table.updatedAt),
    (0, pg_core_1.index)("projects_owner_id_idx").on(table.ownerId),
    (0, pg_core_1.index)("projects_stage_archived_idx").on(table.stage, table.archived),
]; });
exports.projectTasks = (0, pg_core_1.pgTable)("project_tasks", __assign({ id: (0, pg_core_1.text)("id").primaryKey(), projectId: (0, columns_js_1.requiredReference)("project_id", function () { return exports.projects.id; }, "cascade"), title: (0, pg_core_1.text)("title").notNull(), status: (0, enums_js_1.projectTaskStatusEnum)("status").notNull().default("todo"), createdBy: (0, columns_js_1.requiredReference)("created_by", function () { return identity_js_1.users.id; }, "restrict") }, (0, columns_js_1.timestamps)()), function (table) { return [
    (0, pg_core_1.index)("project_tasks_project_id_updated_at_idx").on(table.projectId, table.updatedAt),
    (0, pg_core_1.index)("project_tasks_project_id_status_idx").on(table.projectId, table.status),
    (0, pg_core_1.index)("project_tasks_created_by_idx").on(table.createdBy),
]; });
exports.projectMembers = (0, pg_core_1.pgTable)("project_members", __assign({ id: (0, pg_core_1.text)("id").primaryKey(), projectId: (0, columns_js_1.requiredReference)("project_id", function () { return exports.projects.id; }, "cascade"), workspaceId: (0, pg_core_1.text)("workspace_id").notNull(), userId: (0, columns_js_1.requiredReference)("user_id", function () { return identity_js_1.users.id; }, "cascade"), role: (0, enums_js_1.projectMemberRoleEnum)("role").notNull(), status: (0, enums_js_1.projectMemberStatusEnum)("status").notNull().default("active") }, (0, columns_js_1.timestamps)()), function (table) { return [
    (0, pg_core_1.uniqueIndex)("project_members_project_id_user_id_idx").on(table.projectId, table.userId),
    (0, pg_core_1.index)("project_members_project_id_status_idx").on(table.projectId, table.status),
    (0, pg_core_1.index)("project_members_workspace_id_user_id_idx").on(table.workspaceId, table.userId),
]; });
exports.reviews = (0, pg_core_1.pgTable)("reviews", __assign(__assign({ id: (0, pg_core_1.text)("id").primaryKey(), projectId: (0, columns_js_1.requiredReference)("project_id", function () { return exports.projects.id; }, "cascade"), workspaceId: (0, pg_core_1.text)("workspace_id").notNull(), targetVersionId: (0, pg_core_1.text)("target_version_id"), status: (0, enums_js_1.reviewStatusEnum)("status").notNull().default("draft"), title: (0, pg_core_1.text)("title").notNull(), requestedBy: (0, columns_js_1.requiredReference)("requested_by", function () { return identity_js_1.users.id; }, "restrict") }, (0, columns_js_1.timestamps)()), { resolvedAt: (0, columns_js_1.dateColumn)("resolved_at"), resolvedBy: (0, pg_core_1.text)("resolved_by").references(function () { return identity_js_1.users.id; }, { onDelete: "set null" }) }), function (table) { return [
    (0, pg_core_1.index)("reviews_project_id_updated_at_idx").on(table.projectId, table.updatedAt),
    (0, pg_core_1.index)("reviews_project_id_status_idx").on(table.projectId, table.status),
]; });
exports.feedback = (0, pg_core_1.pgTable)("feedback", __assign(__assign({ id: (0, pg_core_1.text)("id").primaryKey(), reviewId: (0, columns_js_1.requiredReference)("review_id", function () { return exports.reviews.id; }, "cascade"), projectId: (0, columns_js_1.requiredReference)("project_id", function () { return exports.projects.id; }, "cascade"), targetVersionId: (0, pg_core_1.text)("target_version_id").notNull(), authorId: (0, columns_js_1.requiredReference)("author_id", function () { return identity_js_1.users.id; }, "restrict"), body: (0, pg_core_1.text)("body").notNull(), status: (0, enums_js_1.feedbackStatusEnum)("status").notNull().default("open") }, (0, columns_js_1.timestamps)()), { resolvedAt: (0, columns_js_1.dateColumn)("resolved_at"), resolvedBy: (0, pg_core_1.text)("resolved_by").references(function () { return identity_js_1.users.id; }, { onDelete: "set null" }) }), function (table) { return [
    (0, pg_core_1.index)("feedback_review_id_created_at_idx").on(table.reviewId, table.createdAt),
    (0, pg_core_1.index)("feedback_project_id_idx").on(table.projectId),
    (0, pg_core_1.index)("feedback_author_id_idx").on(table.authorId),
]; });
exports.activities = (0, pg_core_1.pgTable)("activities", {
    id: (0, pg_core_1.text)("id").primaryKey(),
    type: (0, enums_js_1.activityTypeEnum)("type").notNull(),
    accountId: (0, pg_core_1.text)("account_id").notNull(),
    workspaceId: (0, pg_core_1.text)("workspace_id").notNull(),
    projectId: (0, pg_core_1.text)("project_id").references(function () { return exports.projects.id; }, { onDelete: "cascade" }),
    actorId: (0, columns_js_1.requiredReference)("actor_id", function () { return identity_js_1.users.id; }, "restrict"),
    targetId: (0, pg_core_1.text)("target_id"),
    summary: (0, pg_core_1.text)("summary").notNull(),
    occurredAt: (0, columns_js_1.dateColumn)("occurred_at").notNull().defaultNow(),
}, function (table) { return [
    (0, pg_core_1.index)("activities_account_id_occurred_at_idx").on(table.accountId, table.occurredAt),
    (0, pg_core_1.index)("activities_project_id_occurred_at_idx").on(table.projectId, table.occurredAt),
    (0, pg_core_1.index)("activities_workspace_id_occurred_at_idx").on(table.workspaceId, table.occurredAt),
]; });
exports.piSessions = (0, pg_core_1.pgTable)("pi_sessions", __assign(__assign({ id: (0, pg_core_1.text)("id").primaryKey(), projectId: (0, columns_js_1.requiredReference)("project_id", function () { return exports.projects.id; }, "cascade"), workspaceId: (0, pg_core_1.text)("workspace_id").notNull(), agentRunId: (0, columns_js_1.requiredReference)("agent_run_id", function () { return legacy_assets_js_1.agentRuns.id; }, "restrict"), requestedBy: (0, columns_js_1.requiredReference)("requested_by", function () { return identity_js_1.users.id; }, "restrict"), prompt: (0, pg_core_1.text)("prompt").notNull(), context: (0, pg_core_1.jsonb)("context").$type().notNull(), status: (0, enums_js_1.agentRunStatusEnum)("status").notNull() }, (0, columns_js_1.timestamps)()), { completedAt: (0, columns_js_1.dateColumn)("completed_at") }), function (table) { return [
    (0, pg_core_1.uniqueIndex)("pi_sessions_agent_run_id_idx").on(table.agentRunId),
    (0, pg_core_1.index)("pi_sessions_project_id_updated_at_idx").on(table.projectId, table.updatedAt),
]; });
exports.piSessionEvents = (0, pg_core_1.pgTable)("pi_session_events", {
    id: (0, pg_core_1.text)("id").primaryKey(),
    sessionId: (0, columns_js_1.requiredReference)("session_id", function () { return exports.piSessions.id; }, "cascade"),
    type: (0, pg_core_1.text)("type").notNull(),
    payload: (0, pg_core_1.jsonb)("payload").$type().notNull(),
    createdAt: (0, columns_js_1.createdAt)(),
}, function (table) { return [(0, pg_core_1.index)("pi_session_events_session_created_idx").on(table.sessionId, table.createdAt)]; });
exports.scheduledTasks = (0, pg_core_1.pgTable)("scheduled_tasks", __assign({ id: (0, pg_core_1.text)("id").primaryKey(), workspaceId: (0, pg_core_1.text)("workspace_id").notNull(), projectId: (0, pg_core_1.text)("project_id").references(function () { return exports.projects.id; }, { onDelete: "cascade" }), createdBy: (0, columns_js_1.requiredReference)("created_by", function () { return identity_js_1.users.id; }, "restrict"), name: (0, pg_core_1.text)("name").notNull(), instruction: (0, pg_core_1.text)("instruction").notNull(), schedule: (0, pg_core_1.text)("schedule").notNull(), status: (0, enums_js_1.scheduledTaskStatusEnum)("status").notNull().default("active"), executionStatus: (0, pg_core_1.text)("execution_status").notNull().default("unavailable"), nextRunAt: (0, columns_js_1.dateColumn)("next_run_at") }, (0, columns_js_1.timestamps)()), function (table) { return [
    (0, pg_core_1.index)("scheduled_tasks_workspace_updated_idx").on(table.workspaceId, table.updatedAt),
]; });
//# sourceMappingURL=legacy-projects.js.map