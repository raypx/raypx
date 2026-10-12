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
exports.exerciseSharedTaskBudget = exerciseSharedTaskBudget;
var test_1 = require("vite-plus/test");
var application_1 = require("@voidmix/application");
/** Both adapters must charge the same Task across distinct requesting accounts. */
function exerciseSharedTaskBudget(service, repository, projectId) {
    return __awaiter(this, void 0, void 0, function () {
        function claim(runId) {
            return __awaiter(this, void 0, void 0, function () {
                var claimed, fence, execution;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0: return [4 /*yield*/, service.acceptQueued({ runId: runId })];
                        case 1:
                            _a.sent();
                            return [4 /*yield*/, service.claim({ runId: runId, ownerId: "worker" })];
                        case 2:
                            claimed = (_a.sent());
                            fence = { runId: runId, ownerId: "worker", epoch: claimed.epoch };
                            return [4 /*yield*/, service.startExecution(__assign(__assign({}, fence), { role: "main", prompt: "Research" }))];
                        case 3:
                            execution = _a.sent();
                            return [2 /*return*/, { fence: fence, execution: execution }];
                    }
                });
            });
        }
        function charge(runId, callId) {
            return __awaiter(this, void 0, void 0, function () {
                var _a, fence, execution;
                return __generator(this, function (_b) {
                    switch (_b.label) {
                        case 0: return [4 /*yield*/, claim(runId)];
                        case 1:
                            _a = _b.sent(), fence = _a.fence, execution = _a.execution;
                            return [4 /*yield*/, service.reserveUsage(__assign(__assign({}, fence), { executionId: execution.id, callId: callId, provider: "provider", model: "model", reservedTokens: 100 }))];
                        case 2:
                            _b.sent();
                            return [4 /*yield*/, service.startUsage(__assign(__assign({}, fence), { callId: callId }))];
                        case 3:
                            _b.sent();
                            return [4 /*yield*/, service.settleUsage(__assign(__assign({}, fence), { callId: callId, inputTokens: 50, outputTokens: 20 }))];
                        case 4:
                            _b.sent();
                            return [2 /*return*/, fence];
                    }
                });
            });
        }
        var personal, unrelated, _a, _b, _c, conversation, _d, first, _e, _f, _g, next, _h, _j, _k, claimed, _l, _m, cancel, control, current, cancelled;
        var _this = this;
        return __generator(this, function (_o) {
            switch (_o.label) {
                case 0: return [4 /*yield*/, service.createConversation({
                        actorId: "bob",
                        title: "Unrelated",
                        idempotencyKey: "personal",
                    })];
                case 1:
                    personal = _o.sent();
                    return [4 /*yield*/, service.sendTurn({
                            actorId: "bob",
                            conversationId: personal.id,
                            prompt: "Other",
                            mode: "search",
                            idempotencyKey: "unrelated",
                        })];
                case 2:
                    unrelated = _o.sent();
                    _b = (_a = service).finish;
                    _c = [{}];
                    return [4 /*yield*/, charge(unrelated.run.id, "unrelated-call")];
                case 3: return [4 /*yield*/, _b.apply(_a, [__assign.apply(void 0, [__assign.apply(void 0, _c.concat([(_o.sent())])), { status: "succeeded", output: "Other result" }])])];
                case 4:
                    _o.sent();
                    return [4 /*yield*/, service.createConversation({
                            actorId: "alice",
                            projectId: projectId,
                            title: "Shared",
                            idempotencyKey: "shared",
                        })];
                case 5:
                    conversation = _o.sent();
                    return [4 /*yield*/, (0, test_1.expect)(service.sendTurn({
                            actorId: "bob",
                            conversationId: conversation.id,
                            prompt: "Unauthorized spending",
                            mode: "search",
                            idempotencyKey: "no-spending",
                        })).rejects.toMatchObject({ code: "CLOUD_ACCESS_DENIED" })];
                case 6:
                    _o.sent();
                    return [4 /*yield*/, service.setSpendingGrant({
                            actorId: "alice",
                            projectId: projectId,
                            userId: "bob",
                            allowed: true,
                            idempotencyKey: "bob-spending",
                        })];
                case 7:
                    _o.sent();
                    _d = test_1.expect;
                    return [4 /*yield*/, service.listSpendingGrants({ actorId: "alice", projectId: projectId })];
                case 8:
                    _d.apply(void 0, [_o.sent()]).toEqual({
                        items: [{ userId: "bob", allowed: true }],
                    });
                    return [4 /*yield*/, (0, test_1.expect)(service.listSpendingGrants({ actorId: "bob", projectId: projectId })).rejects.toMatchObject({
                            code: "CLOUD_ACCESS_DENIED",
                        })];
                case 9:
                    _o.sent();
                    return [4 /*yield*/, service.sendTurn({
                            actorId: "alice",
                            conversationId: conversation.id,
                            prompt: "Task",
                            mode: "computer",
                            idempotencyKey: "alice-task",
                        })];
                case 10:
                    first = _o.sent();
                    _f = (_e = service).finish;
                    _g = [{}];
                    return [4 /*yield*/, charge(first.run.id, "shared-call")];
                case 11: return [4 /*yield*/, _f.apply(_e, [__assign.apply(void 0, [__assign.apply(void 0, _g.concat([(_o.sent())])), { status: "failed", error: "retry needed" }])])];
                case 12:
                    _o.sent();
                    return [4 /*yield*/, service.sendTurn({
                            actorId: "bob",
                            conversationId: conversation.id,
                            taskId: first.task.id,
                            roundId: first.task.currentRoundId,
                            goalVersion: first.task.goalVersion,
                            prompt: "Retry",
                            mode: "computer",
                            idempotencyKey: "bob-task",
                        })];
                case 13:
                    next = _o.sent();
                    (0, test_1.expect)(next.run.ownerAccountId).toBe("user:alice");
                    _h = test_1.expect;
                    return [4 /*yield*/, service.getUsage({ actorId: "alice" })];
                case 14:
                    _h.apply(void 0, [(_o.sent()).calls]).toBe(1);
                    _j = test_1.expect;
                    return [4 /*yield*/, service.getUsage({ actorId: "bob" })];
                case 15:
                    _j.apply(void 0, [(_o.sent()).calls]).toBe(1);
                    _k = test_1.expect;
                    return [4 /*yield*/, service.getUsage({ actorId: "bob", projectId: projectId })];
                case 16:
                    _k.apply(void 0, [(_o.sent()).calls]).toBe(1);
                    return [4 /*yield*/, claim(next.run.id)];
                case 17:
                    claimed = _o.sent();
                    return [4 /*yield*/, (0, test_1.expect)(service.reserveUsage(__assign(__assign({}, claimed.fence), { executionId: claimed.execution.id, callId: "blocked-call", provider: "provider", model: "model", reservedTokens: 100 }))).rejects.toMatchObject({ code: "CLOUD_BUDGET_EXCEEDED" })];
                case 18:
                    _o.sent();
                    _l = test_1.expect;
                    return [4 /*yield*/, repository.read(function (tx) { return tx.list("usage", { runIds: [first.run.id] }); })];
                case 19:
                    _l.apply(void 0, [(_o.sent()).map(function (call) { return call.id; })]).toEqual(["shared-call"]);
                    _m = test_1.expect;
                    return [4 /*yield*/, repository.read(function (tx) { return tx.list("usage", { runIds: [] }); })];
                case 20:
                    _m.apply(void 0, [_o.sent()]).toEqual([]);
                    return [4 /*yield*/, service.createCommand({
                            actorId: "alice",
                            runId: next.run.id,
                            type: "cancel",
                            idempotencyKey: "cancel-shared",
                        })];
                case 21:
                    cancel = _o.sent();
                    control = (0, application_1.createCloudApplication)({
                        repository: {
                            read: function (operation) {
                                return repository.read(function (tx) {
                                    return operation(__assign(__assign({}, tx), { events: function () { return __awaiter(_this, void 0, void 0, function () {
                                            return __generator(this, function (_a) {
                                                throw new Error("Control polling must not read event history.");
                                            });
                                        }); } }));
                                });
                            },
                            transaction: function (keys, operation) { return repository.transaction(keys, operation); },
                        },
                    });
                    return [4 /*yield*/, control.workerControl(claimed.fence)];
                case 22:
                    current = _o.sent();
                    (0, test_1.expect)(current.run.cancelRequested).toBe(true);
                    (0, test_1.expect)(current.commands.map(function (command) { return command.id; })).toEqual([cancel.id]);
                    return [4 /*yield*/, service.setSpendingGrant({
                            actorId: "alice",
                            projectId: projectId,
                            userId: "bob",
                            allowed: false,
                            idempotencyKey: "revoke-bob-spending",
                        })];
                case 23:
                    _o.sent();
                    return [4 /*yield*/, (0, test_1.expect)(service.validateFence(claimed.fence)).rejects.toMatchObject({
                            code: "CLOUD_ACCESS_DENIED",
                        })];
                case 24:
                    _o.sent();
                    return [4 /*yield*/, service.finish(__assign(__assign({}, claimed.fence), { status: "cancelled" }))];
                case 25:
                    cancelled = _o.sent();
                    (0, test_1.expect)(cancelled.status).toBe("cancelled");
                    return [2 /*return*/];
            }
        });
    });
}
//# sourceMappingURL=cloud-budget.js.map