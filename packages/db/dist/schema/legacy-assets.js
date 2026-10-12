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
exports.agentLeases = exports.agentSteps = exports.agentRuns = exports.syncConflicts = exports.assetReferences = exports.assetVersions = exports.assets = void 0;
var columns_js_1 = require("./columns.js");
var pg_core_1 = require("drizzle-orm/pg-core");
var enums_js_1 = require("./enums.js");
var identity_js_1 = require("./identity.js");
var legacy_projects_js_1 = require("./legacy-projects.js");
exports.assets = (0, pg_core_1.pgTable)("assets", __assign({ id: (0, pg_core_1.text)("id").primaryKey(), workspaceId: (0, pg_core_1.text)("workspace_id").notNull(), path: (0, pg_core_1.text)("path").notNull(), status: (0, enums_js_1.assetStatusEnum)("status").notNull().default("active"), headVersionId: (0, pg_core_1.text)("head_version_id") }, (0, columns_js_1.timestamps)()), function (table) { return [
    (0, pg_core_1.uniqueIndex)("assets_workspace_id_path_idx").on(table.workspaceId, table.path),
    (0, pg_core_1.index)("assets_workspace_id_status_idx").on(table.workspaceId, table.status),
    (0, pg_core_1.index)("assets_head_version_id_idx").on(table.headVersionId),
]; });
exports.assetVersions = (0, pg_core_1.pgTable)("asset_versions", {
    id: (0, pg_core_1.text)("id").primaryKey(),
    assetId: (0, columns_js_1.requiredReference)("asset_id", function () { return exports.assets.id; }, "cascade"),
    workspaceId: (0, pg_core_1.text)("workspace_id").notNull(),
    blobHash: (0, pg_core_1.text)("blob_hash").notNull(),
    byteSize: (0, pg_core_1.integer)("byte_size").notNull(),
    contentType: (0, pg_core_1.text)("content_type"),
    parentVersionId: (0, pg_core_1.text)("parent_version_id"),
    createdBy: (0, columns_js_1.requiredReference)("created_by", function () { return identity_js_1.users.id; }, "restrict"),
    createdAt: (0, columns_js_1.createdAt)(),
    idempotencyKey: (0, pg_core_1.text)("idempotency_key").notNull(),
}, function (table) { return [
    (0, pg_core_1.uniqueIndex)("asset_versions_asset_id_idempotency_key_idx").on(table.assetId, table.idempotencyKey),
    (0, pg_core_1.index)("asset_versions_asset_id_created_at_idx").on(table.assetId, table.createdAt),
    (0, pg_core_1.index)("asset_versions_workspace_id_idx").on(table.workspaceId),
    (0, pg_core_1.index)("asset_versions_parent_version_id_idx").on(table.parentVersionId),
]; });
exports.assetReferences = (0, pg_core_1.pgTable)("asset_references", {
    id: (0, pg_core_1.text)("id").primaryKey(),
    projectId: (0, columns_js_1.requiredReference)("project_id", function () { return legacy_projects_js_1.projects.id; }, "cascade"),
    assetId: (0, columns_js_1.requiredReference)("asset_id", function () { return exports.assets.id; }, "cascade"),
    versionId: (0, pg_core_1.text)("version_id").references(function () { return exports.assetVersions.id; }, { onDelete: "set null" }),
    workspaceId: (0, pg_core_1.text)("workspace_id").notNull(),
    label: (0, pg_core_1.text)("label"),
    createdAt: (0, columns_js_1.createdAt)(),
}, function (table) { return [
    (0, pg_core_1.uniqueIndex)("asset_references_project_id_asset_id_idx").on(table.projectId, table.assetId),
    (0, pg_core_1.index)("asset_references_project_id_created_at_idx").on(table.projectId, table.createdAt),
    (0, pg_core_1.index)("asset_references_asset_id_idx").on(table.assetId),
]; });
exports.syncConflicts = (0, pg_core_1.pgTable)("sync_conflicts", {
    id: (0, pg_core_1.text)("id").primaryKey(),
    workspaceId: (0, pg_core_1.text)("workspace_id").notNull(),
    assetId: (0, columns_js_1.requiredReference)("asset_id", function () { return exports.assets.id; }, "cascade"),
    localVersionId: (0, pg_core_1.text)("local_version_id"),
    remoteVersionId: (0, pg_core_1.text)("remote_version_id"),
    expectedHeadVersionId: (0, pg_core_1.text)("expected_head_version_id"),
    actualHeadVersionId: (0, pg_core_1.text)("actual_head_version_id"),
    status: (0, enums_js_1.syncConflictStatusEnum)("status").notNull().default("open"),
    detectedAt: (0, columns_js_1.dateColumn)("detected_at").notNull().defaultNow(),
    resolvedAt: (0, columns_js_1.dateColumn)("resolved_at"),
    resolvedBy: (0, pg_core_1.text)("resolved_by").references(function () { return identity_js_1.users.id; }, { onDelete: "set null" }),
}, function (table) { return [
    (0, pg_core_1.index)("sync_conflicts_workspace_id_status_idx").on(table.workspaceId, table.status),
    (0, pg_core_1.index)("sync_conflicts_asset_id_idx").on(table.assetId),
    (0, pg_core_1.index)("sync_conflicts_detected_at_idx").on(table.detectedAt),
]; });
exports.agentRuns = (0, pg_core_1.pgTable)("agent_runs", __assign({ id: (0, pg_core_1.text)("id").primaryKey(), workspaceId: (0, pg_core_1.text)("workspace_id").notNull(), requestedBy: (0, columns_js_1.requiredReference)("requested_by", function () { return identity_js_1.users.id; }, "restrict"), status: (0, enums_js_1.agentRunStatusEnum)("status").notNull().default("queued"), goal: (0, pg_core_1.text)("goal").notNull(), currentStepId: (0, pg_core_1.text)("current_step_id") }, (0, columns_js_1.timestamps)()), function (table) { return [
    (0, pg_core_1.index)("agent_runs_workspace_id_status_idx").on(table.workspaceId, table.status),
    (0, pg_core_1.index)("agent_runs_requested_by_idx").on(table.requestedBy),
    (0, pg_core_1.index)("agent_runs_updated_at_idx").on(table.updatedAt),
]; });
exports.agentSteps = (0, pg_core_1.pgTable)("agent_steps", {
    id: (0, pg_core_1.text)("id").primaryKey(),
    runId: (0, columns_js_1.requiredReference)("run_id", function () { return exports.agentRuns.id; }, "cascade"),
    sequence: (0, pg_core_1.integer)("sequence").notNull(),
    status: (0, enums_js_1.agentStepStatusEnum)("status").notNull().default("queued"),
    name: (0, pg_core_1.text)("name").notNull(),
    startedAt: (0, columns_js_1.dateColumn)("started_at"),
    finishedAt: (0, columns_js_1.dateColumn)("finished_at"),
    error: (0, pg_core_1.text)("error"),
}, function (table) { return [
    (0, pg_core_1.uniqueIndex)("agent_steps_run_id_sequence_idx").on(table.runId, table.sequence),
    (0, pg_core_1.index)("agent_steps_run_id_status_idx").on(table.runId, table.status),
]; });
exports.agentLeases = (0, pg_core_1.pgTable)("agent_leases", {
    runId: (0, pg_core_1.text)("run_id")
        .primaryKey()
        .references(function () { return exports.agentRuns.id; }, { onDelete: "cascade" }),
    holderId: (0, pg_core_1.text)("holder_id").notNull(),
    acquiredAt: (0, columns_js_1.dateColumn)("acquired_at").notNull(),
    heartbeatAt: (0, columns_js_1.dateColumn)("heartbeat_at").notNull(),
    expiresAt: (0, columns_js_1.dateColumn)("expires_at").notNull(),
}, function (table) { return [(0, pg_core_1.index)("agent_leases_expires_at_idx").on(table.expiresAt)]; });
//# sourceMappingURL=legacy-assets.js.map