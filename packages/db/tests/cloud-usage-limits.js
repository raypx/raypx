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
exports.exerciseUTCMonthBudget = exerciseUTCMonthBudget;
exports.exerciseSearchBudget = exerciseSearchBudget;
exports.exerciseComputerRunDuration = exerciseComputerRunDuration;
var test_1 = require("vite-plus/test");
var application_1 = require("@voidmix/application");
function claim(service, runId) {
    return __awaiter(this, void 0, void 0, function () {
        var claimed, fence, execution;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, service.acceptQueued({ runId: runId })];
                case 1:
                    _a.sent();
                    return [4 /*yield*/, service.claim({ runId: runId, ownerId: "budget-host" })];
                case 2:
                    claimed = (_a.sent());
                    fence = { runId: runId, ownerId: "budget-host", epoch: claimed.epoch };
                    return [4 /*yield*/, service.startExecution(__assign(__assign({}, fence), { role: "main", prompt: "Budget" }))];
                case 3:
                    execution = _a.sent();
                    return [2 /*return*/, { fence: fence, execution: execution }];
            }
        });
    });
}
function charge(service, input, callId) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, service.reserveUsage(__assign(__assign({}, input.fence), { callId: callId, executionId: input.execution.id, provider: "provider", model: "model", reservedTokens: 100 }))];
                case 1:
                    _a.sent();
                    return [4 /*yield*/, service.startUsage(__assign(__assign({}, input.fence), { callId: callId, dispatchOnce: true }))];
                case 2:
                    _a.sent();
                    return [4 /*yield*/, service.settleUsage(__assign(__assign({}, input.fence), { callId: callId, inputTokens: 20, outputTokens: 10 }))];
                case 3:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
function exerciseUTCMonthBudget(repository) {
    return __awaiter(this, void 0, void 0, function () {
        var time, service, conversation, initial, first, _a, _b, _c, retry, second, _d, _e;
        return __generator(this, function (_f) {
            switch (_f.label) {
                case 0:
                    time = new Date("2026-10-31T23:59:59.900Z");
                    service = (0, application_1.createCloudApplication)({
                        repository: repository,
                        now: function () { return time; },
                        limits: { accountCalls: 1 },
                    });
                    return [4 /*yield*/, service.createConversation({
                            actorId: "alice",
                            title: "Month",
                            idempotencyKey: "month-c",
                        })];
                case 1:
                    conversation = _f.sent();
                    return [4 /*yield*/, service.sendTurn({
                            actorId: "alice",
                            conversationId: conversation.id,
                            mode: "computer",
                            prompt: "Same round across a month",
                            idempotencyKey: "month-turn",
                        })];
                case 2:
                    initial = _f.sent();
                    return [4 /*yield*/, claim(service, initial.run.id)];
                case 3:
                    first = _f.sent();
                    return [4 /*yield*/, charge(service, first, "october-call")];
                case 4:
                    _f.sent();
                    _a = test_1.expect;
                    return [4 /*yield*/, service.getUsage({ actorId: "alice" })];
                case 5:
                    _a.apply(void 0, [(_f.sent()).calls]).toBe(1);
                    return [4 /*yield*/, service.finish(__assign(__assign({}, first.fence), { status: "failed" }))];
                case 6:
                    _f.sent();
                    return [4 /*yield*/, (0, test_1.expect)(service.retryRun({
                            actorId: "alice",
                            runId: initial.run.id,
                            idempotencyKey: "october-blocked",
                        })).rejects.toMatchObject({ code: "CLOUD_BUDGET_EXCEEDED" })];
                case 7:
                    _f.sent();
                    time = new Date("2026-11-01T00:00:00.000Z");
                    _b = test_1.expect;
                    return [4 /*yield*/, service.getUsage({ actorId: "alice" })];
                case 8:
                    _b.apply(void 0, [(_f.sent()).calls]).toBe(0);
                    _c = test_1.expect;
                    return [4 /*yield*/, service.getUsage({ actorId: "alice" })];
                case 9:
                    _c.apply(void 0, [(_f.sent()).inputTokens]).toBe(0);
                    return [4 /*yield*/, service.retryRun({
                            actorId: "alice",
                            runId: initial.run.id,
                            idempotencyKey: "november-retry",
                        })];
                case 10:
                    retry = _f.sent();
                    (0, test_1.expect)(retry.roundId).toBe(initial.run.roundId);
                    return [4 /*yield*/, claim(service, retry.id)];
                case 11:
                    second = _f.sent();
                    return [4 /*yield*/, charge(service, second, "november-call")];
                case 12:
                    _f.sent();
                    return [4 /*yield*/, (0, test_1.expect)(service.reserveUsage(__assign(__assign({}, second.fence), { callId: "november-blocked", executionId: second.execution.id, provider: "provider", model: "model", reservedTokens: 100 }))).rejects.toMatchObject({ code: "CLOUD_BUDGET_EXCEEDED" })];
                case 13:
                    _f.sent();
                    _d = test_1.expect;
                    return [4 /*yield*/, service.getUsage({ actorId: "alice" })];
                case 14:
                    _d.apply(void 0, [(_f.sent()).calls]).toBe(1);
                    _e = test_1.expect;
                    return [4 /*yield*/, repository.read(function (tx) { return tx.list("usage", { roundId: initial.run.roundId }); })];
                case 15:
                    _e.apply(void 0, [_f.sent()]).toHaveLength(2);
                    return [2 /*return*/];
            }
        });
    });
}
function exerciseSearchBudget(repository) {
    return __awaiter(this, void 0, void 0, function () {
        var time, service, conversation, initial, first, index, retry, second, index;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    time = new Date("2026-10-08T00:00:00Z");
                    service = (0, application_1.createCloudApplication)({ repository: repository, now: function () { return time; } });
                    return [4 /*yield*/, service.createConversation({
                            actorId: "alice",
                            title: "Search",
                            idempotencyKey: "search-limit-c",
                        })];
                case 1:
                    conversation = _a.sent();
                    return [4 /*yield*/, service.sendTurn({
                            actorId: "alice",
                            conversationId: conversation.id,
                            mode: "search",
                            prompt: "Search",
                            idempotencyKey: "search-limit-turn",
                        })];
                case 2:
                    initial = _a.sent();
                    return [4 /*yield*/, claim(service, initial.run.id)];
                case 3:
                    first = _a.sent();
                    index = 0;
                    _a.label = 4;
                case 4:
                    if (!(index < 6)) return [3 /*break*/, 7];
                    return [4 /*yield*/, charge(service, first, "search-call-".concat(index))];
                case 5:
                    _a.sent();
                    _a.label = 6;
                case 6:
                    index++;
                    return [3 /*break*/, 4];
                case 7: return [4 /*yield*/, (0, test_1.expect)(service.reserveUsage(__assign(__assign({}, first.fence), { callId: "seventh-search-call", executionId: first.execution.id, provider: "provider", model: "model", reservedTokens: 100 }))).rejects.toMatchObject({ code: "CLOUD_BUDGET_EXCEEDED" })];
                case 8:
                    _a.sent();
                    return [4 /*yield*/, service.finish(__assign(__assign({}, first.fence), { status: "failed" }))];
                case 9:
                    _a.sent();
                    return [4 /*yield*/, service.retryRun({
                            actorId: "alice",
                            runId: initial.run.id,
                            idempotencyKey: "search-limit-retry",
                        })];
                case 10:
                    retry = _a.sent();
                    return [4 /*yield*/, claim(service, retry.id)];
                case 11:
                    second = _a.sent();
                    return [4 /*yield*/, charge(service, second, "search-retry-call")];
                case 12:
                    _a.sent();
                    index = 0;
                    _a.label = 13;
                case 13:
                    if (!(index < 3)) return [3 /*break*/, 16];
                    time = new Date(time.getTime() + 20000);
                    return [4 /*yield*/, service.heartbeat(second.fence)];
                case 14:
                    _a.sent();
                    _a.label = 15;
                case 15:
                    index++;
                    return [3 /*break*/, 13];
                case 16: return [4 /*yield*/, (0, test_1.expect)(service.reserveUsage(__assign(__assign({}, second.fence), { callId: "expired-search-call", executionId: second.execution.id, provider: "provider", model: "model", reservedTokens: 100 }))).rejects.toMatchObject({ code: "CLOUD_BUDGET_EXCEEDED" })];
                case 17:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
function exerciseComputerRunDuration(repository) {
    return __awaiter(this, void 0, void 0, function () {
        var time, service, conversation, initial, first, retry, second, _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    time = new Date("2026-10-08T00:00:00Z");
                    service = (0, application_1.createCloudApplication)({
                        repository: repository,
                        now: function () { return time; },
                        limits: { taskCalls: 2, taskDurationMs: 1000 },
                    });
                    return [4 /*yield*/, service.createConversation({
                            actorId: "alice",
                            title: "Duration",
                            idempotencyKey: "duration-c",
                        })];
                case 1:
                    conversation = _b.sent();
                    return [4 /*yield*/, service.sendTurn({
                            actorId: "alice",
                            conversationId: conversation.id,
                            mode: "computer",
                            prompt: "Long-running goal",
                            idempotencyKey: "duration-turn",
                        })];
                case 2:
                    initial = _b.sent();
                    return [4 /*yield*/, claim(service, initial.run.id)];
                case 3:
                    first = _b.sent();
                    return [4 /*yield*/, charge(service, first, "duration-call-one")];
                case 4:
                    _b.sent();
                    time = new Date(time.getTime() + 1000);
                    return [4 /*yield*/, (0, test_1.expect)(service.reserveUsage(__assign(__assign({}, first.fence), { callId: "expired-computer-call", executionId: first.execution.id, provider: "provider", model: "model", reservedTokens: 100 }))).rejects.toMatchObject({ code: "CLOUD_BUDGET_EXCEEDED" })];
                case 5:
                    _b.sent();
                    return [4 /*yield*/, service.finish(__assign(__assign({}, first.fence), { status: "failed" }))];
                case 6:
                    _b.sent();
                    return [4 /*yield*/, service.retryRun({
                            actorId: "alice",
                            runId: initial.run.id,
                            idempotencyKey: "duration-retry",
                        })];
                case 7:
                    retry = _b.sent();
                    return [4 /*yield*/, claim(service, retry.id)];
                case 8:
                    second = _b.sent();
                    (0, test_1.expect)(retry.roundId).toBe(initial.run.roundId);
                    return [4 /*yield*/, charge(service, second, "duration-call-two")];
                case 9:
                    _b.sent();
                    return [4 /*yield*/, (0, test_1.expect)(service.reserveUsage(__assign(__assign({}, second.fence), { callId: "round-budget-exhausted", executionId: second.execution.id, provider: "provider", model: "model", reservedTokens: 100 }))).rejects.toMatchObject({ code: "CLOUD_BUDGET_EXCEEDED" })];
                case 10:
                    _b.sent();
                    _a = test_1.expect;
                    return [4 /*yield*/, service.getTask({ actorId: "alice", taskId: initial.task.id })];
                case 11:
                    _a.apply(void 0, [(_b.sent()).rounds]).toHaveLength(1);
                    return [2 /*return*/];
            }
        });
    });
}
//# sourceMappingURL=cloud-usage-limits.js.map