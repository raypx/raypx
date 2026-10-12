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
exports.runArtifacts = exports.runEvents = exports.runCommands = exports.taskAgentRuns = exports.deviceProjectBindings = exports.executionDevices = void 0;
var drizzle_orm_1 = require("drizzle-orm");
var pg_core_1 = require("drizzle-orm/pg-core");
var columns_js_1 = require("./columns.js");
var identity_js_1 = require("./identity.js");
var projects_js_1 = require("./projects.js");
var resources_js_1 = require("./resources.js");
var enums_js_1 = require("./enums.js");
exports.executionDevices = (0, pg_core_1.pgTable)("execution_devices", __assign({ id: (0, pg_core_1.text)("id").primaryKey(), ownerUserId: (0, columns_js_1.requiredReference)("owner_user_id", function () { return identity_js_1.users.id; }, "cascade"), name: (0, pg_core_1.text)("name").notNull(), platform: (0, pg_core_1.text)("platform").notNull(), credentialHash: (0, pg_core_1.text)("credential_hash").notNull(), registrationKey: (0, pg_core_1.text)("registration_key").notNull(), revokedAt: (0, columns_js_1.dateColumn)("revoked_at"), lastSeenAt: (0, columns_js_1.dateColumn)("last_seen_at") }, (0, columns_js_1.timestamps)()), function (table) { return [
    (0, pg_core_1.uniqueIndex)("execution_devices_credential_hash_idx").on(table.credentialHash),
    (0, pg_core_1.uniqueIndex)("execution_devices_owner_registration_idx").on(table.ownerUserId, table.registrationKey),
    (0, pg_core_1.index)("execution_devices_owner_user_id_idx").on(table.ownerUserId),
]; });
exports.deviceProjectBindings = (0, pg_core_1.pgTable)("device_project_bindings", {
    deviceId: (0, columns_js_1.requiredReference)("device_id", function () { return exports.executionDevices.id; }, "cascade"),
    projectId: (0, columns_js_1.requiredReference)("project_id", function () { return projects_js_1.v2Projects.id; }, "cascade"),
    localBindingId: (0, pg_core_1.text)("local_binding_id").notNull(),
    enabled: (0, pg_core_1.boolean)("enabled").notNull(),
    tools: (0, pg_core_1.jsonb)("tools").$type().notNull(),
    model: (0, pg_core_1.jsonb)("model").$type(),
    updatedAt: (0, columns_js_1.dateColumn)("updated_at").notNull(),
}, function (table) { return [
    (0, pg_core_1.primaryKey)({ columns: [table.deviceId, table.projectId] }),
    (0, pg_core_1.index)("device_project_bindings_project_id_idx").on(table.projectId),
]; });
exports.taskAgentRuns = (0, pg_core_1.pgTable)("task_agent_runs", __assign({ id: (0, pg_core_1.text)("id").primaryKey(), projectId: (0, columns_js_1.requiredReference)("project_id", function () { return projects_js_1.v2Projects.id; }, "cascade"), taskId: (0, columns_js_1.requiredReference)("task_id", function () { return projects_js_1.v2ProjectTasks.id; }, "cascade"), targetDeviceId: (0, columns_js_1.requiredReference)("target_device_id", function () { return exports.executionDevices.id; }, "restrict"), requestedByUserId: (0, columns_js_1.requiredReference)("requested_by_user_id", function () { return identity_js_1.users.id; }, "restrict"), assetVersionId: (0, pg_core_1.text)("asset_version_id").references(function () { return resources_js_1.v2AssetVersions.id; }, {
        onDelete: "set null",
    }), status: (0, enums_js_1.v2AgentRunStatusEnum)("status").notNull(), attempt: (0, pg_core_1.integer)("attempt").notNull(), retryOfRunId: (0, pg_core_1.text)("retry_of_run_id"), idempotencyKey: (0, pg_core_1.text)("idempotency_key").notNull(), dispatchReady: (0, pg_core_1.boolean)("dispatch_ready").notNull().default(false), prompt: (0, pg_core_1.text)("prompt").notNull(), input: (0, pg_core_1.jsonb)("input").$type().notNull(), output: (0, pg_core_1.jsonb)("output").$type(), error: (0, pg_core_1.text)("error"), lastSeq: (0, pg_core_1.integer)("last_seq").notNull(), claimId: (0, pg_core_1.text)("claim_id"), acceptedAt: (0, columns_js_1.dateColumn)("accepted_at"), completedAt: (0, columns_js_1.dateColumn)("completed_at"), pendingApprovalId: (0, pg_core_1.text)("pending_approval_id") }, (0, columns_js_1.timestamps)()), function (table) { return [
    (0, pg_core_1.uniqueIndex)("task_agent_runs_actor_intent_idx").on(table.requestedByUserId, table.idempotencyKey),
    (0, pg_core_1.uniqueIndex)("task_agent_runs_active_task_idx")
        .on(table.taskId)
        .where((0, drizzle_orm_1.sql)(templateObject_1 || (templateObject_1 = __makeTemplateObject(["", " IN ('queued', 'running', 'waiting_for_approval')"], ["", " IN ('queued', 'running', 'waiting_for_approval')"])), table.status)),
    (0, pg_core_1.index)("task_agent_runs_project_created_idx").on(table.projectId, table.createdAt),
    (0, pg_core_1.index)("task_agent_runs_device_status_idx").on(table.targetDeviceId, table.status),
    (0, pg_core_1.index)("task_agent_runs_task_id_idx").on(table.taskId),
    (0, pg_core_1.index)("task_agent_runs_asset_version_id_idx").on(table.assetVersionId),
    (0, pg_core_1.index)("task_agent_runs_retry_of_run_id_idx").on(table.retryOfRunId),
]; });
exports.runCommands = (0, pg_core_1.pgTable)("run_commands", {
    id: (0, pg_core_1.text)("id").primaryKey(),
    runId: (0, columns_js_1.requiredReference)("run_id", function () { return exports.taskAgentRuns.id; }, "cascade"),
    requestedByUserId: (0, columns_js_1.requiredReference)("requested_by_user_id", function () { return identity_js_1.users.id; }, "restrict"),
    idempotencyKey: (0, pg_core_1.text)("idempotency_key").notNull(),
    type: (0, pg_core_1.text)("type").$type().notNull(),
    payload: (0, pg_core_1.jsonb)("payload").$type().notNull(),
    status: (0, pg_core_1.text)("status").$type().notNull(),
    error: (0, pg_core_1.text)("error"),
    createdAt: (0, columns_js_1.dateColumn)("created_at").notNull(),
    acknowledgedAt: (0, columns_js_1.dateColumn)("acknowledged_at"),
}, function (table) { return [
    (0, pg_core_1.uniqueIndex)("run_commands_run_actor_intent_idx").on(table.runId, table.requestedByUserId, table.idempotencyKey),
    (0, pg_core_1.index)("run_commands_actor_idx").on(table.requestedByUserId),
    (0, pg_core_1.index)("run_commands_run_status_idx").on(table.runId, table.status),
]; });
exports.runEvents = (0, pg_core_1.pgTable)("run_events", {
    runId: (0, columns_js_1.requiredReference)("run_id", function () { return exports.taskAgentRuns.id; }, "cascade"),
    seq: (0, pg_core_1.integer)("seq").notNull(),
    occurredAt: (0, columns_js_1.dateColumn)("occurred_at").notNull(),
    type: (0, pg_core_1.text)("type").$type().notNull(),
    payload: (0, pg_core_1.jsonb)("payload").$type().notNull(),
}, function (table) { return [(0, pg_core_1.primaryKey)({ columns: [table.runId, table.seq] })]; });
exports.runArtifacts = (0, pg_core_1.pgTable)("run_artifacts", {
    id: (0, pg_core_1.text)("id").primaryKey(),
    runId: (0, columns_js_1.requiredReference)("run_id", function () { return exports.taskAgentRuns.id; }, "cascade"),
    assetVersionId: (0, columns_js_1.requiredReference)("asset_version_id", function () { return resources_js_1.v2AssetVersions.id; }, "restrict"),
    name: (0, pg_core_1.text)("name").notNull(),
    createdAt: (0, columns_js_1.dateColumn)("created_at").notNull(),
}, function (table) { return [
    (0, pg_core_1.uniqueIndex)("run_artifacts_run_version_idx").on(table.runId, table.assetVersionId),
    (0, pg_core_1.index)("run_artifacts_version_idx").on(table.assetVersionId),
]; });
var templateObject_1;
//# sourceMappingURL=execution.js.map