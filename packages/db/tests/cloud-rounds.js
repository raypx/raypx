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
exports.exerciseRoundAndLease = exerciseRoundAndLease;
exports.exercisePublicationCAS = exercisePublicationCAS;
var test_1 = require("vite-plus/test");
var application_1 = require("@voidmix/application");
/** Shared black-box cases run against both adapters; the clock is injected at the application seam. */
function exerciseRoundAndLease(repository) {
    return __awaiter(this, void 0, void 0, function () {
        var time, service, conversation, initial, task, claim, first, dispatches, _a, retried, retry, _b, newGoal, _c, newRound, replay, oldRound, next, second, grant, _d, renewed, _e, _f, recovered, concurrent, before, _g, after, _h;
        var _this = this;
        var _j, _k, _l;
        return __generator(this, function (_m) {
            switch (_m.label) {
                case 0:
                    time = new Date("2026-10-08T00:00:00Z");
                    service = (0, application_1.createCloudApplication)({ repository: repository, now: function () { return time; }, limits: { taskCalls: 1 } });
                    return [4 /*yield*/, service.createConversation({
                            actorId: "alice",
                            title: "Rounds",
                            idempotencyKey: "round-conversation",
                        })];
                case 1:
                    conversation = _m.sent();
                    return [4 /*yield*/, service.sendTurn({
                            actorId: "alice",
                            conversationId: conversation.id,
                            prompt: "First immutable goal",
                            mode: "computer",
                            idempotencyKey: "round-first",
                        })];
                case 2:
                    initial = _m.sent();
                    task = initial.task;
                    claim = function (runId) { return __awaiter(_this, void 0, void 0, function () {
                        var claimed, fence, execution;
                        return __generator(this, function (_a) {
                            switch (_a.label) {
                                case 0: return [4 /*yield*/, service.acceptQueued({ runId: runId })];
                                case 1:
                                    _a.sent();
                                    return [4 /*yield*/, service.claim({ runId: runId, ownerId: "worker-a" })];
                                case 2:
                                    claimed = (_a.sent());
                                    fence = { runId: runId, ownerId: "worker-a", epoch: claimed.epoch };
                                    return [4 /*yield*/, service.startExecution(__assign(__assign({}, fence), { role: "main", prompt: "Work" }))];
                                case 3:
                                    execution = _a.sent();
                                    return [2 /*return*/, { fence: fence, execution: execution }];
                            }
                        });
                    }); };
                    return [4 /*yield*/, claim(initial.run.id)];
                case 3:
                    first = _m.sent();
                    return [4 /*yield*/, service.reserveUsage(__assign(__assign({}, first.fence), { callId: "round-call-1", executionId: first.execution.id, provider: "test", model: "model", reservedTokens: 100 }))];
                case 4:
                    _m.sent();
                    return [4 /*yield*/, Promise.allSettled([
                            service.startUsage(__assign(__assign({}, first.fence), { callId: "round-call-1", dispatchOnce: true })),
                            service.startUsage(__assign(__assign({}, first.fence), { callId: "round-call-1", dispatchOnce: true })),
                        ])];
                case 5:
                    dispatches = _m.sent();
                    (0, test_1.expect)(dispatches.filter(function (item) { return item.status === "fulfilled"; })).toHaveLength(1);
                    (0, test_1.expect)(dispatches.find(function (item) { return item.status === "rejected"; })).toMatchObject({
                        reason: { code: "CLOUD_IDEMPOTENCY_CONFLICT" },
                    });
                    return [4 /*yield*/, service.reconcileUsage({ callId: "round-call-1", started: false })];
                case 6:
                    _m.sent();
                    _a = test_1.expect;
                    return [4 /*yield*/, repository.read(function (tx) { return tx.get("usage", "round-call-1"); })];
                case 7:
                    _a.apply(void 0, [(_j = (_m.sent())) === null || _j === void 0 ? void 0 : _j.state]).toBe("unknown");
                    return [4 /*yield*/, service.settleUsage(__assign(__assign({}, first.fence), { callId: "round-call-1", inputTokens: 30, outputTokens: 10 }))];
                case 8:
                    _m.sent();
                    return [4 /*yield*/, service.finish(__assign(__assign({}, first.fence), { status: "needs_input" }))];
                case 9:
                    _m.sent();
                    return [4 /*yield*/, service.retryRun({
                            actorId: "alice",
                            runId: initial.run.id,
                            idempotencyKey: "round-retry",
                        })];
                case 10:
                    retried = _m.sent();
                    (0, test_1.expect)(retried.roundId).toBe(task.currentRoundId);
                    return [4 /*yield*/, claim(retried.id)];
                case 11:
                    retry = _m.sent();
                    return [4 /*yield*/, (0, test_1.expect)(service.reserveUsage(__assign(__assign({}, retry.fence), { callId: "round-blocked", executionId: retry.execution.id, provider: "test", model: "model", reservedTokens: 100 }))).rejects.toMatchObject({ code: "CLOUD_BUDGET_EXCEEDED" })];
                case 12:
                    _m.sent();
                    return [4 /*yield*/, service.createCommand({
                            actorId: "alice",
                            runId: retried.id,
                            type: "steer",
                            text: "Clarify the same goal",
                            idempotencyKey: "round-steer",
                        })];
                case 13:
                    _m.sent();
                    _b = test_1.expect;
                    return [4 /*yield*/, service.getTask({ actorId: "alice", taskId: task.id })];
                case 14:
                    _b.apply(void 0, [(_m.sent()).rounds]).toHaveLength(1);
                    return [4 /*yield*/, service.finish(__assign(__assign({}, retry.fence), { status: "failed" }))];
                case 15:
                    _m.sent();
                    newGoal = {
                        actorId: "alice",
                        taskId: task.id,
                        expectedGoalVersion: 1,
                        goal: "New immutable goal",
                        idempotencyKey: "new-goal",
                    };
                    return [4 /*yield*/, Promise.all([
                            service.startRound(newGoal),
                            service.startRound(newGoal),
                        ])];
                case 16:
                    _c = _m.sent(), newRound = _c[0], replay = _c[1];
                    (0, test_1.expect)(replay).toEqual(newRound);
                    (0, test_1.expect)(replay.round.createdAt).toBeInstanceOf(Date);
                    (0, test_1.expect)(newRound.round.goalVersion).toBe(2);
                    (0, test_1.expect)(newRound.round.callBudget).toBe(1);
                    return [4 /*yield*/, service.getTask({ actorId: "alice", taskId: task.id })];
                case 17:
                    oldRound = (_m.sent()).rounds.find(function (round) { return round.goalVersion === 1; });
                    (0, test_1.expect)(oldRound.goal).toBe("First immutable goal");
                    return [4 /*yield*/, (0, test_1.expect)(repository.transaction(["task:".concat(task.id)], function (tx) {
                            return tx.save("rounds", __assign(__assign({}, oldRound), { goal: "mutated" }));
                        })).rejects.toMatchObject({ code: "CLOUD_INVALID_INPUT" })];
                case 18:
                    _m.sent();
                    return [4 /*yield*/, (0, test_1.expect)(service.retryRun({ actorId: "alice", runId: retried.id, idempotencyKey: "obsolete-retry" })).rejects.toMatchObject({ code: "CLOUD_REVISION_INVALID" })];
                case 19:
                    _m.sent();
                    return [4 /*yield*/, service.continueRound({
                            actorId: "alice",
                            taskId: task.id,
                            roundId: newRound.round.id,
                            goalVersion: 2,
                            conversationId: conversation.id,
                            prompt: "Continue",
                            idempotencyKey: "round-continue",
                        })];
                case 20:
                    next = _m.sent();
                    return [4 /*yield*/, claim(next.run.id)];
                case 21:
                    second = _m.sent();
                    return [4 /*yield*/, service.reserveUsage(__assign(__assign({}, second.fence), { callId: "round-call-2", executionId: second.execution.id, provider: "test", model: "model", reservedTokens: 100 }))];
                case 22:
                    _m.sent();
                    return [4 /*yield*/, service.startUsage(__assign(__assign({}, second.fence), { callId: "round-call-2", dispatchOnce: true }))];
                case 23:
                    _m.sent();
                    return [4 /*yield*/, service.registerExecutionGrant(__assign(__assign({}, second.fence), { grantId: "grant", tokenHash: "a".repeat(64), expiresAt: new Date(time.getTime() + 30000), actions: ["model", "read"] }))];
                case 24:
                    grant = _m.sent();
                    _d = test_1.expect;
                    return [4 /*yield*/, service.validateExecutionGrant({
                            grantId: grant.id,
                            tokenHash: "a".repeat(64),
                            action: "model",
                        })];
                case 25:
                    _d.apply(void 0, [(_m.sent()).run.id]).toBe(next.run.id);
                    return [4 /*yield*/, (0, test_1.expect)(service.validateExecutionGrant({ grantId: grant.id, tokenHash: "a".repeat(64), action: "put" })).rejects.toMatchObject({ code: "CLOUD_OWNER_INVALID" })];
                case 26:
                    _m.sent();
                    time = new Date(time.getTime() + 10000);
                    return [4 /*yield*/, service.heartbeat(second.fence)];
                case 27:
                    renewed = _m.sent();
                    return [4 /*yield*/, service.renewExecutionGrant(__assign(__assign({}, second.fence), { grantId: grant.id, expiresAt: renewed.leaseExpiresAt }))];
                case 28:
                    _m.sent();
                    _e = test_1.expect;
                    return [4 /*yield*/, service.recoverInterrupted({ ownerId: "other-host" })];
                case 29:
                    _e.apply(void 0, [_m.sent()]).toHaveLength(0);
                    time = new Date(time.getTime() + 30000);
                    return [4 /*yield*/, (0, test_1.expect)(service.heartbeat(second.fence)).rejects.toMatchObject({
                            code: "CLOUD_OWNER_INVALID",
                        })];
                case 30:
                    _m.sent();
                    return [4 /*yield*/, (0, test_1.expect)(service.validateExecutionGrant({
                            grantId: grant.id,
                            tokenHash: "a".repeat(64),
                            action: "model",
                        })).rejects.toMatchObject({ code: "CLOUD_OWNER_INVALID" })];
                case 31:
                    _m.sent();
                    return [4 /*yield*/, (0, test_1.expect)(service.appendEvent(__assign(__assign({}, second.fence), { eventId: "late", type: "message.completed", payload: { messageId: "late", text: "Unsafe" } }))).rejects.toMatchObject({ code: "CLOUD_OWNER_INVALID" })];
                case 32:
                    _m.sent();
                    return [4 /*yield*/, Promise.all([
                            service.recoverInterrupted(),
                            service.recoverInterrupted(),
                        ])];
                case 33:
                    _f = _m.sent(), recovered = _f[0], concurrent = _f[1];
                    (0, test_1.expect)(recovered.length + concurrent.length).toBe(1);
                    return [4 /*yield*/, service.getRunSnapshot({ actorId: "alice", runId: next.run.id })];
                case 34:
                    before = _m.sent();
                    (0, test_1.expect)(before.run.status).toBe("failed");
                    _g = test_1.expect;
                    return [4 /*yield*/, repository.read(function (tx) { return tx.get("usage", "round-call-2"); })];
                case 35:
                    _g.apply(void 0, [(_k = (_m.sent())) === null || _k === void 0 ? void 0 : _k.state]).toBe("unknown");
                    return [4 /*yield*/, service.reconcileUsage({ callId: "round-call-2", inputTokens: 40, outputTokens: 20 })];
                case 36:
                    _m.sent();
                    return [4 /*yield*/, service.getRunSnapshot({ actorId: "alice", runId: next.run.id })];
                case 37:
                    after = _m.sent();
                    (0, test_1.expect)(after).toEqual(before);
                    _h = test_1.expect;
                    return [4 /*yield*/, repository.read(function (tx) { return tx.get("usage", "round-call-2"); })];
                case 38:
                    _h.apply(void 0, [(_l = (_m.sent())) === null || _l === void 0 ? void 0 : _l.state]).toBe("settled");
                    return [2 /*return*/];
            }
        });
    });
}
function exercisePublicationCAS(repository) {
    return __awaiter(this, void 0, void 0, function () {
        var service, conversation, initial, claimed, fence, asset, published, continueRun, fresh, _a, _b, freshClaim, freshFence, lateAsset, _c, _d;
        var _e;
        return __generator(this, function (_f) {
            switch (_f.label) {
                case 0:
                    service = (0, application_1.createCloudApplication)({ repository: repository });
                    return [4 /*yield*/, service.createConversation({
                            actorId: "alice",
                            title: "CAS",
                            idempotencyKey: "cas-conversation",
                        })];
                case 1:
                    conversation = _f.sent();
                    return [4 /*yield*/, service.sendTurn({
                            actorId: "alice",
                            conversationId: conversation.id,
                            prompt: "A delivery",
                            mode: "computer",
                            idempotencyKey: "cas-turn",
                        })];
                case 2:
                    initial = _f.sent();
                    return [4 /*yield*/, service.acceptQueued({ runId: initial.run.id })];
                case 3:
                    _f.sent();
                    return [4 /*yield*/, service.claim({ runId: initial.run.id, ownerId: "publisher" })];
                case 4:
                    claimed = (_f.sent());
                    fence = { runId: initial.run.id, ownerId: "publisher", epoch: claimed.epoch };
                    return [4 /*yield*/, service.createWorkerAsset(__assign(__assign({}, fence), { name: "result.txt", mediaType: "text/plain", byteSize: 10, checksum: "b".repeat(64), idempotencyKey: "cas-asset" }))];
                case 5:
                    asset = _f.sent();
                    return [4 /*yield*/, service.completeWorkerAsset(__assign(__assign({}, fence), { assetVersionId: asset.id, byteSize: 10, checksum: asset.checksum }))];
                case 6:
                    _f.sent();
                    return [4 /*yield*/, service.finishWithRevision(__assign(__assign({}, fence), { assetVersionIds: [asset.id], summary: "Result", output: "Done" }))];
                case 7:
                    published = _f.sent();
                    return [4 /*yield*/, service.continueRound({
                            actorId: "alice",
                            taskId: initial.task.id,
                            roundId: initial.task.currentRoundId,
                            goalVersion: 1,
                            conversationId: conversation.id,
                            prompt: "Improve",
                            idempotencyKey: "cas-continue",
                        })];
                case 8:
                    continueRun = _f.sent();
                    return [4 /*yield*/, (0, test_1.expect)(service.acceptRevision({
                            actorId: "alice",
                            taskId: initial.task.id,
                            roundId: published.revision.roundId,
                            goalVersion: 1,
                            revisionId: published.revision.id,
                            idempotencyKey: "active-accept",
                        })).rejects.toMatchObject({ code: "CLOUD_RUN_ACTIVE" })];
                case 9:
                    _f.sent();
                    return [4 /*yield*/, service.createCommand({
                            actorId: "alice",
                            runId: continueRun.run.id,
                            type: "cancel",
                            idempotencyKey: "cas-cancel",
                        })];
                case 10:
                    _f.sent();
                    return [4 /*yield*/, service.startRound({
                            actorId: "alice",
                            taskId: initial.task.id,
                            expectedGoalVersion: 1,
                            goal: "Changed goal",
                            idempotencyKey: "cas-new-goal",
                        })];
                case 11:
                    _f.sent();
                    return [4 /*yield*/, (0, test_1.expect)(service.acceptRevision({
                            actorId: "alice",
                            taskId: initial.task.id,
                            roundId: published.revision.roundId,
                            goalVersion: 1,
                            revisionId: published.revision.id,
                            idempotencyKey: "stale-accept",
                        })).rejects.toMatchObject({ code: "CLOUD_REVISION_INVALID" })];
                case 12:
                    _f.sent();
                    _b = (_a = service).sendTurn;
                    _e = {
                        actorId: "alice",
                        conversationId: conversation.id,
                        taskId: initial.task.id,
                        prompt: "New delivery"
                    };
                    return [4 /*yield*/, service.getTask({ actorId: "alice", taskId: initial.task.id })];
                case 13: return [4 /*yield*/, _b.apply(_a, [(_e.roundId = (_f.sent()).task
                            .currentRoundId,
                            _e.goalVersion = 2,
                            _e.mode = "computer",
                            _e.idempotencyKey = "cancel-publish",
                            _e)])];
                case 14:
                    fresh = _f.sent();
                    return [4 /*yield*/, service.acceptQueued({ runId: fresh.run.id })];
                case 15:
                    _f.sent();
                    return [4 /*yield*/, service.claim({ runId: fresh.run.id, ownerId: "publisher" })];
                case 16:
                    freshClaim = (_f.sent());
                    freshFence = { runId: fresh.run.id, ownerId: "publisher", epoch: freshClaim.epoch };
                    return [4 /*yield*/, service.createWorkerAsset(__assign(__assign({}, freshFence), { name: "late.txt", mediaType: "text/plain", byteSize: 10, checksum: "b".repeat(64), idempotencyKey: "cas-late-asset" }))];
                case 17:
                    lateAsset = _f.sent();
                    return [4 /*yield*/, service.completeWorkerAsset(__assign(__assign({}, freshFence), { assetVersionId: lateAsset.id, byteSize: 10, checksum: lateAsset.checksum }))];
                case 18:
                    _f.sent();
                    return [4 /*yield*/, service.createCommand({
                            actorId: "alice",
                            runId: fresh.run.id,
                            type: "cancel",
                            idempotencyKey: "cancel-before-publish",
                        })];
                case 19:
                    _f.sent();
                    return [4 /*yield*/, (0, test_1.expect)(service.finishWithRevision(__assign(__assign({}, freshFence), { assetVersionIds: [lateAsset.id], summary: "Too late", output: "Done" }))).rejects.toMatchObject({ code: "CLOUD_REVISION_INVALID" })];
                case 20:
                    _f.sent();
                    _c = test_1.expect;
                    return [4 /*yield*/, service.getAsset({ actorId: "alice", assetVersionId: lateAsset.id })];
                case 21:
                    _c.apply(void 0, [(_f.sent()).published]).toBe(false);
                    _d = test_1.expect;
                    return [4 /*yield*/, service.getTask({ actorId: "alice", taskId: initial.task.id })];
                case 22:
                    _d.apply(void 0, [(_f.sent()).task.currentRevisionId]).toBeNull();
                    return [2 /*return*/];
            }
        });
    });
}
//# sourceMappingURL=cloud-rounds.js.map