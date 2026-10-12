"use strict";
var __makeTemplateObject = (this && this.__makeTemplateObject) || function (cooked, raw) {
    if (Object.defineProperty) { Object.defineProperty(cooked, "raw", { value: raw }); } else { cooked.raw = raw; }
    return cooked;
};
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
exports.cloudEvents = exports.cloudCommands = exports.cloudNotifications = exports.cloudUsageCalls = exports.cloudRevisions = exports.cloudAssets = exports.cloudSources = exports.cloudTools = exports.cloudExecutions = exports.cloudRuns = exports.cloudTaskRounds = exports.cloudTasks = exports.cloudExecutionGrants = exports.cloudMessages = exports.cloudSpendingGrants = exports.cloudTurns = exports.cloudConversations = exports.cloudPreferences = exports.cloudMutations = exports.cloudCommandStatusEnum = exports.cloudToolStatusEnum = exports.cloudUsageStateEnum = exports.cloudRunStatusEnum = exports.cloudTaskStatusEnum = void 0;
var drizzle_orm_1 = require("drizzle-orm");
var pg_core_1 = require("drizzle-orm/pg-core");
var columns_js_1 = require("./columns.js");
var identity_js_1 = require("./identity.js");
var projects_js_1 = require("./projects.js");
exports.cloudTaskStatusEnum = (0, pg_core_1.pgEnum)("cloud_task_status", [
    "open",
    "in_progress",
    "waiting_input",
    "review",
    "completed",
    "cancelled",
]);
exports.cloudRunStatusEnum = (0, pg_core_1.pgEnum)("cloud_run_status", [
    "queued",
    "running",
    "needs_input",
    "succeeded",
    "failed",
    "cancelled",
]);
exports.cloudUsageStateEnum = (0, pg_core_1.pgEnum)("cloud_usage_state", [
    "reserved",
    "started",
    "settled",
    "unknown",
    "released",
]);
exports.cloudToolStatusEnum = (0, pg_core_1.pgEnum)("cloud_tool_status", [
    "running",
    "succeeded",
    "failed",
    "cancelled",
]);
exports.cloudCommandStatusEnum = (0, pg_core_1.pgEnum)("cloud_command_status", [
    "pending",
    "applied",
    "rejected",
]);
function columns() {
    return __assign({ id: (0, pg_core_1.text)("id").primaryKey(), scopeType: (0, pg_core_1.text)("scope_type").notNull(), ownerUserId: (0, pg_core_1.text)("owner_user_id").references(function () { return identity_js_1.users.id; }, { onDelete: "restrict" }), projectId: (0, pg_core_1.text)("project_id").references(function () { return projects_js_1.v2Projects.id; }, { onDelete: "restrict" }), actorId: (0, pg_core_1.text)("actor_id").references(function () { return identity_js_1.users.id; }, { onDelete: "restrict" }), parentId: (0, pg_core_1.text)("parent_id"), secondaryParentId: (0, pg_core_1.text)("secondary_parent_id"), idempotencyKey: (0, pg_core_1.text)("idempotency_key"), data: (0, pg_core_1.jsonb)("data").$type().notNull() }, (0, columns_js_1.timestamps)());
}
function resourceTable(name) {
    return (0, pg_core_1.pgTable)(name, columns(), function (t) { return [
        (0, pg_core_1.check)("".concat(name, "_scope_check"), (0, drizzle_orm_1.sql)(templateObject_1 || (templateObject_1 = __makeTemplateObject(["(", "='personal' AND ", " IS NOT NULL AND ", " IS NULL) OR (", "='project' AND ", " IS NULL AND ", " IS NOT NULL)"], ["(", "='personal' AND ", " IS NOT NULL AND ", " IS NULL) OR (", "='project' AND ", " IS NULL AND ", " IS NOT NULL)"])), t.scopeType, t.ownerUserId, t.projectId, t.scopeType, t.ownerUserId, t.projectId)),
        (0, pg_core_1.index)("".concat(name, "_scope_created_idx")).on(t.scopeType, t.ownerUserId, t.projectId, t.createdAt, t.id),
        (0, pg_core_1.index)("".concat(name, "_parent_idx")).on(t.parentId),
        (0, pg_core_1.index)("".concat(name, "_secondary_parent_idx")).on(t.secondaryParentId),
        (0, pg_core_1.index)("".concat(name, "_actor_idx")).on(t.actorId),
        (0, pg_core_1.uniqueIndex)("".concat(name, "_actor_intent_idx")).on(t.actorId, t.idempotencyKey),
    ]; });
}
exports.cloudMutations = resourceTable("cloud_mutations");
exports.cloudPreferences = resourceTable("cloud_preferences");
exports.cloudConversations = resourceTable("cloud_conversations");
exports.cloudTurns = resourceTable("cloud_turns");
exports.cloudSpendingGrants = resourceTable("cloud_spending_grants");
exports.cloudMessages = resourceTable("cloud_messages");
exports.cloudExecutionGrants = resourceTable("cloud_execution_grants");
exports.cloudTasks = (0, pg_core_1.pgTable)("cloud_tasks", __assign(__assign({}, columns()), { status: (0, exports.cloudTaskStatusEnum)("status").notNull(), currentRoundId: (0, pg_core_1.text)("current_round_id").notNull(), goalVersion: (0, pg_core_1.integer)("goal_version").notNull() }), function (t) { return [
    (0, pg_core_1.index)("cloud_tasks_scope_idx").on(t.scopeType, t.ownerUserId, t.projectId, t.createdAt, t.id),
    (0, pg_core_1.uniqueIndex)("cloud_tasks_actor_intent_idx").on(t.actorId, t.idempotencyKey),
]; });
exports.cloudTaskRounds = (0, pg_core_1.pgTable)("cloud_task_rounds", __assign(__assign({}, columns()), { taskId: (0, pg_core_1.text)("task_id")
        .notNull()
        .references(function () { return exports.cloudTasks.id; }, { onDelete: "restrict" }), goalVersion: (0, pg_core_1.integer)("goal_version").notNull() }), function (t) { return [
    (0, pg_core_1.uniqueIndex)("cloud_task_rounds_task_version_idx").on(t.taskId, t.goalVersion),
    (0, pg_core_1.uniqueIndex)("cloud_task_rounds_actor_intent_idx").on(t.actorId, t.idempotencyKey),
    (0, pg_core_1.index)("cloud_task_rounds_parent_idx").on(t.parentId),
]; });
exports.cloudRuns = (0, pg_core_1.pgTable)("cloud_runs", __assign(__assign({}, columns()), { taskId: (0, pg_core_1.text)("task_id").references(function () { return exports.cloudTasks.id; }, { onDelete: "restrict" }), roundId: (0, pg_core_1.text)("round_id").references(function () { return exports.cloudTaskRounds.id; }, { onDelete: "restrict" }), ownerAccountId: (0, pg_core_1.text)("owner_account_id").notNull(), leaseExpiresAt: (0, columns_js_1.dateColumn)("lease_expires_at"), cancelRequested: (0, pg_core_1.boolean)("cancel_requested").notNull(), conversationId: (0, pg_core_1.text)("conversation_id")
        .notNull()
        .references(function () { return exports.cloudConversations.id; }, { onDelete: "restrict" }), status: (0, exports.cloudRunStatusEnum)("status").notNull(), dispatchReady: (0, pg_core_1.boolean)("dispatch_ready").notNull(), ownerId: (0, pg_core_1.text)("owner_id"), epoch: (0, pg_core_1.integer)("epoch").notNull() }), function (t) { return [
    (0, pg_core_1.uniqueIndex)("cloud_runs_actor_intent_idx").on(t.actorId, t.idempotencyKey),
    (0, pg_core_1.uniqueIndex)("cloud_runs_active_task_idx")
        .on(t.taskId)
        .where((0, drizzle_orm_1.sql)(templateObject_2 || (templateObject_2 = __makeTemplateObject(["", " IN ('queued','running')"], ["", " IN ('queued','running')"])), t.status)),
    (0, pg_core_1.index)("cloud_runs_dispatch_idx").on(t.status, t.dispatchReady, t.createdAt),
    (0, pg_core_1.index)("cloud_runs_conversation_idx").on(t.conversationId, t.createdAt, t.id),
    (0, pg_core_1.index)("cloud_runs_owner_idx").on(t.ownerId),
    (0, pg_core_1.index)("cloud_runs_owner_account_idx").on(t.ownerAccountId, t.status),
    (0, pg_core_1.index)("cloud_runs_round_idx").on(t.roundId),
    (0, pg_core_1.index)("cloud_runs_expired_lease_idx").on(t.status, t.leaseExpiresAt),
    (0, pg_core_1.index)("cloud_runs_actor_idx").on(t.actorId),
    (0, pg_core_1.index)("cloud_runs_task_idx").on(t.taskId),
]; });
exports.cloudExecutions = resourceTable("cloud_executions");
exports.cloudTools = resourceTable("cloud_tools");
exports.cloudSources = resourceTable("cloud_sources");
exports.cloudAssets = resourceTable("cloud_assets");
exports.cloudRevisions = (0, pg_core_1.pgTable)("cloud_revisions", __assign(__assign({}, columns()), { roundId: (0, pg_core_1.text)("round_id")
        .notNull()
        .references(function () { return exports.cloudTaskRounds.id; }, { onDelete: "restrict" }), goalVersion: (0, pg_core_1.integer)("goal_version").notNull() }), function (t) { return [
    (0, pg_core_1.index)("cloud_revisions_parent_idx").on(t.parentId),
    (0, pg_core_1.index)("cloud_revisions_round_idx").on(t.roundId),
]; });
exports.cloudUsageCalls = (0, pg_core_1.pgTable)("cloud_usage_calls", __assign(__assign({}, columns()), { runId: (0, pg_core_1.text)("run_id")
        .notNull()
        .references(function () { return exports.cloudRuns.id; }, { onDelete: "restrict" }), state: (0, exports.cloudUsageStateEnum)("state").notNull(), ownerAccountId: (0, pg_core_1.text)("owner_account_id").notNull(), roundId: (0, pg_core_1.text)("round_id").references(function () { return exports.cloudTaskRounds.id; }, { onDelete: "restrict" }) }), function (t) { return [
    (0, pg_core_1.index)("cloud_usage_calls_actor_state_idx").on(t.actorId, t.state),
    (0, pg_core_1.index)("cloud_usage_calls_run_idx").on(t.runId),
    (0, pg_core_1.index)("cloud_usage_calls_account_state_idx").on(t.ownerAccountId, t.state),
    (0, pg_core_1.index)("cloud_usage_calls_round_state_idx").on(t.roundId, t.state),
]; });
exports.cloudNotifications = resourceTable("cloud_notifications");
exports.cloudCommands = resourceTable("cloud_commands");
exports.cloudEvents = (0, pg_core_1.pgTable)("cloud_events", {
    runId: (0, pg_core_1.text)("run_id")
        .notNull()
        .references(function () { return exports.cloudRuns.id; }, { onDelete: "cascade" }),
    sequence: (0, pg_core_1.integer)("sequence").notNull(),
    eventId: (0, pg_core_1.text)("event_id").notNull(),
    occurredAt: (0, columns_js_1.dateColumn)("occurred_at").notNull(),
    data: (0, pg_core_1.jsonb)("data").$type().notNull(),
}, function (t) { return [
    (0, pg_core_1.primaryKey)({ columns: [t.runId, t.sequence] }),
    (0, pg_core_1.uniqueIndex)("cloud_events_run_event_idx").on(t.runId, t.eventId),
]; });
var templateObject_1, templateObject_2;
//# sourceMappingURL=cloud.js.map