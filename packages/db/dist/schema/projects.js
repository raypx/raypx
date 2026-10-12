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
exports.v2ProjectTasks = exports.v2ProjectMembers = exports.v2Projects = exports.organizationMembers = exports.organizations = void 0;
var columns_js_1 = require("./columns.js");
var drizzle_orm_1 = require("drizzle-orm");
var pg_core_1 = require("drizzle-orm/pg-core");
var identity_js_1 = require("./identity.js");
var enums_js_1 = require("./enums.js");
exports.organizations = (0, pg_core_1.pgTable)("organizations", __assign({ id: (0, pg_core_1.text)("id").primaryKey(), name: (0, pg_core_1.text)("name").notNull(), createdByUserId: (0, columns_js_1.requiredReference)("created_by_user_id", function () { return identity_js_1.users.id; }, "restrict") }, (0, columns_js_1.timestamps)()), function (table) { return [(0, pg_core_1.index)("organizations_created_by_user_id_idx").on(table.createdByUserId)]; });
exports.organizationMembers = (0, pg_core_1.pgTable)("organization_members", __assign({ id: (0, pg_core_1.text)("id").primaryKey(), organizationId: (0, columns_js_1.requiredReference)("organization_id", function () { return exports.organizations.id; }, "cascade"), userId: (0, columns_js_1.requiredReference)("user_id", function () { return identity_js_1.users.id; }, "cascade"), role: (0, enums_js_1.organizationRoleEnum)("role").notNull().default("viewer"), status: (0, enums_js_1.organizationMembershipStatusEnum)("status").notNull().default("active") }, (0, columns_js_1.timestamps)()), function (table) { return [
    (0, pg_core_1.uniqueIndex)("organization_members_organization_user_idx").on(table.organizationId, table.userId),
    (0, pg_core_1.index)("organization_members_user_status_idx").on(table.userId, table.status),
]; });
exports.v2Projects = (0, pg_core_1.pgTable)("projects_v2", __assign({ id: (0, pg_core_1.text)("id").primaryKey(), createdByUserId: (0, columns_js_1.requiredReference)("created_by_user_id", function () { return identity_js_1.users.id; }, "restrict"), personalOwnerId: (0, pg_core_1.text)("personal_owner_id").references(function () { return identity_js_1.users.id; }, { onDelete: "restrict" }), organizationId: (0, pg_core_1.text)("organization_id").references(function () { return exports.organizations.id; }, {
        onDelete: "restrict",
    }), title: (0, pg_core_1.text)("title").notNull(), description: (0, pg_core_1.text)("description"), stage: (0, enums_js_1.projectStageEnum)("stage").notNull().default("draft"), archived: (0, pg_core_1.boolean)("archived").notNull().default(false), deadline: (0, columns_js_1.dateColumn)("deadline") }, (0, columns_js_1.timestamps)()), function (table) { return [
    (0, pg_core_1.check)("projects_v2_single_owner_scope", drizzle_orm_1.sql.raw('(("personal_owner_id" IS NOT NULL)::int + ("organization_id" IS NOT NULL)::int) = 1')),
    (0, pg_core_1.index)("projects_v2_personal_owner_updated_idx").on(table.personalOwnerId, table.updatedAt),
    (0, pg_core_1.index)("projects_v2_organization_updated_idx").on(table.organizationId, table.updatedAt),
]; });
exports.v2ProjectMembers = (0, pg_core_1.pgTable)("project_members_v2", __assign({ id: (0, pg_core_1.text)("id").primaryKey(), projectId: (0, columns_js_1.requiredReference)("project_id", function () { return exports.v2Projects.id; }, "cascade"), userId: (0, columns_js_1.requiredReference)("user_id", function () { return identity_js_1.users.id; }, "cascade"), role: (0, enums_js_1.v2ProjectMemberRoleEnum)("role").notNull(), status: (0, enums_js_1.v2ProjectMemberStatusEnum)("status").notNull().default("active") }, (0, columns_js_1.timestamps)()), function (table) { return [
    (0, pg_core_1.uniqueIndex)("project_members_v2_project_user_idx").on(table.projectId, table.userId),
    (0, pg_core_1.index)("project_members_v2_user_status_idx").on(table.userId, table.status),
]; });
exports.v2ProjectTasks = (0, pg_core_1.pgTable)("project_tasks_v2", __assign({ id: (0, pg_core_1.text)("id").primaryKey(), projectId: (0, columns_js_1.requiredReference)("project_id", function () { return exports.v2Projects.id; }, "cascade"), title: (0, pg_core_1.text)("title").notNull(), status: (0, enums_js_1.projectTaskStatusEnum)("status").notNull().default("todo"), createdByUserId: (0, columns_js_1.requiredReference)("created_by_user_id", function () { return identity_js_1.users.id; }, "restrict") }, (0, columns_js_1.timestamps)()), function (table) { return [(0, pg_core_1.index)("project_tasks_v2_project_updated_idx").on(table.projectId, table.updatedAt)]; });
//# sourceMappingURL=projects.js.map