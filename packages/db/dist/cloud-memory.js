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
exports.InMemoryCloudRepository = void 0;
exports.cloudParentIds = cloudParentIds;
exports.cloudActorId = cloudActorId;
exports.cloudMatches = cloudMatches;
var core_1 = require("@voidmix/core");
var kinds = [
    "mutations",
    "preferences",
    "conversations",
    "turns",
    "tasks",
    "rounds",
    "spendingGrants",
    "messages",
    "executionGrants",
    "runs",
    "executions",
    "tools",
    "sources",
    "assets",
    "revisions",
    "usage",
    "notifications",
    "commands",
];
var clone = function (value) { return structuredClone(value); };
function cloudParentIds(kind, value) {
    var _a;
    var entity = value;
    var keys = {
        mutations: [],
        preferences: [],
        conversations: [],
        turns: ["conversationId", "runId"],
        tasks: ["conversationId"],
        rounds: ["taskId"],
        spendingGrants: [],
        messages: ["runId"],
        executionGrants: ["runId"],
        runs: ["conversationId", "taskId"],
        executions: ["runId"],
        tools: ["runId"],
        sources: ["runId"],
        assets: ["runId"],
        revisions: ["taskId", "runId"],
        usage: ["runId"],
        notifications: ["taskId", "conversationId", "runId"],
        commands: ["runId"],
    };
    if (kind === "notifications")
        return [(_a = entity["taskId"]) !== null && _a !== void 0 ? _a : entity["conversationId"], entity["runId"]].filter(function (value) { return typeof value === "string"; });
    return keys[kind]
        .map(function (key) { return entity[key]; })
        .filter(function (value) { return typeof value === "string"; });
}
function cloudActorId(kind, value) {
    var _a, _b;
    var entity = value;
    var actor = kind === "notifications"
        ? entity["recipientId"]
        : kind === "usage"
            ? typeof entity["accountId"] === "string" && entity["accountId"].startsWith("user:")
                ? entity["accountId"].slice(5)
                : null
            : ((_b = (_a = entity["actorId"]) !== null && _a !== void 0 ? _a : entity["requestedByUserId"]) !== null && _b !== void 0 ? _b : entity["createdByUserId"]);
    return typeof actor === "string" ? actor : null;
}
function cloudMatches(kind, entity, query) {
    var _a;
    var record = entity;
    if (query.ownerAccountId &&
        (kind === "usage" ? record["accountId"] : record["ownerAccountId"]) !== query.ownerAccountId)
        return false;
    if (query.roundId && record["roundId"] !== query.roundId)
        return false;
    if (query.published !== undefined &&
        entity["published"] !== query.published)
        return false;
    if (query.runIds) {
        var runId = entity["runId"];
        if (typeof runId !== "string" || !query.runIds.includes(runId))
            return false;
    }
    if (query.turnIds) {
        var run = entity;
        var turnId = (_a = run["sourceTurnId"]) !== null && _a !== void 0 ? _a : run["turnId"];
        if (typeof turnId !== "string" || !query.turnIds.includes(turnId))
            return false;
    }
    if (query.status && entity["status"] !== query.status)
        return false;
    if (query.scope && !(0, core_1.sameResourceScope)(query.scope, entity.scope))
        return false;
    if (query.parentId && !cloudParentIds(kind, entity).includes(query.parentId))
        return false;
    if (query.actorId && cloudActorId(kind, entity) !== query.actorId)
        return false;
    if (query.idempotencyKey &&
        entity[kind === "runs" ? "turnId" : "idempotencyKey"] !== query.idempotencyKey)
        return false;
    if (query.before &&
        (entity.createdAt.getTime() > query.before.createdAt.getTime() ||
            (entity.createdAt.getTime() === query.before.createdAt.getTime() &&
                entity.id >= query.before.id)))
        return false;
    return true;
}
function txFor(state) {
    var _this = this;
    return {
        lock: function () { return __awaiter(_this, void 0, void 0, function () { return __generator(this, function (_a) {
            return [2 /*return*/];
        }); }); },
        activeTaskRun: function (taskId) { return __awaiter(_this, void 0, void 0, function () {
            var _a;
            return __generator(this, function (_b) {
                return [2 /*return*/, clone((_a = __spreadArray([], state.entities.runs.values(), true).find(function (run) { return run.taskId === taskId && !(0, core_1.isCloudTerminal)(run.status); })) !== null && _a !== void 0 ? _a : null)];
            });
        }); },
        readyRuns: function (limit) { return __awaiter(_this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                return [2 /*return*/, clone(__spreadArray([], state.entities.runs.values(), true).filter(function (run) { return run.status === "queued" && run.dispatchReady; })
                        .sort(function (a, b) { return a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id); })
                        .slice(0, limit))];
            });
        }); },
        expiredRuns: function (now, limit) { return __awaiter(_this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                return [2 /*return*/, clone(__spreadArray([], state.entities.runs.values(), true).filter(function (run) {
                        return run.status === "running" &&
                            (!run.leaseExpiresAt || run.leaseExpiresAt.getTime() <= now.getTime());
                    })
                        .sort(function (a, b) { var _a, _b, _c, _d; return ((_b = (_a = a.leaseExpiresAt) === null || _a === void 0 ? void 0 : _a.getTime()) !== null && _b !== void 0 ? _b : 0) - ((_d = (_c = b.leaseExpiresAt) === null || _c === void 0 ? void 0 : _c.getTime()) !== null && _d !== void 0 ? _d : 0); })
                        .slice(0, limit))];
            });
        }); },
        get: function (kind, id) { return __awaiter(_this, void 0, void 0, function () { var _a; return __generator(this, function (_b) {
            return [2 /*return*/, clone((_a = state.entities[kind].get(id)) !== null && _a !== void 0 ? _a : null)];
        }); }); },
        list: function (kind_1) {
            var args_1 = [];
            for (var _i = 1; _i < arguments.length; _i++) {
                args_1[_i - 1] = arguments[_i];
            }
            return __awaiter(_this, __spreadArray([kind_1], args_1, true), void 0, function (kind, query) {
                if (query === void 0) { query = {}; }
                return __generator(this, function (_a) {
                    return [2 /*return*/, clone(__spreadArray([], state.entities[kind].values(), true).filter(function (entity) { return cloudMatches(kind, entity, query); })
                            .sort(function (a, b) { return b.createdAt.getTime() - a.createdAt.getTime() || b.id.localeCompare(a.id); })
                            .slice(0, query.limit))];
                });
            });
        },
        remove: function (kind, id) { return __awaiter(_this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                state.entities[kind].delete(id);
                return [2 /*return*/];
            });
        }); },
        save: function (kind, entity) { return __awaiter(_this, void 0, void 0, function () {
            var prior, run_1;
            return __generator(this, function (_a) {
                if (kind === "rounds") {
                    prior = state.entities.rounds.get(entity.id);
                    if (prior && !(0, core_1.sameCloudTaskRound)(prior, entity))
                        throw new core_1.CloudDomainError("CLOUD_INVALID_INPUT", "Task rounds are immutable.");
                }
                if (kind === "runs") {
                    run_1 = entity;
                    if (run_1.taskId &&
                        !(0, core_1.isCloudTerminal)(run_1.status) &&
                        __spreadArray([], state.entities.runs.values(), true).some(function (existing) {
                            return existing.id !== run_1.id &&
                                existing.taskId === run_1.taskId &&
                                !(0, core_1.isCloudTerminal)(existing.status);
                        }))
                        throw new core_1.CloudDomainError("CLOUD_RUN_ACTIVE", "Task has an active run.");
                }
                state.entities[kind].set(entity.id, clone(entity));
                return [2 /*return*/];
            });
        }); },
        userActive: function (actorId) { return __awaiter(_this, void 0, void 0, function () { var _a; return __generator(this, function (_b) {
            return [2 /*return*/, ((_a = state.users.get(actorId)) === null || _a === void 0 ? void 0 : _a.active) === true];
        }); }); },
        userProfile: function (actorId) { return __awaiter(_this, void 0, void 0, function () {
            var user;
            return __generator(this, function (_a) {
                user = state.users.get(actorId);
                return [2 /*return*/, user ? { email: user.email, displayName: user.displayName, role: user.role } : null];
            });
        }); },
        projectAccess: function (projectId, actorId) { return __awaiter(_this, void 0, void 0, function () {
            var project;
            var _a, _b;
            return __generator(this, function (_c) {
                project = state.projects.get(projectId);
                return [2 /*return*/, project
                        ? clone({
                            project: project,
                            projectMember: (_a = state.members.get("".concat(projectId, ":").concat(actorId))) !== null && _a !== void 0 ? _a : null,
                            organizationMember: project.organizationId
                                ? ((_b = state.organizations.get("".concat(project.organizationId, ":").concat(actorId))) !== null && _b !== void 0 ? _b : null)
                                : null,
                        })
                        : null];
            });
        }); },
        appendEvent: function (event) { return __awaiter(_this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                if (state.events.has("".concat(event.runId, ":").concat(event.sequence)))
                    throw new core_1.CloudDomainError("CLOUD_IDEMPOTENCY_CONFLICT", "Event sequence already exists.");
                state.events.set("".concat(event.runId, ":").concat(event.sequence), clone(event));
                return [2 /*return*/];
            });
        }); },
        events: function (runId, afterSequence, limit) { return __awaiter(_this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                return [2 /*return*/, clone(__spreadArray([], state.events.values(), true).filter(function (e) { return e.runId === runId && e.sequence > afterSequence; })
                        .sort(function (a, b) { return a.sequence - b.sequence; })
                        .slice(0, limit))];
            });
        }); },
        eventById: function (runId, eventId) { return __awaiter(_this, void 0, void 0, function () {
            var _a;
            return __generator(this, function (_b) {
                return [2 /*return*/, clone((_a = __spreadArray([], state.events.values(), true).find(function (e) { return e.runId === runId && e.eventId === eventId; })) !== null && _a !== void 0 ? _a : null)];
            });
        }); },
        eventsBefore: function (runId, beforeSequence, limit) { return __awaiter(_this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                return [2 /*return*/, clone(__spreadArray([], state.events.values(), true).filter(function (event) { return event.runId === runId && event.sequence < beforeSequence; })
                        .sort(function (a, b) { return b.sequence - a.sequence; })
                        .slice(0, limit)
                        .reverse())];
            });
        }); },
        enqueue: function (event) { return __awaiter(_this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                if (!state.outbox.has(event.id))
                    state.outbox.set(event.id, clone(event));
                return [2 /*return*/];
            });
        }); },
    };
}
/** Tests explicitly seed trusted identities; an unknown account is never admitted. */
var InMemoryCloudRepository = /** @class */ (function () {
    function InMemoryCloudRepository(input) {
        if (input === void 0) { input = {}; }
        var _a, _b, _c, _d;
        this.tail = Promise.resolve();
        this.state = {
            entities: Object.fromEntries(kinds.map(function (kind) { return [kind, new Map()]; })),
            events: new Map(),
            outbox: new Map(),
            users: new Map(((_a = input.users) !== null && _a !== void 0 ? _a : []).map(function (u) {
                var _a, _b, _c, _d;
                return [
                    u.id,
                    {
                        active: (_a = u.active) !== null && _a !== void 0 ? _a : true,
                        email: (_b = u.email) !== null && _b !== void 0 ? _b : "".concat(u.id, "@example.com"),
                        displayName: (_c = u.displayName) !== null && _c !== void 0 ? _c : u.id,
                        role: (_d = u.role) !== null && _d !== void 0 ? _d : "user",
                    },
                ];
            })),
            projects: new Map(((_b = input.projects) !== null && _b !== void 0 ? _b : []).map(function (p) { return [p.id, clone(p)]; })),
            members: new Map(((_c = input.projectMembers) !== null && _c !== void 0 ? _c : []).map(function (m) { return ["".concat(m.projectId, ":").concat(m.userId), clone(m)]; })),
            organizations: new Map(((_d = input.organizationMembers) !== null && _d !== void 0 ? _d : []).map(function (m) { return ["".concat(m.organizationId, ":").concat(m.userId), clone(m)]; })),
        };
    }
    InMemoryCloudRepository.prototype.read = function (operation) {
        return operation(txFor(clone(this.state)));
    };
    InMemoryCloudRepository.prototype.transaction = function (_keys, operation) {
        return __awaiter(this, void 0, void 0, function () {
            var before, release, draft, value;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        before = this.tail;
                        this.tail = new Promise(function (resolve) {
                            release = resolve;
                        });
                        return [4 /*yield*/, before];
                    case 1:
                        _a.sent();
                        _a.label = 2;
                    case 2:
                        _a.trys.push([2, , 4, 5]);
                        draft = clone(this.state);
                        return [4 /*yield*/, operation(txFor(draft))];
                    case 3:
                        value = _a.sent();
                        this.state = draft;
                        return [2 /*return*/, clone(value)];
                    case 4:
                        release();
                        return [7 /*endfinally*/];
                    case 5: return [2 /*return*/];
                }
            });
        });
    };
    InMemoryCloudRepository.prototype.outboxItems = function () {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                return [2 /*return*/, clone(__spreadArray([], this.state.outbox.values(), true))];
            });
        });
    };
    InMemoryCloudRepository.prototype.setUserActive = function (actorId, active) {
        var user = this.state.users.get(actorId);
        if (user)
            this.state.users.set(actorId, __assign(__assign({}, user), { active: active }));
    };
    return InMemoryCloudRepository;
}());
exports.InMemoryCloudRepository = InMemoryCloudRepository;
//# sourceMappingURL=cloud-memory.js.map