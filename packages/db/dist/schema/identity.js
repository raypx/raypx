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
exports.systemSecrets = exports.systemSettings = exports.auditEvents = exports.authVerifications = exports.authAccounts = exports.authSessions = exports.users = void 0;
var columns_js_1 = require("./columns.js");
var drizzle_orm_1 = require("drizzle-orm");
var pg_core_1 = require("drizzle-orm/pg-core");
var enums_js_1 = require("./enums.js");
exports.users = (0, pg_core_1.pgTable)("users", __assign({ id: (0, pg_core_1.text)("id").primaryKey(), email: (0, pg_core_1.text)("email").notNull().unique(), displayName: (0, pg_core_1.text)("display_name").notNull(), emailVerified: (0, pg_core_1.boolean)("email_verified").notNull().default(false), image: (0, pg_core_1.text)("image"), role: (0, enums_js_1.roleEnum)("role").notNull().default("user"), status: (0, enums_js_1.userStatusEnum)("status").notNull().default("active") }, (0, columns_js_1.timestamps)()), function (table) { return [
    (0, pg_core_1.index)("users_created_at_idx").on(table.createdAt),
    (0, pg_core_1.index)("users_status_role_idx").on(table.status, table.role),
]; });
exports.authSessions = (0, pg_core_1.pgTable)("auth_sessions", __assign(__assign({ id: (0, pg_core_1.text)("id").primaryKey(), expiresAt: (0, columns_js_1.dateColumn)("expires_at").notNull(), token: (0, pg_core_1.text)("token").notNull().unique() }, (0, columns_js_1.timestamps)()), { ipAddress: (0, pg_core_1.text)("ip_address"), userAgent: (0, pg_core_1.text)("user_agent"), userId: (0, columns_js_1.requiredReference)("user_id", function () { return exports.users.id; }, "cascade") }), function (table) { return [(0, pg_core_1.index)("auth_sessions_user_id_idx").on(table.userId)]; });
exports.authAccounts = (0, pg_core_1.pgTable)("auth_accounts", __assign({ id: (0, pg_core_1.text)("id").primaryKey(), issuer: (0, pg_core_1.text)("issuer").notNull().default("voidmix"), accountId: (0, pg_core_1.text)("account_id").notNull(), providerId: (0, pg_core_1.text)("provider_id").notNull(), userId: (0, columns_js_1.requiredReference)("user_id", function () { return exports.users.id; }, "cascade"), accessToken: (0, pg_core_1.text)("access_token"), refreshToken: (0, pg_core_1.text)("refresh_token"), idToken: (0, pg_core_1.text)("id_token"), accessTokenExpiresAt: (0, columns_js_1.dateColumn)("access_token_expires_at"), refreshTokenExpiresAt: (0, columns_js_1.dateColumn)("refresh_token_expires_at"), scope: (0, pg_core_1.text)("scope"), password: (0, pg_core_1.text)("password") }, (0, columns_js_1.timestamps)()), function (table) { return [
    (0, pg_core_1.index)("auth_accounts_user_id_idx").on(table.userId),
    (0, pg_core_1.uniqueIndex)("auth_accounts_provider_account_idx").on(table.providerId, table.accountId),
]; });
exports.authVerifications = (0, pg_core_1.pgTable)("auth_verifications", __assign({ id: (0, pg_core_1.text)("id").primaryKey(), identifier: (0, pg_core_1.text)("identifier").notNull(), value: (0, pg_core_1.text)("value").notNull(), expiresAt: (0, columns_js_1.dateColumn)("expires_at").notNull() }, (0, columns_js_1.timestamps)()), function (table) { return [(0, pg_core_1.index)("auth_verifications_identifier_idx").on(table.identifier)]; });
exports.auditEvents = (0, pg_core_1.pgTable)("audit_events", {
    id: (0, pg_core_1.text)("id").primaryKey(),
    actorId: (0, pg_core_1.text)("actor_id")
        .notNull()
        .references(function () { return exports.users.id; }, { onDelete: "restrict", onUpdate: "cascade" }),
    action: (0, enums_js_1.auditActionEnum)("action").notNull(),
    targetType: (0, enums_js_1.auditTargetTypeEnum)("target_type").notNull().default("user"),
    targetId: (0, pg_core_1.text)("target_id").notNull(),
    targetUserId: (0, pg_core_1.text)("target_user_id")
        .generatedAlwaysAs((0, drizzle_orm_1.sql)(templateObject_1 || (templateObject_1 = __makeTemplateObject(["case when \"target_type\" = 'user' then \"target_id\" else null end"], ["case when \"target_type\" = 'user' then \"target_id\" else null end"]))))
        // No `onUpdate`: PostgreSQL rejects a referential action that would have
        // to write a generated column ("invalid ON UPDATE action for foreign key
        // constraint containing generated column"). `restrict` never writes.
        .references(function () { return exports.users.id; }, { onDelete: "restrict" }),
    occurredAt: (0, columns_js_1.dateColumn)("occurred_at").notNull().defaultNow(),
    metadata: (0, pg_core_1.jsonb)("metadata").$type().notNull(),
}, function (table) { return [
    (0, pg_core_1.index)("audit_events_occurred_at_idx").on(table.occurredAt),
    (0, pg_core_1.index)("audit_events_actor_id_idx").on(table.actorId),
    (0, pg_core_1.index)("audit_events_target_id_idx").on(table.targetId),
    (0, pg_core_1.index)("audit_events_target_user_id_idx").on(table.targetUserId),
]; });
exports.systemSettings = (0, pg_core_1.pgTable)("system_settings", {
    key: (0, pg_core_1.text)("key").primaryKey(),
    value: (0, pg_core_1.text)("value").notNull(),
    updatedAt: (0, columns_js_1.dateColumn)("updated_at").notNull().defaultNow(),
    updatedBy: (0, pg_core_1.text)("updated_by").references(function () { return exports.users.id; }, {
        onDelete: "set null",
        onUpdate: "cascade",
    }),
}, function (table) { return [(0, pg_core_1.index)("system_settings_updated_by_idx").on(table.updatedBy)]; });
exports.systemSecrets = (0, pg_core_1.pgTable)("system_secrets", {
    key: (0, pg_core_1.text)("key").primaryKey(),
    value: (0, pg_core_1.text)("value").notNull(),
    updatedAt: (0, columns_js_1.dateColumn)("updated_at").notNull().defaultNow(),
    updatedBy: (0, pg_core_1.text)("updated_by").references(function () { return exports.users.id; }, {
        onDelete: "set null",
        onUpdate: "cascade",
    }),
}, function (table) { return [(0, pg_core_1.index)("system_secrets_updated_by_idx").on(table.updatedBy)]; });
var templateObject_1;
//# sourceMappingURL=identity.js.map