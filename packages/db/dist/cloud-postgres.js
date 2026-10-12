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
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PostgresCloudRepository = void 0;
var drizzle_orm_1 = require("drizzle-orm");
var core_1 = require("@voidmix/core");
var schema_js_1 = require("./schema.js");
var cloud_memory_js_1 = require("./cloud-memory.js");
var tableNames = {
    mutations: "cloud_mutations",
    preferences: "cloud_preferences",
    conversations: "cloud_conversations",
    turns: "cloud_turns",
    tasks: "cloud_tasks",
    rounds: "cloud_task_rounds",
    spendingGrants: "cloud_spending_grants",
    messages: "cloud_messages",
    executionGrants: "cloud_execution_grants",
    runs: "cloud_runs",
    executions: "cloud_executions",
    tools: "cloud_tools",
    sources: "cloud_sources",
    assets: "cloud_assets",
    revisions: "cloud_revisions",
    usage: "cloud_usage_calls",
    notifications: "cloud_notifications",
    commands: "cloud_commands",
};
var dates = new Set([
    "createdAt",
    "updatedAt",
    "startedAt",
    "completedAt",
    "heartbeatAt",
    "leaseExpiresAt",
    "revokedAt",
    "expiresAt",
    "settledAt",
    "readAt",
    "emailDeliveredAt",
    "verifiedAt",
    "occurredAt",
]);
function hydrate(data) {
    var restore = function (value) {
        if (!value || typeof value !== "object" || Array.isArray(value))
            return value;
        var record = __assign({}, value);
        for (var _i = 0, dates_1 = dates; _i < dates_1.length; _i++) {
            var field = dates_1[_i];
            var child = record[field];
            if (typeof child === "string")
                record[field] = new Date(child);
        }
        return record;
    };
    var record = restore(data);
    // Durable mutation replay contains a domain DTO. Arbitrary tool bodies/event payloads stay JSON.
    if (record && typeof record === "object" && "response" in record) {
        var response = restore(record["response"]);
        if (response && typeof response === "object" && !Array.isArray(response)) {
            var projected = response;
            for (var _i = 0, _a = ["task", "round", "run", "turn"]; _i < _a.length; _i++) {
                var key = _a[_i];
                if (projected[key])
                    projected[key] = restore(projected[key]);
            }
        }
        record["response"] = response;
    }
    return record;
}
function txFor(db, writing) {
    var _this = this;
    var held = new Set();
    var lock = function (keys) { return __awaiter(_this, void 0, void 0, function () {
        var _i, _a, key;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    _i = 0, _a = __spreadArray([], new Set(keys), true).sort();
                    _b.label = 1;
                case 1:
                    if (!(_i < _a.length)) return [3 /*break*/, 4];
                    key = _a[_i];
                    if (!!held.has(key)) return [3 /*break*/, 3];
                    return [4 /*yield*/, db.execute((0, drizzle_orm_1.sql)(templateObject_1 || (templateObject_1 = __makeTemplateObject(["SELECT pg_advisory_xact_lock(hashtextextended(", ",0))"], ["SELECT pg_advisory_xact_lock(hashtextextended(", ",0))"])), "cloud:".concat(key)))];
                case 2:
                    _b.sent();
                    held.add(key);
                    _b.label = 3;
                case 3:
                    _i++;
                    return [3 /*break*/, 1];
                case 4: return [2 /*return*/];
            }
        });
    }); };
    return {
        lock: lock,
        activeTaskRun: function (taskId) { return __awaiter(_this, void 0, void 0, function () {
            var rows;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, db.execute((0, drizzle_orm_1.sql)(templateObject_2 || (templateObject_2 = __makeTemplateObject(["SELECT data FROM cloud_runs WHERE task_id=", " AND status IN ('queued','running') LIMIT 1"], ["SELECT data FROM cloud_runs WHERE task_id=", " AND status IN ('queued','running') LIMIT 1"])), taskId))];
                    case 1:
                        rows = _a.sent();
                        return [2 /*return*/, rows[0] ? hydrate(rows[0].data) : null];
                }
            });
        }); },
        readyRuns: function (limit) { return __awaiter(_this, void 0, void 0, function () {
            var rows;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, db.execute((0, drizzle_orm_1.sql)(templateObject_3 || (templateObject_3 = __makeTemplateObject(["SELECT data FROM cloud_runs WHERE status='queued' AND dispatch_ready=true ORDER BY created_at,id LIMIT ", ""], ["SELECT data FROM cloud_runs WHERE status='queued' AND dispatch_ready=true ORDER BY created_at,id LIMIT ", ""])), limit))];
                    case 1:
                        rows = _a.sent();
                        return [2 /*return*/, rows.map(function (row) { return hydrate(row.data); })];
                }
            });
        }); },
        expiredRuns: function (now, limit) { return __awaiter(_this, void 0, void 0, function () {
            var rows;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, db.execute((0, drizzle_orm_1.sql)(templateObject_4 || (templateObject_4 = __makeTemplateObject(["SELECT data FROM cloud_runs WHERE status='running' AND (lease_expires_at IS NULL OR lease_expires_at<=", ") ORDER BY lease_expires_at NULLS FIRST,id LIMIT ", ""], ["SELECT data FROM cloud_runs WHERE status='running' AND (lease_expires_at IS NULL OR lease_expires_at<=", ") ORDER BY lease_expires_at NULLS FIRST,id LIMIT ", ""])), now.toISOString(), limit))];
                    case 1:
                        rows = _a.sent();
                        return [2 /*return*/, rows.map(function (row) { return hydrate(row.data); })];
                }
            });
        }); },
        get: function (kind, id) { return __awaiter(_this, void 0, void 0, function () {
            var rows;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, db.execute((0, drizzle_orm_1.sql)(templateObject_5 || (templateObject_5 = __makeTemplateObject(["SELECT data FROM ", " WHERE id=", " LIMIT 1"], ["SELECT data FROM ", " WHERE id=", " LIMIT 1"])), drizzle_orm_1.sql.identifier(tableNames[kind]), id))];
                    case 1:
                        rows = _a.sent();
                        return [2 /*return*/, rows[0] ? hydrate(rows[0].data) : null];
                }
            });
        }); },
        list: function (kind_1) {
            var args_1 = [];
            for (var _i = 1; _i < arguments.length; _i++) {
                args_1[_i - 1] = arguments[_i];
            }
            return __awaiter(_this, __spreadArray([kind_1], args_1, true), void 0, function (kind, query) {
                var conditions, runId, rows;
                if (query === void 0) { query = {}; }
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0:
                            conditions = [(0, drizzle_orm_1.sql)(templateObject_6 || (templateObject_6 = __makeTemplateObject(["true"], ["true"])))];
                            if (query.ownerAccountId)
                                conditions.push((0, drizzle_orm_1.sql)(templateObject_8 || (templateObject_8 = __makeTemplateObject(["", "=", ""], ["", "=", ""])), kind === "usage" ? drizzle_orm_1.sql.identifier("owner_account_id") : kind === "runs" ? drizzle_orm_1.sql.identifier("owner_account_id") : (0, drizzle_orm_1.sql)(templateObject_7 || (templateObject_7 = __makeTemplateObject(["data->>'ownerAccountId'"], ["data->>'ownerAccountId'"]))), query.ownerAccountId));
                            if (query.roundId)
                                conditions.push((0, drizzle_orm_1.sql)(templateObject_10 || (templateObject_10 = __makeTemplateObject(["", "=", ""], ["", "=", ""])), kind === "runs" || kind === "usage" ? drizzle_orm_1.sql.identifier("round_id") : (0, drizzle_orm_1.sql)(templateObject_9 || (templateObject_9 = __makeTemplateObject(["data->>'roundId'"], ["data->>'roundId'"]))), query.roundId));
                            if (query.runIds) {
                                runId = kind === "usage" ? drizzle_orm_1.sql.identifier("run_id") : (0, drizzle_orm_1.sql)(templateObject_11 || (templateObject_11 = __makeTemplateObject(["data->>'runId'"], ["data->>'runId'"])));
                                conditions.push(query.runIds.length
                                    ? (0, drizzle_orm_1.sql)(templateObject_14 || (templateObject_14 = __makeTemplateObject(["", " IN (", ")"], ["", " IN (", ")"])), runId, drizzle_orm_1.sql.join(query.runIds.map(function (id) { return (0, drizzle_orm_1.sql)(templateObject_12 || (templateObject_12 = __makeTemplateObject(["", ""], ["", ""])), id); }), (0, drizzle_orm_1.sql)(templateObject_13 || (templateObject_13 = __makeTemplateObject([","], [","]))))) : (0, drizzle_orm_1.sql)(templateObject_15 || (templateObject_15 = __makeTemplateObject(["false"], ["false"]))));
                            }
                            if (query.turnIds)
                                conditions.push(query.turnIds.length
                                    ? (0, drizzle_orm_1.sql)(templateObject_18 || (templateObject_18 = __makeTemplateObject(["coalesce(data->>'sourceTurnId',data->>'turnId') IN (", ")"], ["coalesce(data->>'sourceTurnId',data->>'turnId') IN (", ")"])), drizzle_orm_1.sql.join(query.turnIds.map(function (id) { return (0, drizzle_orm_1.sql)(templateObject_16 || (templateObject_16 = __makeTemplateObject(["", ""], ["", ""])), id); }), (0, drizzle_orm_1.sql)(templateObject_17 || (templateObject_17 = __makeTemplateObject([","], [","]))))) : (0, drizzle_orm_1.sql)(templateObject_19 || (templateObject_19 = __makeTemplateObject(["false"], ["false"]))));
                            if (query.published !== undefined)
                                conditions.push((0, drizzle_orm_1.sql)(templateObject_20 || (templateObject_20 = __makeTemplateObject(["(data->>'published')::boolean=", ""], ["(data->>'published')::boolean=", ""])), query.published));
                            if (query.status)
                                conditions.push((0, drizzle_orm_1.sql)(templateObject_21 || (templateObject_21 = __makeTemplateObject(["status=", ""], ["status=", ""])), query.status));
                            if (query.scope)
                                conditions.push(query.scope.type === "personal"
                                    ? (0, drizzle_orm_1.sql)(templateObject_22 || (templateObject_22 = __makeTemplateObject(["scope_type='personal' AND owner_user_id=", ""], ["scope_type='personal' AND owner_user_id=", ""])), query.scope.ownerUserId) : (0, drizzle_orm_1.sql)(templateObject_23 || (templateObject_23 = __makeTemplateObject(["scope_type='project' AND project_id=", ""], ["scope_type='project' AND project_id=", ""])), query.scope.projectId));
                            if (query.parentId)
                                conditions.push(kind === "runs"
                                    ? (0, drizzle_orm_1.sql)(templateObject_24 || (templateObject_24 = __makeTemplateObject(["(conversation_id=", " OR task_id=", ")"], ["(conversation_id=", " OR task_id=", ")"])), query.parentId, query.parentId) : kind === "usage"
                                    ? (0, drizzle_orm_1.sql)(templateObject_25 || (templateObject_25 = __makeTemplateObject(["run_id=", ""], ["run_id=", ""])), query.parentId) : (0, drizzle_orm_1.sql)(templateObject_26 || (templateObject_26 = __makeTemplateObject(["(parent_id=", " OR secondary_parent_id=", ")"], ["(parent_id=", " OR secondary_parent_id=", ")"])), query.parentId, query.parentId));
                            if (query.actorId)
                                conditions.push((0, drizzle_orm_1.sql)(templateObject_27 || (templateObject_27 = __makeTemplateObject(["actor_id=", ""], ["actor_id=", ""])), query.actorId));
                            if (query.idempotencyKey)
                                conditions.push((0, drizzle_orm_1.sql)(templateObject_28 || (templateObject_28 = __makeTemplateObject(["idempotency_key=", ""], ["idempotency_key=", ""])), query.idempotencyKey));
                            if (query.before)
                                conditions.push((0, drizzle_orm_1.sql)(templateObject_29 || (templateObject_29 = __makeTemplateObject(["(created_at,id)<(", ",", ")"], ["(created_at,id)<(", ",", ")"])), query.before.createdAt.toISOString(), query.before.id));
                            return [4 /*yield*/, db.execute((0, drizzle_orm_1.sql)(templateObject_33 || (templateObject_33 = __makeTemplateObject(["SELECT data FROM ", " WHERE ", " ORDER BY created_at DESC,id DESC ", ""], ["SELECT data FROM ", " WHERE ", " ORDER BY created_at DESC,id DESC ", ""])), drizzle_orm_1.sql.identifier(tableNames[kind]), drizzle_orm_1.sql.join(conditions, (0, drizzle_orm_1.sql)(templateObject_30 || (templateObject_30 = __makeTemplateObject([" AND "], [" AND "])))), query.limit ? (0, drizzle_orm_1.sql)(templateObject_31 || (templateObject_31 = __makeTemplateObject(["LIMIT ", ""], ["LIMIT ", ""])), query.limit) : (0, drizzle_orm_1.sql)(templateObject_32 || (templateObject_32 = __makeTemplateObject([""], [""])))))];
                        case 1:
                            rows = _a.sent();
                            return [2 /*return*/, rows.map(function (r) { return hydrate(r.data); })];
                    }
                });
            });
        },
        remove: function (kind, id) { return __awaiter(_this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, db.execute((0, drizzle_orm_1.sql)(templateObject_34 || (templateObject_34 = __makeTemplateObject(["DELETE FROM ", " WHERE id=", ""], ["DELETE FROM ", " WHERE id=", ""])), drizzle_orm_1.sql.identifier(tableNames[kind]), id))];
                    case 1:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        }); },
        save: function (kind, entity) { return __awaiter(_this, void 0, void 0, function () {
            var prior, stored, round, record, parents, names, values;
            var _a, _b, _c;
            return __generator(this, function (_d) {
                switch (_d.label) {
                    case 0:
                        if (!(kind === "rounds")) return [3 /*break*/, 2];
                        return [4 /*yield*/, db.execute((0, drizzle_orm_1.sql)(templateObject_35 || (templateObject_35 = __makeTemplateObject(["SELECT data FROM cloud_task_rounds WHERE id=", ""], ["SELECT data FROM cloud_task_rounds WHERE id=", ""])), entity.id))];
                    case 1:
                        prior = _d.sent();
                        if (prior[0]) {
                            stored = hydrate(prior[0].data);
                            round = entity;
                            if (!(0, core_1.sameCloudTaskRound)(stored, round))
                                throw new core_1.CloudDomainError("CLOUD_INVALID_INPUT", "Task rounds are immutable.");
                        }
                        _d.label = 2;
                    case 2:
                        record = entity;
                        parents = (0, cloud_memory_js_1.cloudParentIds)(kind, entity);
                        names = [
                            "id",
                            "scope_type",
                            "owner_user_id",
                            "project_id",
                            "actor_id",
                            "parent_id",
                            "secondary_parent_id",
                            "idempotency_key",
                            "data",
                            "created_at",
                            "updated_at",
                        ];
                        values = [
                            (0, drizzle_orm_1.sql)(templateObject_36 || (templateObject_36 = __makeTemplateObject(["", ""], ["", ""])), entity.id),
                            (0, drizzle_orm_1.sql)(templateObject_37 || (templateObject_37 = __makeTemplateObject(["", ""], ["", ""])), entity.scope.type),
                            (0, drizzle_orm_1.sql)(templateObject_38 || (templateObject_38 = __makeTemplateObject(["", ""], ["", ""])), entity.scope.type === "personal" ? entity.scope.ownerUserId : null),
                            (0, drizzle_orm_1.sql)(templateObject_39 || (templateObject_39 = __makeTemplateObject(["", ""], ["", ""])), entity.scope.type === "project" ? entity.scope.projectId : null),
                            (0, drizzle_orm_1.sql)(templateObject_40 || (templateObject_40 = __makeTemplateObject(["", ""], ["", ""])), (0, cloud_memory_js_1.cloudActorId)(kind, entity)),
                            (0, drizzle_orm_1.sql)(templateObject_41 || (templateObject_41 = __makeTemplateObject(["", ""], ["", ""])), (_a = parents[0]) !== null && _a !== void 0 ? _a : null),
                            (0, drizzle_orm_1.sql)(templateObject_42 || (templateObject_42 = __makeTemplateObject(["", ""], ["", ""])), (_b = parents[1]) !== null && _b !== void 0 ? _b : null),
                            (0, drizzle_orm_1.sql)(templateObject_43 || (templateObject_43 = __makeTemplateObject(["", ""], ["", ""])), (_c = (kind === "runs" ? record["turnId"] : record["idempotencyKey"])) !== null && _c !== void 0 ? _c : null),
                            (0, drizzle_orm_1.sql)(templateObject_44 || (templateObject_44 = __makeTemplateObject(["", "::jsonb"], ["", "::jsonb"])), JSON.stringify(entity)),
                            (0, drizzle_orm_1.sql)(templateObject_45 || (templateObject_45 = __makeTemplateObject(["", ""], ["", ""])), entity.createdAt.toISOString()),
                            (0, drizzle_orm_1.sql)(templateObject_46 || (templateObject_46 = __makeTemplateObject(["", ""], ["", ""])), entity.updatedAt.toISOString()),
                        ];
                        if (kind === "runs") {
                            names.push("task_id", "conversation_id", "status", "dispatch_ready", "owner_id", "epoch", "round_id", "owner_account_id", "lease_expires_at", "cancel_requested");
                            values.push((0, drizzle_orm_1.sql)(templateObject_47 || (templateObject_47 = __makeTemplateObject(["", ""], ["", ""])), record["taskId"]), (0, drizzle_orm_1.sql)(templateObject_48 || (templateObject_48 = __makeTemplateObject(["", ""], ["", ""])), record["conversationId"]), (0, drizzle_orm_1.sql)(templateObject_49 || (templateObject_49 = __makeTemplateObject(["", ""], ["", ""])), record["status"]), (0, drizzle_orm_1.sql)(templateObject_50 || (templateObject_50 = __makeTemplateObject(["", ""], ["", ""])), record["dispatchReady"]), (0, drizzle_orm_1.sql)(templateObject_51 || (templateObject_51 = __makeTemplateObject(["", ""], ["", ""])), record["ownerId"]), (0, drizzle_orm_1.sql)(templateObject_52 || (templateObject_52 = __makeTemplateObject(["", ""], ["", ""])), record["epoch"]), (0, drizzle_orm_1.sql)(templateObject_53 || (templateObject_53 = __makeTemplateObject(["", ""], ["", ""])), record["roundId"]), (0, drizzle_orm_1.sql)(templateObject_54 || (templateObject_54 = __makeTemplateObject(["", ""], ["", ""])), record["ownerAccountId"]), (0, drizzle_orm_1.sql)(templateObject_55 || (templateObject_55 = __makeTemplateObject(["", ""], ["", ""])), record["leaseExpiresAt"] instanceof Date ? record["leaseExpiresAt"].toISOString() : null), (0, drizzle_orm_1.sql)(templateObject_56 || (templateObject_56 = __makeTemplateObject(["", ""], ["", ""])), record["cancelRequested"]));
                        }
                        if (kind === "tasks") {
                            names.push("status", "current_round_id", "goal_version");
                            values.push((0, drizzle_orm_1.sql)(templateObject_57 || (templateObject_57 = __makeTemplateObject(["", ""], ["", ""])), record["status"]), (0, drizzle_orm_1.sql)(templateObject_58 || (templateObject_58 = __makeTemplateObject(["", ""], ["", ""])), record["currentRoundId"]), (0, drizzle_orm_1.sql)(templateObject_59 || (templateObject_59 = __makeTemplateObject(["", ""], ["", ""])), record["goalVersion"]));
                        }
                        if (kind === "rounds") {
                            names.push("task_id", "goal_version");
                            values.push((0, drizzle_orm_1.sql)(templateObject_60 || (templateObject_60 = __makeTemplateObject(["", ""], ["", ""])), record["taskId"]), (0, drizzle_orm_1.sql)(templateObject_61 || (templateObject_61 = __makeTemplateObject(["", ""], ["", ""])), record["goalVersion"]));
                        }
                        if (kind === "revisions") {
                            names.push("round_id", "goal_version");
                            values.push((0, drizzle_orm_1.sql)(templateObject_62 || (templateObject_62 = __makeTemplateObject(["", ""], ["", ""])), record["roundId"]), (0, drizzle_orm_1.sql)(templateObject_63 || (templateObject_63 = __makeTemplateObject(["", ""], ["", ""])), record["goalVersion"]));
                        }
                        if (kind === "usage") {
                            names.push("run_id", "state", "owner_account_id", "round_id");
                            values.push((0, drizzle_orm_1.sql)(templateObject_64 || (templateObject_64 = __makeTemplateObject(["", ""], ["", ""])), record["runId"]), (0, drizzle_orm_1.sql)(templateObject_65 || (templateObject_65 = __makeTemplateObject(["", ""], ["", ""])), record["state"]), (0, drizzle_orm_1.sql)(templateObject_66 || (templateObject_66 = __makeTemplateObject(["", ""], ["", ""])), record["accountId"]), (0, drizzle_orm_1.sql)(templateObject_67 || (templateObject_67 = __makeTemplateObject(["", ""], ["", ""])), record["roundId"]));
                        }
                        return [4 /*yield*/, db.execute((0, drizzle_orm_1.sql)(templateObject_72 || (templateObject_72 = __makeTemplateObject(["INSERT INTO ", " (", ") VALUES (", ") ON CONFLICT (id) DO UPDATE SET ", ""], ["INSERT INTO ", " (", ") VALUES (", ") ON CONFLICT (id) DO UPDATE SET ", ""])), drizzle_orm_1.sql.identifier(tableNames[kind]), drizzle_orm_1.sql.join(names.map(function (n) { return drizzle_orm_1.sql.identifier(n); }), (0, drizzle_orm_1.sql)(templateObject_68 || (templateObject_68 = __makeTemplateObject([","], [","])))), drizzle_orm_1.sql.join(values, (0, drizzle_orm_1.sql)(templateObject_69 || (templateObject_69 = __makeTemplateObject([","], [","])))), drizzle_orm_1.sql.join(names
                                .filter(function (n) { return n !== "id"; })
                                .map(function (n) { return (0, drizzle_orm_1.sql)(templateObject_70 || (templateObject_70 = __makeTemplateObject(["", "=excluded.", ""], ["", "=excluded.", ""])), drizzle_orm_1.sql.identifier(n), drizzle_orm_1.sql.identifier(n)); }), (0, drizzle_orm_1.sql)(templateObject_71 || (templateObject_71 = __makeTemplateObject([","], [","]))))))];
                    case 3:
                        _d.sent();
                        return [2 /*return*/];
                }
            });
        }); },
        userActive: function (actorId) { return __awaiter(_this, void 0, void 0, function () {
            var statement, rows, _a;
            var _b;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        statement = db
                            .select({ status: schema_js_1.users.status })
                            .from(schema_js_1.users)
                            .where((0, drizzle_orm_1.eq)(schema_js_1.users.id, actorId))
                            .limit(1);
                        if (!writing) return [3 /*break*/, 2];
                        return [4 /*yield*/, statement.for("share")];
                    case 1:
                        _a = _c.sent();
                        return [3 /*break*/, 4];
                    case 2: return [4 /*yield*/, statement];
                    case 3:
                        _a = _c.sent();
                        _c.label = 4;
                    case 4:
                        rows = _a;
                        return [2 /*return*/, ((_b = rows[0]) === null || _b === void 0 ? void 0 : _b.status) === "active"];
                }
            });
        }); },
        userProfile: function (actorId) { return __awaiter(_this, void 0, void 0, function () {
            var rows;
            var _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0: return [4 /*yield*/, db
                            .select({ email: schema_js_1.users.email, displayName: schema_js_1.users.displayName, role: schema_js_1.users.role })
                            .from(schema_js_1.users)
                            .where((0, drizzle_orm_1.eq)(schema_js_1.users.id, actorId))
                            .limit(1)];
                    case 1:
                        rows = _b.sent();
                        return [2 /*return*/, (_a = rows[0]) !== null && _a !== void 0 ? _a : null];
                }
            });
        }); },
        projectAccess: function (projectId, actorId) { return __awaiter(_this, void 0, void 0, function () {
            var query, projects, _a, project, memberQuery, members, _b, organizationMember, memberQuery_1, rows, _c;
            var _d, _e;
            return __generator(this, function (_f) {
                switch (_f.label) {
                    case 0:
                        query = db.select().from(schema_js_1.v2Projects).where((0, drizzle_orm_1.eq)(schema_js_1.v2Projects.id, projectId)).limit(1);
                        if (!writing) return [3 /*break*/, 2];
                        return [4 /*yield*/, query.for("share")];
                    case 1:
                        _a = _f.sent();
                        return [3 /*break*/, 4];
                    case 2: return [4 /*yield*/, query];
                    case 3:
                        _a = _f.sent();
                        _f.label = 4;
                    case 4:
                        projects = _a;
                        project = projects[0];
                        if (!project)
                            return [2 /*return*/, null];
                        memberQuery = db
                            .select()
                            .from(schema_js_1.v2ProjectMembers)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_js_1.v2ProjectMembers.projectId, projectId), (0, drizzle_orm_1.eq)(schema_js_1.v2ProjectMembers.userId, actorId)))
                            .limit(1);
                        if (!writing) return [3 /*break*/, 6];
                        return [4 /*yield*/, memberQuery.for("share")];
                    case 5:
                        _b = _f.sent();
                        return [3 /*break*/, 8];
                    case 6: return [4 /*yield*/, memberQuery];
                    case 7:
                        _b = _f.sent();
                        _f.label = 8;
                    case 8:
                        members = _b;
                        organizationMember = null;
                        if (!project.organizationId) return [3 /*break*/, 13];
                        memberQuery_1 = db
                            .select()
                            .from(schema_js_1.organizationMembers)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_js_1.organizationMembers.organizationId, project.organizationId), (0, drizzle_orm_1.eq)(schema_js_1.organizationMembers.userId, actorId)))
                            .limit(1);
                        if (!writing) return [3 /*break*/, 10];
                        return [4 /*yield*/, memberQuery_1.for("share")];
                    case 9:
                        _c = _f.sent();
                        return [3 /*break*/, 12];
                    case 10: return [4 /*yield*/, memberQuery_1];
                    case 11:
                        _c = _f.sent();
                        _f.label = 12;
                    case 12:
                        rows = _c;
                        organizationMember = (_d = rows[0]) !== null && _d !== void 0 ? _d : null;
                        _f.label = 13;
                    case 13: return [2 /*return*/, { project: project, projectMember: (_e = members[0]) !== null && _e !== void 0 ? _e : null, organizationMember: organizationMember }];
                }
            });
        }); },
        appendEvent: function (event) { return __awaiter(_this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, db.execute((0, drizzle_orm_1.sql)(templateObject_73 || (templateObject_73 = __makeTemplateObject(["INSERT INTO cloud_events (run_id,sequence,event_id,occurred_at,data) VALUES (", ",", ",", ",", ",", "::jsonb)"], ["INSERT INTO cloud_events (run_id,sequence,event_id,occurred_at,data) VALUES (", ",", ",", ",", ",", "::jsonb)"])), event.runId, event.sequence, event.eventId, event.occurredAt.toISOString(), JSON.stringify(event)))];
                    case 1:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        }); },
        events: function (runId, afterSequence, limit) { return __awaiter(_this, void 0, void 0, function () {
            var rows;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, db.execute((0, drizzle_orm_1.sql)(templateObject_74 || (templateObject_74 = __makeTemplateObject(["SELECT data FROM cloud_events WHERE run_id=", " AND sequence>", " ORDER BY sequence LIMIT ", ""], ["SELECT data FROM cloud_events WHERE run_id=", " AND sequence>", " ORDER BY sequence LIMIT ", ""])), runId, afterSequence, limit))];
                    case 1:
                        rows = _a.sent();
                        return [2 /*return*/, rows.map(function (r) { return hydrate(r.data); })];
                }
            });
        }); },
        eventById: function (runId, eventId) { return __awaiter(_this, void 0, void 0, function () {
            var rows;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, db.execute((0, drizzle_orm_1.sql)(templateObject_75 || (templateObject_75 = __makeTemplateObject(["SELECT data FROM cloud_events WHERE run_id=", " AND event_id=", " LIMIT 1"], ["SELECT data FROM cloud_events WHERE run_id=", " AND event_id=", " LIMIT 1"])), runId, eventId))];
                    case 1:
                        rows = _a.sent();
                        return [2 /*return*/, rows[0] ? hydrate(rows[0].data) : null];
                }
            });
        }); },
        eventsBefore: function (runId, beforeSequence, limit) { return __awaiter(_this, void 0, void 0, function () {
            var rows;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, db.execute((0, drizzle_orm_1.sql)(templateObject_76 || (templateObject_76 = __makeTemplateObject(["SELECT data FROM cloud_events WHERE run_id=", " AND sequence<", " ORDER BY sequence DESC LIMIT ", ""], ["SELECT data FROM cloud_events WHERE run_id=", " AND sequence<", " ORDER BY sequence DESC LIMIT ", ""])), runId, beforeSequence, limit))];
                    case 1:
                        rows = _a.sent();
                        return [2 /*return*/, rows.reverse().map(function (row) { return hydrate(row.data); })];
                }
            });
        }); },
        enqueue: function (event) { return __awaiter(_this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, db
                            .insert(schema_js_1.outboxEvents)
                            .values(__assign({}, event))
                            .onConflictDoNothing()];
                    case 1:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        }); },
    };
}
var PostgresCloudRepository = /** @class */ (function () {
    function PostgresCloudRepository(db) {
        this.db = db;
    }
    PostgresCloudRepository.prototype.read = function (operation) {
        return this.db.transaction(function (tx) { return operation(txFor(tx, false)); }, {
            isolationLevel: "repeatable read",
            accessMode: "read only",
        });
    };
    PostgresCloudRepository.prototype.transaction = function (keys, operation) {
        var _this = this;
        return this.db.transaction(function (db) { return __awaiter(_this, void 0, void 0, function () {
            var tx;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        tx = txFor(db, true);
                        return [4 /*yield*/, tx.lock(keys)];
                    case 1:
                        _a.sent();
                        return [2 /*return*/, operation(tx)];
                }
            });
        }); });
    };
    return PostgresCloudRepository;
}());
exports.PostgresCloudRepository = PostgresCloudRepository;
var templateObject_1, templateObject_2, templateObject_3, templateObject_4, templateObject_5, templateObject_6, templateObject_7, templateObject_8, templateObject_9, templateObject_10, templateObject_11, templateObject_12, templateObject_13, templateObject_14, templateObject_15, templateObject_16, templateObject_17, templateObject_18, templateObject_19, templateObject_20, templateObject_21, templateObject_22, templateObject_23, templateObject_24, templateObject_25, templateObject_26, templateObject_27, templateObject_28, templateObject_29, templateObject_30, templateObject_31, templateObject_32, templateObject_33, templateObject_34, templateObject_35, templateObject_36, templateObject_37, templateObject_38, templateObject_39, templateObject_40, templateObject_41, templateObject_42, templateObject_43, templateObject_44, templateObject_45, templateObject_46, templateObject_47, templateObject_48, templateObject_49, templateObject_50, templateObject_51, templateObject_52, templateObject_53, templateObject_54, templateObject_55, templateObject_56, templateObject_57, templateObject_58, templateObject_59, templateObject_60, templateObject_61, templateObject_62, templateObject_63, templateObject_64, templateObject_65, templateObject_66, templateObject_67, templateObject_68, templateObject_69, templateObject_70, templateObject_71, templateObject_72, templateObject_73, templateObject_74, templateObject_75, templateObject_76;
//# sourceMappingURL=cloud-postgres.js.map