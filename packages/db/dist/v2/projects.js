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
Object.defineProperty(exports, "__esModule", { value: true });
exports.PostgresOrganizationMemberV2Repository = exports.PostgresProjectMemberV2Repository = exports.PostgresProjectV2Repository = void 0;
var pagination_js_1 = require("../pagination.js");
var visibility_js_1 = require("./visibility.js");
var results_js_1 = require("./results.js");
var drizzle_orm_1 = require("drizzle-orm");
var schema_js_1 = require("../schema.js");
var memberColumns = {
    projectId: schema_js_1.v2ProjectMembers.projectId,
    userId: schema_js_1.v2ProjectMembers.userId,
    role: schema_js_1.v2ProjectMembers.role,
    status: schema_js_1.v2ProjectMembers.status,
};
var organizationMemberColumns = {
    organizationId: schema_js_1.organizationMembers.organizationId,
    userId: schema_js_1.organizationMembers.userId,
    role: schema_js_1.organizationMembers.role,
    status: schema_js_1.organizationMembers.status,
};
var PostgresProjectV2Repository = /** @class */ (function () {
    function PostgresProjectV2Repository(db) {
        this.db = db;
    }
    PostgresProjectV2Repository.prototype.getById = function (id) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                return [2 /*return*/, (0, results_js_1.first)(this.db.select().from(schema_js_1.v2Projects).where((0, drizzle_orm_1.eq)(schema_js_1.v2Projects.id, id)).limit(1))];
            });
        });
    };
    PostgresProjectV2Repository.prototype.listVisible = function (query) {
        return __awaiter(this, void 0, void 0, function () {
            var page, time, statement, _a, _b;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        page = (0, pagination_js_1.cursorPage)(query, "projects:".concat(query.actorId));
                        time = (0, pagination_js_1.timestampKey)(schema_js_1.v2Projects.updatedAt);
                        statement = this.db
                            .select()
                            .from(schema_js_1.v2Projects)
                            .where((0, drizzle_orm_1.and)((0, visibility_js_1.projectVisibility)(query.actorId), page.seek(time, schema_js_1.v2Projects.id)))
                            .orderBy((0, drizzle_orm_1.desc)(time), (0, drizzle_orm_1.desc)(schema_js_1.v2Projects.id))
                            .$dynamic();
                        if (page.limit !== undefined)
                            statement = statement.limit(page.limit + 1);
                        _b = (_a = page).finish;
                        return [4 /*yield*/, statement];
                    case 1: return [2 /*return*/, _b.apply(_a, [_c.sent(), function (row) { return row.updatedAt; }])];
                }
            });
        });
    };
    PostgresProjectV2Repository.prototype.create = function (input) {
        return __awaiter(this, void 0, void 0, function () {
            var _a;
            return __generator(this, function (_b) {
                return [2 /*return*/, (0, results_js_1.inserted)(this.db
                        .insert(schema_js_1.v2Projects)
                        .values({
                        id: input.id,
                        createdByUserId: input.createdByUserId,
                        personalOwnerId: input.scope.type === "personal" ? input.scope.userId : null,
                        organizationId: input.scope.type === "organization" ? input.scope.organizationId : null,
                        title: input.title,
                        description: (_a = input.description) !== null && _a !== void 0 ? _a : null,
                        stage: "draft",
                        archived: false,
                        deadline: null,
                        createdAt: input.now,
                        updatedAt: input.now,
                    })
                        .returning(), "Project insert")];
            });
        });
    };
    PostgresProjectV2Repository.prototype.update = function (input) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                return [2 /*return*/, (0, results_js_1.first)(this.db
                        .update(schema_js_1.v2Projects)
                        .set(__assign(__assign(__assign(__assign(__assign({}, (input.title !== undefined ? { title: input.title } : {})), (input.description !== undefined ? { description: input.description } : {})), (input.stage !== undefined ? { stage: input.stage } : {})), (input.deadline !== undefined ? { deadline: input.deadline } : {})), { updatedAt: input.now }))
                        .where((0, drizzle_orm_1.eq)(schema_js_1.v2Projects.id, input.id))
                        .returning())];
            });
        });
    };
    PostgresProjectV2Repository.prototype.setArchived = function (input) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                return [2 /*return*/, (0, results_js_1.first)(this.db
                        .update(schema_js_1.v2Projects)
                        .set({ archived: input.archived, updatedAt: input.now })
                        .where((0, drizzle_orm_1.eq)(schema_js_1.v2Projects.id, input.id))
                        .returning())];
            });
        });
    };
    PostgresProjectV2Repository.prototype.delete = function (id) {
        return __awaiter(this, void 0, void 0, function () {
            var deleted;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.db
                            .delete(schema_js_1.v2Projects)
                            .where((0, drizzle_orm_1.eq)(schema_js_1.v2Projects.id, id))
                            .returning({ id: schema_js_1.v2Projects.id })];
                    case 1:
                        deleted = _a.sent();
                        return [2 /*return*/, deleted.length > 0];
                }
            });
        });
    };
    return PostgresProjectV2Repository;
}());
exports.PostgresProjectV2Repository = PostgresProjectV2Repository;
var PostgresProjectMemberV2Repository = /** @class */ (function () {
    function PostgresProjectMemberV2Repository(db) {
        this.db = db;
    }
    PostgresProjectMemberV2Repository.prototype.mutate = function (projectId, operation) {
        return __awaiter(this, void 0, void 0, function () {
            var _this = this;
            return __generator(this, function (_a) {
                return [2 /*return*/, this.db.transaction(function (tx) { return __awaiter(_this, void 0, void 0, function () {
                        return __generator(this, function (_a) {
                            switch (_a.label) {
                                case 0: 
                                // Also serialize insertion of a new, narrowing grant: there may be no member row to lock.
                                return [4 /*yield*/, tx
                                        .select({ id: schema_js_1.v2Projects.id })
                                        .from(schema_js_1.v2Projects)
                                        .where((0, drizzle_orm_1.eq)(schema_js_1.v2Projects.id, projectId))
                                        .for("update")];
                                case 1:
                                    // Also serialize insertion of a new, narrowing grant: there may be no member row to lock.
                                    _a.sent();
                                    return [2 /*return*/, operation(tx)];
                            }
                        });
                    }); })];
            });
        });
    };
    PostgresProjectMemberV2Repository.prototype.getByProjectAndUser = function (input) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                return [2 /*return*/, (0, results_js_1.first)(this.db
                        .select(memberColumns)
                        .from(schema_js_1.v2ProjectMembers)
                        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_js_1.v2ProjectMembers.projectId, input.projectId), (0, drizzle_orm_1.eq)(schema_js_1.v2ProjectMembers.userId, input.userId)))
                        .limit(1))];
            });
        });
    };
    PostgresProjectMemberV2Repository.prototype.listByProject = function (projectId) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                return [2 /*return*/, this.db
                        .select(memberColumns)
                        .from(schema_js_1.v2ProjectMembers)
                        .where((0, drizzle_orm_1.eq)(schema_js_1.v2ProjectMembers.projectId, projectId))
                        .orderBy((0, drizzle_orm_1.asc)(schema_js_1.v2ProjectMembers.userId))];
            });
        });
    };
    PostgresProjectMemberV2Repository.prototype.upsert = function (input) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                return [2 /*return*/, this.mutate(input.projectId, function (db) {
                        return (0, results_js_1.inserted)(db
                            .insert(schema_js_1.v2ProjectMembers)
                            .values({
                            id: "project-member-".concat(input.projectId, "-").concat(input.userId),
                            projectId: input.projectId,
                            userId: input.userId,
                            role: input.role,
                            status: "active",
                            createdAt: input.now,
                            updatedAt: input.now,
                        })
                            .onConflictDoUpdate({
                            target: [schema_js_1.v2ProjectMembers.projectId, schema_js_1.v2ProjectMembers.userId],
                            set: { role: input.role, status: "active", updatedAt: input.now },
                        })
                            .returning(memberColumns), "Project member upsert");
                    })];
            });
        });
    };
    PostgresProjectMemberV2Repository.prototype.remove = function (input) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                return [2 /*return*/, this.mutate(input.projectId, function (db) {
                        return (0, results_js_1.first)(db
                            .update(schema_js_1.v2ProjectMembers)
                            .set({ status: "removed", updatedAt: input.now })
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_js_1.v2ProjectMembers.projectId, input.projectId), (0, drizzle_orm_1.eq)(schema_js_1.v2ProjectMembers.userId, input.userId)))
                            .returning(memberColumns));
                    })];
            });
        });
    };
    return PostgresProjectMemberV2Repository;
}());
exports.PostgresProjectMemberV2Repository = PostgresProjectMemberV2Repository;
var PostgresOrganizationMemberV2Repository = /** @class */ (function () {
    function PostgresOrganizationMemberV2Repository(db) {
        this.db = db;
    }
    PostgresOrganizationMemberV2Repository.prototype.getByOrganizationAndUser = function (input) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                return [2 /*return*/, (0, results_js_1.first)(this.db
                        .select(organizationMemberColumns)
                        .from(schema_js_1.organizationMembers)
                        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_js_1.organizationMembers.organizationId, input.organizationId), (0, drizzle_orm_1.eq)(schema_js_1.organizationMembers.userId, input.userId)))
                        .limit(1))];
            });
        });
    };
    PostgresOrganizationMemberV2Repository.prototype.listByUser = function (userId) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                return [2 /*return*/, this.db
                        .select(organizationMemberColumns)
                        .from(schema_js_1.organizationMembers)
                        .where((0, drizzle_orm_1.eq)(schema_js_1.organizationMembers.userId, userId))];
            });
        });
    };
    return PostgresOrganizationMemberV2Repository;
}());
exports.PostgresOrganizationMemberV2Repository = PostgresOrganizationMemberV2Repository;
//# sourceMappingURL=projects.js.map