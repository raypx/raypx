"use strict";
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
var test_1 = require("vite-plus/test");
var agents_js_1 = require("./agents.js");
var resources_js_1 = require("../schema/resources.js");
(0, test_1.describe)("queued Agent transaction", function () {
    test_1.it.each([false, true])("keeps the run and outbox atomic (outbox fails: %s)", function (failOutbox) { return __awaiter(void 0, void 0, void 0, function () {
        var committed, failure, db, repo, now, result;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    committed = [];
                    failure = new Error("outbox unavailable");
                    db = {
                        insert: function () {
                            throw new Error("write escaped transaction");
                        },
                        transaction: function (operation) {
                            return __awaiter(this, void 0, void 0, function () {
                                var pending, result;
                                var _this = this;
                                return __generator(this, function (_a) {
                                    switch (_a.label) {
                                        case 0:
                                            pending = [];
                                            return [4 /*yield*/, operation({
                                                    insert: function (table) { return ({
                                                        values: function (row) {
                                                            if (table === resources_js_1.outboxEvents && failOutbox)
                                                                throw failure;
                                                            pending.push({ table: table, row: row });
                                                            return { returning: function () { return __awaiter(_this, void 0, void 0, function () { return __generator(this, function (_a) {
                                                                    return [2 /*return*/, [row]];
                                                                }); }); } };
                                                        },
                                                    }); },
                                                })];
                                        case 1:
                                            result = _a.sent();
                                            committed.push.apply(committed, pending);
                                            return [2 /*return*/, result];
                                    }
                                });
                            });
                        },
                    };
                    repo = new agents_js_1.PostgresAgentRunV2Repository(db);
                    now = new Date(0);
                    result = repo.createQueued({
                        id: "run-1",
                        projectId: "project-1",
                        requestedByUserId: "user-1",
                        assetVersionId: null,
                        attempt: 1,
                        input: {},
                        now: now,
                    });
                    if (!failOutbox) return [3 /*break*/, 2];
                    return [4 /*yield*/, (0, test_1.expect)(result).rejects.toBe(failure)];
                case 1:
                    _a.sent();
                    (0, test_1.expect)(committed).toEqual([]);
                    return [3 /*break*/, 4];
                case 2: return [4 /*yield*/, (0, test_1.expect)(result).resolves.toMatchObject({
                        id: "run-1",
                        status: "queued",
                        createdAt: now,
                        updatedAt: now,
                    })];
                case 3:
                    _a.sent();
                    (0, test_1.expect)(committed).toEqual([
                        { table: resources_js_1.v2AgentRuns, row: test_1.expect.objectContaining({ id: "run-1", status: "queued" }) },
                        {
                            table: resources_js_1.outboxEvents,
                            row: {
                                id: "agent-run-run-1",
                                type: "agent.run.queued",
                                payload: { runId: "run-1", projectId: "project-1", attempt: 1 },
                                availableAt: now,
                                createdAt: now,
                            },
                        },
                    ]);
                    _a.label = 4;
                case 4: return [2 /*return*/];
            }
        });
    }); });
});
//# sourceMappingURL=agents.test.js.map