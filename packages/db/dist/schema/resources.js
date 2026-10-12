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
exports.outboxEvents = exports.v2AgentRuns = exports.v2Activities = exports.v2Feedback = exports.v2Reviews = exports.v2AssetVersions = exports.v2Assets = void 0;
var columns_js_1 = require("./columns.js");
var pg_core_1 = require("drizzle-orm/pg-core");
var projects_js_1 = require("./projects.js");
var identity_js_1 = require("./identity.js");
var enums_js_1 = require("./enums.js");
exports.v2Assets = (0, pg_core_1.pgTable)("assets_v2", __assign({ id: (0, pg_core_1.text)("id").primaryKey(), projectId: (0, columns_js_1.requiredReference)("project_id", function () { return projects_js_1.v2Projects.id; }, "cascade"), createdByUserId: (0, columns_js_1.requiredReference)("created_by_user_id", function () { return identity_js_1.users.id; }, "restrict"), name: (0, pg_core_1.text)("name").notNull(), archived: (0, pg_core_1.boolean)("archived").notNull().default(false) }, (0, columns_js_1.timestamps)()), function (table) { return [(0, pg_core_1.index)("assets_v2_project_updated_idx").on(table.projectId, table.updatedAt)]; });
exports.v2AssetVersions = (0, pg_core_1.pgTable)("asset_versions_v2", {
    id: (0, pg_core_1.text)("id").primaryKey(),
    assetId: (0, columns_js_1.requiredReference)("asset_id", function () { return exports.v2Assets.id; }, "cascade"),
    projectId: (0, columns_js_1.requiredReference)("project_id", function () { return projects_js_1.v2Projects.id; }, "cascade"),
    createdByUserId: (0, columns_js_1.requiredReference)("created_by_user_id", function () { return identity_js_1.users.id; }, "restrict"),
    objectKey: (0, pg_core_1.text)("object_key").notNull(),
    byteSize: (0, pg_core_1.integer)("byte_size").notNull(),
    mediaType: (0, pg_core_1.text)("media_type").notNull(),
    checksum: (0, pg_core_1.text)("checksum").notNull(),
    createdAt: (0, columns_js_1.createdAt)(),
}, function (table) { return [
    (0, pg_core_1.index)("asset_versions_v2_object_key_idx").on(table.objectKey),
    (0, pg_core_1.index)("asset_versions_v2_project_created_idx").on(table.projectId, table.createdAt),
]; });
exports.v2Reviews = (0, pg_core_1.pgTable)("reviews_v2", __assign({ id: (0, pg_core_1.text)("id").primaryKey(), projectId: (0, columns_js_1.requiredReference)("project_id", function () { return projects_js_1.v2Projects.id; }, "cascade"), assetVersionId: (0, pg_core_1.text)("asset_version_id").references(function () { return exports.v2AssetVersions.id; }, {
        onDelete: "set null",
    }), createdByUserId: (0, columns_js_1.requiredReference)("created_by_user_id", function () { return identity_js_1.users.id; }, "restrict"), status: (0, enums_js_1.v2ReviewStatusEnum)("status").notNull().default("open"), title: (0, pg_core_1.text)("title").notNull() }, (0, columns_js_1.timestamps)()), function (table) { return [(0, pg_core_1.index)("reviews_v2_project_updated_idx").on(table.projectId, table.updatedAt)]; });
exports.v2Feedback = (0, pg_core_1.pgTable)("feedback_v2", __assign({ id: (0, pg_core_1.text)("id").primaryKey(), reviewId: (0, columns_js_1.requiredReference)("review_id", function () { return exports.v2Reviews.id; }, "cascade"), projectId: (0, columns_js_1.requiredReference)("project_id", function () { return projects_js_1.v2Projects.id; }, "cascade"), authorId: (0, columns_js_1.requiredReference)("author_id", function () { return identity_js_1.users.id; }, "restrict"), body: (0, pg_core_1.text)("body").notNull() }, (0, columns_js_1.timestamps)()), function (table) { return [(0, pg_core_1.index)("feedback_v2_review_created_idx").on(table.reviewId, table.createdAt)]; });
exports.v2Activities = (0, pg_core_1.pgTable)("activities_v2", {
    id: (0, pg_core_1.text)("id").primaryKey(),
    projectId: (0, columns_js_1.requiredReference)("project_id", function () { return projects_js_1.v2Projects.id; }, "cascade"),
    actorId: (0, columns_js_1.requiredReference)("actor_id", function () { return identity_js_1.users.id; }, "restrict"),
    type: (0, pg_core_1.text)("type").notNull(),
    payload: (0, pg_core_1.jsonb)("payload").$type().notNull(),
    occurredAt: (0, columns_js_1.dateColumn)("occurred_at").notNull().defaultNow(),
}, function (table) { return [(0, pg_core_1.index)("activities_v2_project_occurred_idx").on(table.projectId, table.occurredAt)]; });
exports.v2AgentRuns = (0, pg_core_1.pgTable)("agent_runs_v2", __assign({ id: (0, pg_core_1.text)("id").primaryKey(), projectId: (0, columns_js_1.requiredReference)("project_id", function () { return projects_js_1.v2Projects.id; }, "cascade"), requestedByUserId: (0, columns_js_1.requiredReference)("requested_by_user_id", function () { return identity_js_1.users.id; }, "restrict"), assetVersionId: (0, pg_core_1.text)("asset_version_id").references(function () { return exports.v2AssetVersions.id; }, {
        onDelete: "set null",
    }), status: (0, enums_js_1.v2AgentRunStatusEnum)("status").notNull().default("queued"), attempt: (0, pg_core_1.integer)("attempt").notNull().default(1), input: (0, pg_core_1.jsonb)("input").$type().notNull(), output: (0, pg_core_1.jsonb)("output").$type(), error: (0, pg_core_1.text)("error") }, (0, columns_js_1.timestamps)()), function (table) { return [(0, pg_core_1.index)("agent_runs_v2_project_status_idx").on(table.projectId, table.status)]; });
exports.outboxEvents = (0, pg_core_1.pgTable)("outbox_events", {
    id: (0, pg_core_1.text)("id").primaryKey(),
    type: (0, pg_core_1.text)("type").notNull(),
    payload: (0, pg_core_1.jsonb)("payload").$type().notNull(),
    availableAt: (0, columns_js_1.dateColumn)("available_at").notNull().defaultNow(),
    leaseOwner: (0, pg_core_1.text)("lease_owner"),
    leasedUntil: (0, columns_js_1.dateColumn)("leased_until"),
    deliveredAt: (0, columns_js_1.dateColumn)("delivered_at"),
    attempts: (0, pg_core_1.integer)("attempts").notNull().default(0),
    createdAt: (0, columns_js_1.createdAt)(),
}, function (table) { return [
    (0, pg_core_1.index)("outbox_events_available_idx").on(table.availableAt, table.leasedUntil),
    (0, pg_core_1.index)("outbox_events_delivered_idx").on(table.deliveredAt),
]; });
//# sourceMappingURL=resources.js.map