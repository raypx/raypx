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
var test_1 = require("vite-plus/test");
var application_1 = require("@voidmix/application");
var cloud_memory_js_1 = require("./cloud-memory.js");
var cloud_budget_js_1 = require("../tests/cloud-budget.js");
var cloud_rounds_js_1 = require("../tests/cloud-rounds.js");
var cloud_projection_js_1 = require("../tests/cloud-projection.js");
var cloud_usage_limits_js_1 = require("../tests/cloud-usage-limits.js");
var checksum = "a".repeat(64);
function fixture(limits) {
    if (limits === void 0) { limits = {}; }
    var repository = new cloud_memory_js_1.InMemoryCloudRepository({ users: [{ id: "alice" }, { id: "bob" }] });
    var sequence = 0;
    var service = (0, application_1.createCloudApplication)({
        repository: repository,
        now: function () { return new Date("2026-10-06T00:00:00Z"); },
        id: function () { return "cloud-".concat(++sequence); },
        limits: limits,
    });
    function start() {
        return __awaiter(this, arguments, void 0, function (mode) {
            var conversation, result, claim, fence, execution;
            if (mode === void 0) { mode = "computer"; }
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, service.createConversation({
                            actorId: "alice",
                            title: "Research",
                            idempotencyKey: "conversation-".concat(++sequence),
                        })];
                    case 1:
                        conversation = _a.sent();
                        return [4 /*yield*/, service.sendTurn({
                                actorId: "alice",
                                conversationId: conversation.id,
                                prompt: "Create a report",
                                mode: mode,
                                idempotencyKey: "turn-".concat(++sequence),
                            })];
                    case 2:
                        result = _a.sent();
                        return [4 /*yield*/, service.acceptQueued({ runId: result.run.id })];
                    case 3:
                        _a.sent();
                        return [4 /*yield*/, service.claim({ runId: result.run.id, ownerId: "worker" })];
                    case 4:
                        claim = (_a.sent());
                        fence = { runId: result.run.id, ownerId: "worker", epoch: claim.epoch };
                        return [4 /*yield*/, service.startExecution(__assign(__assign({}, fence), { role: "main", prompt: result.run.prompt }))];
                    case 5:
                        execution = _a.sent();
                        return [2 /*return*/, __assign(__assign({}, result), { fence: fence, execution: execution })];
                }
            });
        });
    }
    return { service: service, repository: repository, start: start };
}
(0, test_1.describe)("cloud application guarantees", function () {
    (0, test_1.it)("derives personal ownership, denies other accounts and checks live account status", function () { return __awaiter(void 0, void 0, void 0, function () {
        var _a, service, repository, start, run, _b;
        var _c;
        return __generator(this, function (_d) {
            switch (_d.label) {
                case 0:
                    _a = fixture(), service = _a.service, repository = _a.repository, start = _a.start;
                    return [4 /*yield*/, start()];
                case 1:
                    run = _d.sent();
                    (0, test_1.expect)(run.run.scope).toEqual({ type: "personal", ownerUserId: "alice" });
                    return [4 /*yield*/, (0, test_1.expect)(service.getRunSnapshot({ actorId: "bob", runId: run.run.id })).rejects.toMatchObject({ code: "CLOUD_ACCESS_DENIED" })];
                case 2:
                    _d.sent();
                    repository.setUserActive("alice", false);
                    return [4 /*yield*/, (0, test_1.expect)(service.heartbeat(run.fence)).rejects.toMatchObject({
                            code: "CLOUD_ACCESS_DENIED",
                        })];
                case 3:
                    _d.sent();
                    return [4 /*yield*/, service.interrupt(run.fence)];
                case 4:
                    _d.sent();
                    _b = test_1.expect;
                    return [4 /*yield*/, repository.read(function (tx) { return tx.get("runs", run.run.id); })];
                case 5:
                    _b.apply(void 0, [(_c = (_d.sent())) === null || _c === void 0 ? void 0 : _c.status]).toBe("failed");
                    return [2 /*return*/];
            }
        });
    }); });
    (0, test_1.it)("atomically queues one task run and replays an idempotent turn without extra outbox entries", function () { return __awaiter(void 0, void 0, void 0, function () {
        var _a, service, repository, conversation, input, _b, first, duplicate, _c, _d, _e, next, _f;
        return __generator(this, function (_g) {
            switch (_g.label) {
                case 0:
                    _a = fixture(), service = _a.service, repository = _a.repository;
                    return [4 /*yield*/, service.createConversation({
                            actorId: "alice",
                            title: "Same",
                            idempotencyKey: "c",
                        })];
                case 1:
                    conversation = _g.sent();
                    input = {
                        actorId: "alice",
                        conversationId: conversation.id,
                        prompt: "Report",
                        mode: "computer",
                        idempotencyKey: "turn",
                    };
                    return [4 /*yield*/, Promise.all([
                            service.sendTurn(input),
                            service.sendTurn(input),
                        ])];
                case 2:
                    _b = _g.sent(), first = _b[0], duplicate = _b[1];
                    (0, test_1.expect)(first).toEqual(duplicate);
                    _c = test_1.expect;
                    return [4 /*yield*/, service.getConversation({ actorId: "alice", conversationId: conversation.id })];
                case 3:
                    _c.apply(void 0, [(_g.sent()).turns]).toHaveLength(1);
                    _d = test_1.expect;
                    return [4 /*yield*/, service.conversationHistory({
                            actorId: "alice",
                            conversationId: conversation.id,
                            limit: 1,
                        })];
                case 4:
                    _d.apply(void 0, [(_g.sent()).items]).toHaveLength(1);
                    _e = test_1.expect;
                    return [4 /*yield*/, repository.outboxItems()];
                case 5:
                    _e.apply(void 0, [_g.sent()]).toHaveLength(1);
                    next = __assign(__assign({}, input), { taskId: first.task.id, roundId: first.task.currentRoundId, goalVersion: first.task.goalVersion, idempotencyKey: "next" });
                    return [4 /*yield*/, (0, test_1.expect)(service.sendTurn(next)).rejects.toMatchObject({ code: "CLOUD_RUN_ACTIVE" })];
                case 6:
                    _g.sent();
                    _f = test_1.expect;
                    return [4 /*yield*/, repository.outboxItems()];
                case 7:
                    _f.apply(void 0, [_g.sent()]).toHaveLength(1);
                    return [4 /*yield*/, (0, test_1.expect)(service.sendTurn(__assign(__assign({}, input), { prompt: "Changed" }))).rejects.toMatchObject({
                            code: "CLOUD_IDEMPOTENCY_CONFLICT",
                        })];
                case 8:
                    _g.sent();
                    return [2 /*return*/];
            }
        });
    }); });
    (0, test_1.it)("commits delivery, run result, task review and notification together; acceptance completes task", function () { return __awaiter(void 0, void 0, void 0, function () {
        var _a, service, repository, start, result, asset, _b, published, _c, _d, _e, _f, task, _g;
        return __generator(this, function (_h) {
            switch (_h.label) {
                case 0:
                    _a = fixture(), service = _a.service, repository = _a.repository, start = _a.start;
                    return [4 /*yield*/, start()];
                case 1:
                    result = _h.sent();
                    return [4 /*yield*/, service.createWorkerAsset(__assign(__assign({}, result.fence), { name: "report.pdf", mediaType: "application/pdf", byteSize: 10, checksum: checksum, idempotencyKey: "file" }))];
                case 2:
                    asset = _h.sent();
                    return [4 /*yield*/, (0, test_1.expect)(service.finishWithRevision(__assign(__assign({}, result.fence), { assetVersionIds: [asset.id], summary: "report", output: "Done" }))).rejects.toMatchObject({ code: "CLOUD_REVISION_INVALID" })];
                case 3:
                    _h.sent();
                    _b = test_1.expect;
                    return [4 /*yield*/, service.getTask({ actorId: "alice", taskId: result.task.id })];
                case 4:
                    _b.apply(void 0, [(_h.sent()).revisions]).toHaveLength(0);
                    return [4 /*yield*/, service.completeWorkerAsset(__assign(__assign({}, result.fence), { assetVersionId: asset.id, byteSize: 10, checksum: checksum }))];
                case 5:
                    _h.sent();
                    return [4 /*yield*/, service.finishWithRevision(__assign(__assign({}, result.fence), { assetVersionIds: [asset.id], summary: "report", output: "Done" }))];
                case 6:
                    published = _h.sent();
                    (0, test_1.expect)(published.run.status).toBe("succeeded");
                    _c = test_1.expect;
                    return [4 /*yield*/, service.getTask({ actorId: "alice", taskId: result.task.id })];
                case 7:
                    _c.apply(void 0, [(_h.sent()).revisions]).toHaveLength(1);
                    _d = test_1.expect;
                    return [4 /*yield*/, service.getTask({ actorId: "alice", taskId: result.task.id })];
                case 8:
                    _d.apply(void 0, [(_h.sent()).task.status]).toBe("review");
                    _e = test_1.expect;
                    return [4 /*yield*/, service.listNotifications({ actorId: "alice" })];
                case 9:
                    _e.apply(void 0, [(_h.sent()).items]).toHaveLength(1);
                    _f = test_1.expect;
                    return [4 /*yield*/, repository.outboxItems()];
                case 10:
                    _f.apply(void 0, [(_h.sent()).filter(function (e) { return e.type === "cloud.notification.created"; })]).toHaveLength(1);
                    return [4 /*yield*/, service.acceptRevision({
                            actorId: "alice",
                            taskId: result.task.id,
                            revisionId: published.revision.id,
                            roundId: published.revision.roundId,
                            goalVersion: published.revision.goalVersion,
                            idempotencyKey: "accept",
                        })];
                case 11:
                    task = _h.sent();
                    (0, test_1.expect)(task.status).toBe("completed");
                    _g = test_1.expect;
                    return [4 /*yield*/, service.acceptRevision({
                            actorId: "alice",
                            taskId: task.id,
                            revisionId: published.revision.id,
                            roundId: published.revision.roundId,
                            goalVersion: published.revision.goalVersion,
                            idempotencyKey: "accept",
                        })];
                case 12:
                    _g.apply(void 0, [_h.sent()]).toEqual(task);
                    return [2 /*return*/];
            }
        });
    }); });
    (0, test_1.it)("cancellation wins before completion and a late cancellation cannot replace success", function () { return __awaiter(void 0, void 0, void 0, function () {
        var first, result, _a, second, done, _b, _c;
        return __generator(this, function (_d) {
            switch (_d.label) {
                case 0:
                    first = fixture();
                    return [4 /*yield*/, first.start("search")];
                case 1:
                    result = _d.sent();
                    return [4 /*yield*/, first.service.createCommand({
                            actorId: "alice",
                            runId: result.run.id,
                            type: "cancel",
                            idempotencyKey: "cancel",
                        })];
                case 2:
                    _d.sent();
                    _a = test_1.expect;
                    return [4 /*yield*/, first.service.finish(__assign(__assign({}, result.fence), { status: "succeeded", output: "too late" }))];
                case 3:
                    _a.apply(void 0, [(_d.sent())
                            .status]).toBe("cancelled");
                    return [4 /*yield*/, (0, test_1.expect)(first.service.appendEvent(__assign(__assign({}, result.fence), { type: "message.delta", eventId: "late", payload: { text: "late" } }))).rejects.toMatchObject({ code: "CLOUD_OWNER_INVALID" })];
                case 4:
                    _d.sent();
                    second = fixture();
                    return [4 /*yield*/, second.start("search")];
                case 5:
                    done = _d.sent();
                    return [4 /*yield*/, second.service.finish(__assign(__assign({}, done.fence), { status: "succeeded", output: "done" }))];
                case 6:
                    _d.sent();
                    _b = test_1.expect;
                    return [4 /*yield*/, second.service.createCommand({
                            actorId: "alice",
                            runId: done.run.id,
                            type: "cancel",
                            idempotencyKey: "late",
                        })];
                case 7:
                    _b.apply(void 0, [(_d.sent()).status]).toBe("rejected");
                    _c = test_1.expect;
                    return [4 /*yield*/, second.service.getRunSummary({ actorId: "alice", runId: done.run.id })];
                case 8:
                    _c.apply(void 0, [(_d.sent()).status]).toBe("succeeded");
                    return [2 /*return*/];
            }
        });
    }); });
    (0, test_1.it)("serializes child reservations under the shared budget and preserves unknown actual consumption", function () { return __awaiter(void 0, void 0, void 0, function () {
        var _a, service, start, result, child, request, attempts, callId, usage, _b;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    _a = fixture({ taskCalls: 1 }), service = _a.service, start = _a.start;
                    return [4 /*yield*/, start()];
                case 1:
                    result = _c.sent();
                    return [4 /*yield*/, service.startExecution(__assign(__assign({}, result.fence), { parentId: result.execution.id, role: "research", prompt: "read" }))];
                case 2:
                    child = _c.sent();
                    request = __assign(__assign({}, result.fence), { provider: "provider", model: "model", reservedTokens: 100, pricing: { inputPerMillion: 2, outputPerMillion: 4 } });
                    return [4 /*yield*/, Promise.allSettled([
                            service.reserveUsage(__assign(__assign({}, request), { callId: "main", executionId: result.execution.id })),
                            service.reserveUsage(__assign(__assign({}, request), { callId: "child", executionId: child.id })),
                        ])];
                case 3:
                    attempts = _c.sent();
                    (0, test_1.expect)(attempts.filter(function (a) { return a.status === "fulfilled"; })).toHaveLength(1);
                    (0, test_1.expect)(attempts.find(function (a) { return a.status === "rejected"; })).toMatchObject({
                        reason: { code: "CLOUD_BUDGET_EXCEEDED" },
                    });
                    callId = attempts[0].status === "fulfilled" ? "main" : "child";
                    return [4 /*yield*/, service.startUsage(__assign(__assign({}, result.fence), { callId: callId }))];
                case 4:
                    _c.sent();
                    return [4 /*yield*/, service.settleUsage(__assign(__assign({}, result.fence), { callId: callId }))];
                case 5:
                    usage = _c.sent();
                    (0, test_1.expect)(usage.state).toBe("unknown");
                    (0, test_1.expect)(usage.inputTokens).toBeNull();
                    (0, test_1.expect)(usage.estimatedCost).toBeGreaterThan(0);
                    _b = test_1.expect;
                    return [4 /*yield*/, service.getUsage({ actorId: "alice" })];
                case 6:
                    _b.apply(void 0, [(_c.sent()).unknownCalls]).toBe(1);
                    return [2 /*return*/];
            }
        });
    }); });
    (0, test_1.it)("deduplicates source/tool events and allocates a continuous sequence", function () { return __awaiter(void 0, void 0, void 0, function () {
        var _a, service, start, result, source, first, _b, _c, snapshot, toolEvent, _d, _e, _f;
        return __generator(this, function (_g) {
            switch (_g.label) {
                case 0:
                    _a = fixture(), service = _a.service, start = _a.start;
                    return [4 /*yield*/, start()];
                case 1:
                    result = _g.sent();
                    source = __assign(__assign({}, result.fence), { eventId: "source", type: "source.created", payload: { id: "source-1", url: "https://example.com", title: "Example", excerpt: "Source" } });
                    return [4 /*yield*/, service.appendEvent(source)];
                case 2:
                    first = _g.sent();
                    _b = test_1.expect;
                    return [4 /*yield*/, service.appendEvent(source)];
                case 3:
                    _b.apply(void 0, [_g.sent()]).toEqual(first);
                    return [4 /*yield*/, service.startTool(__assign(__assign({}, result.fence), { executionId: result.execution.id, callId: "tool", name: "read_source", input: { url: "https://example.com" } }))];
                case 4:
                    _g.sent();
                    return [4 /*yield*/, service.finishTool(__assign(__assign({}, result.fence), { callId: "tool", status: "succeeded", output: { body: "large output ".repeat(1000) } }))];
                case 5:
                    _g.sent();
                    _c = test_1.expect;
                    return [4 /*yield*/, service.getToolDetail({ actorId: "alice", callId: "tool" })];
                case 6:
                    _c.apply(void 0, [(_g.sent()).status]).toBe("succeeded");
                    return [4 /*yield*/, service.getRunSnapshot({ actorId: "alice", runId: result.run.id })];
                case 7:
                    snapshot = _g.sent();
                    (0, test_1.expect)(snapshot.sources).toHaveLength(1);
                    toolEvent = snapshot.events.find(function (event) { return event.type === "tool.completed"; });
                    (0, test_1.expect)(toolEvent.payload["summary"]).toHaveLength(300);
                    (0, test_1.expect)(toolEvent.payload).not.toHaveProperty("output");
                    _d = test_1.expect;
                    return [4 /*yield*/, service.getToolDetail({ actorId: "alice", callId: "tool" })];
                case 8:
                    _d.apply(void 0, [(_g.sent()).output]).toEqual({
                        body: "large output ".repeat(1000),
                    });
                    _e = test_1.expect;
                    return [4 /*yield*/, service.workerSnapshot(result.fence)];
                case 9:
                    _e.apply(void 0, [(_g.sent()).events.find(function (event) { return event.type === "tool.completed"; }).payload]).toHaveProperty("output");
                    _f = test_1.expect;
                    return [4 /*yield*/, service.listEvents({
                            actorId: "alice",
                            runId: result.run.id,
                            afterSequence: toolEvent.sequence - 1,
                            limit: 1,
                        })];
                case 10:
                    _f.apply(void 0, [(_g.sent()).items[0].payload]).toEqual(toolEvent.payload);
                    (0, test_1.expect)(snapshot.events.map(function (e) { return e.sequence; })).toEqual(snapshot.events.map(function (_, i) { return i + 1; }));
                    return [2 /*return*/];
            }
        });
    }); });
    (0, test_1.it)("replays mutable commands and rechecks opt-in and permissions before sending email", function () { return __awaiter(void 0, void 0, void 0, function () {
        var _a, service, repository, start, preferences, initial, _b, _c, result, notification, _d, _e;
        return __generator(this, function (_f) {
            switch (_f.label) {
                case 0:
                    _a = fixture(), service = _a.service, repository = _a.repository, start = _a.start;
                    preferences = {
                        actorId: "alice",
                        emailEnabled: true,
                        locale: "zh",
                        idempotencyKey: "prefs",
                    };
                    return [4 /*yield*/, service.updatePreferences(preferences)];
                case 1:
                    initial = _f.sent();
                    return [4 /*yield*/, service.updatePreferences(__assign(__assign({}, preferences), { emailEnabled: false, idempotencyKey: "prefs-2" }))];
                case 2:
                    _f.sent();
                    _b = test_1.expect;
                    return [4 /*yield*/, service.updatePreferences(preferences)];
                case 3:
                    _b.apply(void 0, [_f.sent()]).toEqual(initial);
                    _c = test_1.expect;
                    return [4 /*yield*/, service.getPreferences({ actorId: "alice" })];
                case 4:
                    _c.apply(void 0, [(_f.sent()).emailEnabled]).toBe(false);
                    return [4 /*yield*/, service.updatePreferences(__assign(__assign({}, preferences), { idempotencyKey: "prefs-3" }))];
                case 5:
                    _f.sent();
                    return [4 /*yield*/, start()];
                case 6:
                    result = _f.sent();
                    return [4 /*yield*/, service.finish(__assign(__assign({}, result.fence), { status: "failed", error: "error" }))];
                case 7:
                    _f.sent();
                    return [4 /*yield*/, service.listNotifications({ actorId: "alice" })];
                case 8:
                    notification = (_f.sent()).items[0];
                    _d = test_1.expect;
                    return [4 /*yield*/, service.getDeliveryContext({ notificationId: notification.id })];
                case 9:
                    _d.apply(void 0, [_f.sent()]).toMatchObject({
                        email: "alice@example.com",
                        locale: "zh",
                    });
                    repository.setUserActive("alice", false);
                    _e = test_1.expect;
                    return [4 /*yield*/, service.getDeliveryContext({ notificationId: notification.id })];
                case 10:
                    _e.apply(void 0, [_f.sent()]).toBeNull();
                    return [2 /*return*/];
            }
        });
    }); });
});
(0, test_1.it)("publishes a complete file collection atomically and reclaims only terminal abandoned output", function () { return __awaiter(void 0, void 0, void 0, function () {
    var time, repository, service, conversation, _a, run, task, claimed, fence, first, second, verified, _b, _c, _d, _e, _f, _g, claim, _h, _j;
    return __generator(this, function (_k) {
        switch (_k.label) {
            case 0:
                time = new Date("2026-10-06T00:00:00Z");
                repository = new cloud_memory_js_1.InMemoryCloudRepository({ users: [{ id: "alice" }] });
                service = (0, application_1.createCloudApplication)({ repository: repository, now: function () { return time; } });
                return [4 /*yield*/, service.createConversation({
                        actorId: "alice",
                        title: "Collection",
                        idempotencyKey: "collection",
                    })];
            case 1:
                conversation = _k.sent();
                return [4 /*yield*/, service.sendTurn({
                        actorId: "alice",
                        conversationId: conversation.id,
                        prompt: "Two files",
                        mode: "computer",
                        idempotencyKey: "two",
                    })];
            case 2:
                _a = _k.sent(), run = _a.run, task = _a.task;
                return [4 /*yield*/, service.acceptQueued({ runId: run.id })];
            case 3:
                _k.sent();
                return [4 /*yield*/, service.claim({ runId: run.id, ownerId: "worker" })];
            case 4:
                claimed = (_k.sent());
                fence = { runId: run.id, ownerId: "worker", epoch: claimed.epoch };
                return [4 /*yield*/, service.createWorkerAsset(__assign(__assign({}, fence), { name: "first.pdf", mediaType: "application/pdf", byteSize: 10, checksum: checksum, idempotencyKey: "first" }))];
            case 5:
                first = _k.sent();
                return [4 /*yield*/, service.createWorkerAsset(__assign(__assign({}, fence), { name: "second.pdf", mediaType: "application/pdf", byteSize: 10, checksum: checksum, idempotencyKey: "second" }))];
            case 6:
                second = _k.sent();
                return [4 /*yield*/, service.completeWorkerAsset(__assign(__assign({}, fence), { assetVersionId: first.id, byteSize: 10, checksum: checksum }))];
            case 7:
                verified = _k.sent();
                (0, test_1.expect)(verified.published).toBe(false);
                (0, test_1.expect)(verified.verifiedAt).toBeInstanceOf(Date);
                return [4 /*yield*/, (0, test_1.expect)(service.completeUpload({
                        actorId: "alice",
                        assetVersionId: first.id,
                        byteSize: 10,
                        checksum: checksum,
                        idempotencyKey: "bypass",
                    })).rejects.toMatchObject({ code: "CLOUD_INVALID_INPUT" })];
            case 8:
                _k.sent();
                return [4 /*yield*/, (0, test_1.expect)(service.finishWithRevision(__assign(__assign({}, fence), { assetVersionIds: [first.id, second.id], summary: "Both", output: "Done" }))).rejects.toMatchObject({ code: "CLOUD_REVISION_INVALID" })];
            case 9:
                _k.sent();
                _b = test_1.expect;
                return [4 /*yield*/, service.listAssets({ actorId: "alice" })];
            case 10:
                _b.apply(void 0, [(_k.sent()).items]).toHaveLength(0);
                _c = test_1.expect;
                return [4 /*yield*/, service.getAsset({ actorId: "alice", assetVersionId: first.id })];
            case 11:
                _c.apply(void 0, [(_k.sent()).published]).toBe(false);
                _d = test_1.expect;
                return [4 /*yield*/, service.getTask({ actorId: "alice", taskId: task.id })];
            case 12:
                _d.apply(void 0, [(_k.sent()).revisions]).toHaveLength(0);
                time = new Date(time.getTime() + 16 * 60 * 1000);
                _e = test_1.expect;
                return [4 /*yield*/, service.listExpiredUploads({ limit: 10 })];
            case 13:
                _e.apply(void 0, [_k.sent()]).toHaveLength(0);
                _f = test_1.expect;
                return [4 /*yield*/, service.claimExpiredUpload({ assetVersionId: first.id })];
            case 14:
                _f.apply(void 0, [_k.sent()]).toBeNull();
                return [4 /*yield*/, service.recoverInterrupted()];
            case 15:
                _k.sent();
                _g = test_1.expect;
                return [4 /*yield*/, service.listExpiredUploads({ limit: 10 })];
            case 16:
                _g.apply(void 0, [_k.sent()]).toHaveLength(2);
                return [4 /*yield*/, service.claimExpiredUpload({ assetVersionId: first.id })];
            case 17:
                claim = _k.sent();
                (0, test_1.expect)(claim).toMatchObject({ id: first.id, cleanupClaimed: true });
                _h = test_1.expect;
                return [4 /*yield*/, service.claimExpiredUpload({ assetVersionId: first.id })];
            case 18:
                _h.apply(void 0, [_k.sent()]).toEqual(claim);
                return [4 /*yield*/, service.removeExpiredUpload({ assetVersionId: first.id })];
            case 19:
                _k.sent();
                _j = test_1.expect;
                return [4 /*yield*/, service.getUsage({ actorId: "alice" })];
            case 20:
                _j.apply(void 0, [(_k.sent()).storageBytes]).toBe(10);
                return [2 /*return*/];
        }
    });
}); });
(0, test_1.it)("binds list cursors to the account and keeps old turn retries reachable through capped history", function () { return __awaiter(void 0, void 0, void 0, function () {
    var sequence, time, admitted, repository, service, conversation, other, listed, _a, firstInput, first, claim, index, retry, snapshot, older, _b, _c;
    return __generator(this, function (_d) {
        switch (_d.label) {
            case 0:
                sequence = 0;
                time = new Date("2026-10-06T00:00:00Z");
                admitted = true;
                repository = new cloud_memory_js_1.InMemoryCloudRepository({ users: [{ id: "alice" }, { id: "bob" }] });
                service = (0, application_1.createCloudApplication)({
                    repository: repository,
                    now: function () { return time; },
                    id: function () { return "p-".concat(++sequence); },
                    limits: { accountConcurrentRuns: 200 },
                    admitRun: function () { return __awaiter(void 0, void 0, void 0, function () {
                        return __generator(this, function (_a) {
                            if (!admitted)
                                throw new Error("disabled");
                            return [2 /*return*/];
                        });
                    }); },
                });
                return [4 /*yield*/, service.createConversation({
                        actorId: "alice",
                        title: "History",
                        idempotencyKey: "history",
                    })];
            case 1:
                conversation = _d.sent();
                return [4 /*yield*/, service.createConversation({
                        actorId: "alice",
                        title: "Other",
                        idempotencyKey: "other",
                    })];
            case 2:
                other = _d.sent();
                return [4 /*yield*/, service.listConversations({ actorId: "alice", limit: 1 })];
            case 3:
                listed = _d.sent();
                (0, test_1.expect)(listed.nextCursor).toEqual(test_1.expect.any(String));
                _a = test_1.expect;
                return [4 /*yield*/, service.listConversations({ actorId: "alice", limit: 1, cursor: listed.nextCursor })];
            case 4:
                _a.apply(void 0, [(_d.sent())
                        .items]).toHaveLength(1);
                return [4 /*yield*/, (0, test_1.expect)(service.listConversations({ actorId: "bob", limit: 1, cursor: listed.nextCursor })).rejects.toMatchObject({ code: "CLOUD_INVALID_INPUT" })];
            case 5:
                _d.sent();
                firstInput = {
                    actorId: "alice",
                    conversationId: conversation.id,
                    prompt: "First",
                    mode: "search",
                    idempotencyKey: "first",
                };
                return [4 /*yield*/, service.sendTurn(firstInput)];
            case 6:
                first = _d.sent();
                return [4 /*yield*/, service.acceptQueued({ runId: first.run.id })];
            case 7:
                _d.sent();
                return [4 /*yield*/, service.claim({ runId: first.run.id, ownerId: "worker" })];
            case 8:
                claim = (_d.sent());
                return [4 /*yield*/, service.finish({
                        runId: first.run.id,
                        ownerId: "worker",
                        epoch: claim.epoch,
                        status: "succeeded",
                        output: "Answer",
                    })];
            case 9:
                _d.sent();
                index = 0;
                _d.label = 10;
            case 10:
                if (!(index < 101)) return [3 /*break*/, 13];
                time = new Date(time.getTime() + 1000);
                return [4 /*yield*/, service.sendTurn(__assign(__assign({}, firstInput), { prompt: "Next ".concat(index), idempotencyKey: "next-".concat(index) }))];
            case 11:
                _d.sent();
                _d.label = 12;
            case 12:
                index++;
                return [3 /*break*/, 10];
            case 13: return [4 /*yield*/, service.retryRun({
                    actorId: "alice",
                    runId: first.run.id,
                    idempotencyKey: "retry",
                })];
            case 14:
                retry = _d.sent();
                return [4 /*yield*/, service.getConversation({
                        actorId: "alice",
                        conversationId: conversation.id,
                    })];
            case 15:
                snapshot = _d.sent();
                (0, test_1.expect)(snapshot.turns).toHaveLength(100);
                (0, test_1.expect)(snapshot.historyCursor).toEqual(test_1.expect.any(String));
                (0, test_1.expect)(snapshot.turns).not.toContainEqual(first.turn);
                return [4 /*yield*/, service.conversationHistory({
                        actorId: "alice",
                        conversationId: conversation.id,
                        limit: 100,
                        cursor: snapshot.historyCursor,
                    })];
            case 16:
                older = _d.sent();
                (0, test_1.expect)(older.items).toHaveLength(2);
                (0, test_1.expect)(older.runs.map(function (run) { return run.id; })).toContain(first.run.id);
                (0, test_1.expect)(older.runs.map(function (run) { return run.id; })).toContain(retry.id);
                (0, test_1.expect)(older.nextCursor).toBeNull();
                return [4 /*yield*/, (0, test_1.expect)(service.conversationHistory({
                        actorId: "alice",
                        conversationId: other.id,
                        cursor: snapshot.historyCursor,
                    })).rejects.toMatchObject({ code: "CLOUD_INVALID_INPUT" })];
            case 17:
                _d.sent();
                admitted = false;
                _b = test_1.expect;
                return [4 /*yield*/, service.sendTurn(firstInput)];
            case 18:
                _b.apply(void 0, [(_d.sent()).run.id]).toBe(first.run.id);
                _c = test_1.expect;
                return [4 /*yield*/, service.retryRun({ actorId: "alice", runId: first.run.id, idempotencyKey: "retry" })];
            case 19:
                _c.apply(void 0, [(_d.sent()).id]).toBe(retry.id);
                return [2 /*return*/];
        }
    });
}); });
(0, test_1.it)("commits Search failure notifications with the parent Run scope and Conversation target", function () { return __awaiter(void 0, void 0, void 0, function () {
    var _a, service, repository, start, result, notification, _b, _c, _d;
    return __generator(this, function (_e) {
        switch (_e.label) {
            case 0:
                _a = fixture(), service = _a.service, repository = _a.repository, start = _a.start;
                return [4 /*yield*/, service.updatePreferences({
                        actorId: "alice",
                        emailEnabled: true,
                        locale: "zh",
                        idempotencyKey: "search-email",
                    })];
            case 1:
                _e.sent();
                return [4 /*yield*/, start("search")];
            case 2:
                result = _e.sent();
                return [4 /*yield*/, service.finish(__assign(__assign({}, result.fence), { status: "failed", error: "search unavailable" }))];
            case 3:
                _e.sent();
                return [4 /*yield*/, service.listNotifications({ actorId: "alice" })];
            case 4:
                notification = (_e.sent()).items[0];
                (0, test_1.expect)(notification).toMatchObject({
                    scope: result.run.scope,
                    recipientId: "alice",
                    type: "run.failed",
                    taskId: null,
                    conversationId: result.run.conversationId,
                    runId: result.run.id,
                    emailEnabled: true,
                });
                _b = test_1.expect;
                return [4 /*yield*/, service.getDeliveryContext({ notificationId: notification.id })];
            case 5:
                _b.apply(void 0, [_e.sent()]).toMatchObject({
                    email: "alice@example.com",
                    locale: "zh",
                });
                _c = test_1.expect;
                return [4 /*yield*/, service.listNotifications({ actorId: "bob" })];
            case 6:
                _c.apply(void 0, [(_e.sent()).items]).toHaveLength(0);
                _d = test_1.expect;
                return [4 /*yield*/, repository.outboxItems()];
            case 7:
                _d.apply(void 0, [(_e.sent()).filter(function (event) { return event.type === "cloud.notification.created"; })]).toHaveLength(1);
                return [2 /*return*/];
        }
    });
}); });
(0, test_1.it)("pages redacted Admin diagnostics and counts unread notifications independently of the visible window", function () { return __awaiter(void 0, void 0, void 0, function () {
    var repository, service, conversation, index, run, claimed, first, second, notifications, _a;
    return __generator(this, function (_b) {
        switch (_b.label) {
            case 0:
                repository = new cloud_memory_js_1.InMemoryCloudRepository({
                    users: [{ id: "alice" }, { id: "admin", role: "admin" }],
                });
                service = (0, application_1.createCloudApplication)({ repository: repository });
                return [4 /*yield*/, service.createConversation({
                        actorId: "alice",
                        title: "Failures",
                        idempotencyKey: "failures",
                    })];
            case 1:
                conversation = _b.sent();
                index = 0;
                _b.label = 2;
            case 2:
                if (!(index < 2)) return [3 /*break*/, 8];
                return [4 /*yield*/, service.sendTurn({
                        actorId: "alice",
                        conversationId: conversation.id,
                        prompt: "PRIVATE ".concat(index),
                        mode: "search",
                        idempotencyKey: "fail-".concat(index),
                    })];
            case 3:
                run = (_b.sent()).run;
                return [4 /*yield*/, service.acceptQueued({ runId: run.id })];
            case 4:
                _b.sent();
                return [4 /*yield*/, service.claim({ runId: run.id, ownerId: "worker" })];
            case 5:
                claimed = (_b.sent());
                return [4 /*yield*/, service.finish({
                        runId: run.id,
                        ownerId: "worker",
                        epoch: claimed.epoch,
                        status: "failed",
                        error: "SECRET ERROR",
                    })];
            case 6:
                _b.sent();
                _b.label = 7;
            case 7:
                index++;
                return [3 /*break*/, 2];
            case 8: return [4 /*yield*/, service.adminListRuns({ actorId: "admin", status: "failed", limit: 1 })];
            case 9:
                first = _b.sent();
                return [4 /*yield*/, service.adminListRuns({
                        actorId: "admin",
                        status: "failed",
                        limit: 1,
                        cursor: first.nextCursor,
                    })];
            case 10:
                second = _b.sent();
                (0, test_1.expect)(first.items).toHaveLength(1);
                (0, test_1.expect)(second.items).toHaveLength(1);
                (0, test_1.expect)(second.items[0].id).not.toBe(first.items[0].id);
                (0, test_1.expect)(second.nextCursor).toBeNull();
                (0, test_1.expect)(JSON.stringify(first)).not.toContain("PRIVATE");
                return [4 /*yield*/, (0, test_1.expect)(service.adminListRuns({
                        actorId: "admin",
                        status: "queued",
                        limit: 1,
                        cursor: first.nextCursor,
                    })).rejects.toMatchObject({ code: "CLOUD_INVALID_INPUT" })];
            case 11:
                _b.sent();
                return [4 /*yield*/, service.listNotifications({ actorId: "alice", limit: 1 })];
            case 12:
                notifications = _b.sent();
                (0, test_1.expect)(notifications.items).toHaveLength(1);
                (0, test_1.expect)(notifications.unreadCount).toBe(2);
                return [4 /*yield*/, service.markNotificationRead({
                        actorId: "alice",
                        notificationId: notifications.items[0].id,
                        idempotencyKey: "read",
                    })];
            case 13:
                _b.sent();
                _a = test_1.expect;
                return [4 /*yield*/, service.listNotifications({ actorId: "alice", limit: 1 })];
            case 14:
                _a.apply(void 0, [(_b.sent()).unreadCount]).toBe(1);
                return [2 /*return*/];
        }
    });
}); });
(0, test_1.it)("enforces public input formats while allowing generated deliverables and accounts for cached model usage", function () { return __awaiter(void 0, void 0, void 0, function () {
    var _a, service, start, result, _b, call, settled, _c;
    return __generator(this, function (_d) {
        switch (_d.label) {
            case 0:
                _a = fixture(), service = _a.service, start = _a.start;
                return [4 /*yield*/, (0, test_1.expect)(service.createUpload({
                        actorId: "alice",
                        name: "page.html",
                        mediaType: "text/html",
                        byteSize: 10,
                        checksum: checksum,
                        idempotencyKey: "html",
                    })).rejects.toMatchObject({ code: "CLOUD_INVALID_INPUT" })];
            case 1:
                _d.sent();
                return [4 /*yield*/, (0, test_1.expect)(service.createUpload({
                        actorId: "alice",
                        name: "page.html",
                        mediaType: "text/plain",
                        byteSize: 10,
                        checksum: checksum,
                        idempotencyKey: "disguised",
                    })).rejects.toMatchObject({ code: "CLOUD_INVALID_INPUT" })];
            case 2:
                _d.sent();
                return [4 /*yield*/, start()];
            case 3:
                result = _d.sent();
                _b = test_1.expect;
                return [4 /*yield*/, service.createWorkerAsset(__assign(__assign({}, result.fence), { name: "slides.pptx", mediaType: "application/vnd.openxmlformats-officedocument.presentationml.presentation", byteSize: 10, checksum: checksum, idempotencyKey: "presentation" }))];
            case 4:
                _b.apply(void 0, [_d.sent()]).toMatchObject({ name: "slides.pptx", published: false });
                return [4 /*yield*/, service.reserveUsage(__assign(__assign({}, result.fence), { executionId: result.execution.id, callId: "priced", provider: "provider", model: "model", reservedTokens: 100, pricing: {
                            inputPerMillion: 2,
                            outputPerMillion: 4,
                            cacheReadPerMillion: 0.5,
                            cacheWritePerMillion: 3,
                        } }))];
            case 5:
                call = _d.sent();
                return [4 /*yield*/, service.startUsage(__assign(__assign({}, result.fence), { callId: call.id }))];
            case 6:
                _d.sent();
                return [4 /*yield*/, service.settleUsage(__assign(__assign({}, result.fence), { callId: call.id, inputTokens: 100, outputTokens: 50, cacheReadTokens: 200, cacheWriteTokens: 100 }))];
            case 7:
                settled = _d.sent();
                (0, test_1.expect)(settled.estimatedCost).toBeCloseTo((200 + 200 + 100 + 300) / 1000000);
                _c = test_1.expect;
                return [4 /*yield*/, service.getUsage({ actorId: "alice" })];
            case 8:
                _c.apply(void 0, [(_d.sent()).estimatedCost]).toBe(settled.estimatedCost);
                return [2 /*return*/];
        }
    });
}); });
(0, test_1.it)("replays completed uploads and notification reads with their original native timestamps", function () { return __awaiter(void 0, void 0, void 0, function () {
    var time, repository, service, asset, args, completed, _a, conversation, run, claim, notification, readArgs, firstRead, _b;
    return __generator(this, function (_c) {
        switch (_c.label) {
            case 0:
                time = new Date("2026-10-06T00:00:00Z");
                repository = new cloud_memory_js_1.InMemoryCloudRepository({ users: [{ id: "alice" }] });
                service = (0, application_1.createCloudApplication)({ repository: repository, now: function () { return time; } });
                return [4 /*yield*/, service.createUpload({
                        actorId: "alice",
                        name: "notes.txt",
                        mediaType: "text/plain",
                        byteSize: 10,
                        checksum: checksum,
                        idempotencyKey: "upload",
                    })];
            case 1:
                asset = _c.sent();
                args = {
                    actorId: "alice",
                    assetVersionId: asset.id,
                    byteSize: 10,
                    checksum: checksum,
                    idempotencyKey: "finish-upload",
                };
                return [4 /*yield*/, service.completeUpload(args)];
            case 2:
                completed = _c.sent();
                time = new Date(time.getTime() + 1000);
                _a = test_1.expect;
                return [4 /*yield*/, service.completeUpload(args)];
            case 3:
                _a.apply(void 0, [_c.sent()]).toEqual(completed);
                return [4 /*yield*/, service.createConversation({
                        actorId: "alice",
                        title: "Notify",
                        idempotencyKey: "notify",
                    })];
            case 4:
                conversation = _c.sent();
                return [4 /*yield*/, service.sendTurn({
                        actorId: "alice",
                        conversationId: conversation.id,
                        prompt: "Search",
                        mode: "search",
                        idempotencyKey: "search",
                    })];
            case 5:
                run = (_c.sent()).run;
                return [4 /*yield*/, service.acceptQueued({ runId: run.id })];
            case 6:
                _c.sent();
                return [4 /*yield*/, service.claim({ runId: run.id, ownerId: "worker" })];
            case 7:
                claim = (_c.sent());
                return [4 /*yield*/, service.finish({
                        runId: run.id,
                        ownerId: "worker",
                        epoch: claim.epoch,
                        status: "failed",
                        error: "unavailable",
                    })];
            case 8:
                _c.sent();
                return [4 /*yield*/, service.listNotifications({ actorId: "alice" })];
            case 9:
                notification = (_c.sent()).items[0];
                readArgs = {
                    actorId: "alice",
                    notificationId: notification.id,
                    idempotencyKey: "read-once",
                };
                return [4 /*yield*/, service.markNotificationRead(readArgs)];
            case 10:
                firstRead = _c.sent();
                time = new Date(time.getTime() + 1000);
                _b = test_1.expect;
                return [4 /*yield*/, service.markNotificationRead(readArgs)];
            case 11:
                _b.apply(void 0, [_c.sent()]).toEqual(firstRead);
                return [2 /*return*/];
        }
    });
}); });
(0, test_1.it)("restricts administration to stored identity roles and excludes private content from diagnostics", function () { return __awaiter(void 0, void 0, void 0, function () {
    var repository, service, conversation, run, list, detail;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                repository = new cloud_memory_js_1.InMemoryCloudRepository({
                    users: [{ id: "alice" }, { id: "admin", role: "admin" }],
                });
                service = (0, application_1.createCloudApplication)({ repository: repository });
                return [4 /*yield*/, service.createConversation({
                        actorId: "alice",
                        title: "PRIVATE TITLE",
                        idempotencyKey: "admin-c",
                    })];
            case 1:
                conversation = _a.sent();
                return [4 /*yield*/, service.sendTurn({
                        actorId: "alice",
                        conversationId: conversation.id,
                        prompt: "PRIVATE PROMPT",
                        mode: "search",
                        idempotencyKey: "admin-turn",
                    })];
            case 2:
                run = (_a.sent()).run;
                return [4 /*yield*/, (0, test_1.expect)(service.adminListRuns({ actorId: "alice" })).rejects.toMatchObject({
                        code: "CLOUD_ACCESS_DENIED",
                    })];
            case 3:
                _a.sent();
                return [4 /*yield*/, service.adminListRuns({ actorId: "admin" })];
            case 4:
                list = _a.sent();
                (0, test_1.expect)(list.items).toHaveLength(1);
                return [4 /*yield*/, service.adminInspectRun({ actorId: "admin", runId: run.id })];
            case 5:
                detail = _a.sent();
                (0, test_1.expect)(JSON.stringify(detail)).not.toContain("PRIVATE");
                (0, test_1.expect)(detail.run.status).toBe("queued");
                return [4 /*yield*/, (0, test_1.expect)(service.getRunSnapshot({ actorId: "admin", runId: run.id })).rejects.toMatchObject({
                        code: "CLOUD_ACCESS_DENIED",
                    })];
            case 6:
                _a.sent();
                return [2 /*return*/];
        }
    });
}); });
(0, test_1.it)("releases abandoned uploads after expiry and preserves committed input files", function () { return __awaiter(void 0, void 0, void 0, function () {
    var time, repository, service, input, orphan, kept, _a, _b, _c, _d;
    return __generator(this, function (_e) {
        switch (_e.label) {
            case 0:
                time = new Date("2026-10-06T00:00:00Z");
                repository = new cloud_memory_js_1.InMemoryCloudRepository({ users: [{ id: "alice" }] });
                service = (0, application_1.createCloudApplication)({ repository: repository, now: function () { return time; } });
                input = {
                    actorId: "alice",
                    name: "notes.txt",
                    mediaType: "text/plain",
                    byteSize: 10,
                    checksum: checksum,
                    idempotencyKey: "orphan",
                };
                return [4 /*yield*/, service.createUpload(input)];
            case 1:
                orphan = _e.sent();
                return [4 /*yield*/, service.createUpload(__assign(__assign({}, input), { idempotencyKey: "kept" }))];
            case 2:
                kept = _e.sent();
                return [4 /*yield*/, service.completeUpload({
                        actorId: "alice",
                        assetVersionId: kept.id,
                        byteSize: 10,
                        checksum: checksum,
                        idempotencyKey: "complete",
                    })];
            case 3:
                _e.sent();
                time = new Date(time.getTime() + 16 * 60 * 1000);
                _a = test_1.expect;
                return [4 /*yield*/, service.listExpiredUploads({ limit: 10 })];
            case 4:
                _a.apply(void 0, [(_e.sent()).map(function (a) { return a.id; })]).toEqual([orphan.id]);
                return [4 /*yield*/, (0, test_1.expect)(service.completeUpload({
                        actorId: "alice",
                        assetVersionId: orphan.id,
                        byteSize: 10,
                        checksum: checksum,
                        idempotencyKey: "late",
                    })).rejects.toMatchObject({ code: "CLOUD_INVALID_INPUT" })];
            case 5:
                _e.sent();
                _b = test_1.expect;
                return [4 /*yield*/, service.claimExpiredUpload({ assetVersionId: kept.id })];
            case 6:
                _b.apply(void 0, [_e.sent()]).toBeNull();
                return [4 /*yield*/, service.claimExpiredUpload({ assetVersionId: orphan.id })];
            case 7:
                _e.sent();
                return [4 /*yield*/, service.removeExpiredUpload({ assetVersionId: orphan.id })];
            case 8:
                _e.sent();
                _c = test_1.expect;
                return [4 /*yield*/, service.getUsage({ actorId: "alice" })];
            case 9:
                _c.apply(void 0, [(_e.sent()).storageBytes]).toBe(10);
                _d = test_1.expect;
                return [4 /*yield*/, service.listAssets({ actorId: "alice" })];
            case 10:
                _d.apply(void 0, [(_e.sent()).items.map(function (a) { return a.id; })]).toEqual([
                    kept.id,
                ]);
                return [2 /*return*/];
        }
    });
}); });
(0, test_1.it)("filters usage by parent Runs and shares a Task budget across project collaborators", function () { return __awaiter(void 0, void 0, void 0, function () {
    var now, repository, service;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                now = new Date("2026-10-06T00:00:00Z");
                repository = new cloud_memory_js_1.InMemoryCloudRepository({
                    users: [{ id: "alice" }, { id: "bob" }],
                    projects: [
                        {
                            id: "shared-project",
                            createdByUserId: "alice",
                            personalOwnerId: "alice",
                            organizationId: null,
                            title: "Shared",
                            description: null,
                            stage: "draft",
                            archived: false,
                            deadline: null,
                            createdAt: now,
                            updatedAt: now,
                        },
                    ],
                    projectMembers: [
                        { projectId: "shared-project", userId: "bob", role: "editor", status: "active" },
                    ],
                });
                service = (0, application_1.createCloudApplication)({ repository: repository, limits: { taskCalls: 1 } });
                return [4 /*yield*/, (0, cloud_budget_js_1.exerciseSharedTaskBudget)(service, repository, "shared-project")];
            case 1:
                _a.sent();
                return [2 /*return*/];
        }
    });
}); });
(0, test_1.it)("preserves immutable round budgets, dispatch uniqueness and expiring execution grants", function () { return __awaiter(void 0, void 0, void 0, function () {
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0: return [4 /*yield*/, (0, cloud_rounds_js_1.exerciseRoundAndLease)(new cloud_memory_js_1.InMemoryCloudRepository({ users: [{ id: "alice" }] }))];
            case 1:
                _a.sent();
                return [2 /*return*/];
        }
    });
}); });
(0, test_1.it)("compares the current goal on acceptance and blocks cancelled publication", function () { return __awaiter(void 0, void 0, void 0, function () {
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0: return [4 /*yield*/, (0, cloud_rounds_js_1.exercisePublicationCAS)(new cloud_memory_js_1.InMemoryCloudRepository({ users: [{ id: "alice" }] }))];
            case 1:
                _a.sent();
                return [2 /*return*/];
        }
    });
}); });
(0, test_1.it)("projects complete messages across bounded snapshots and older history", function () { return __awaiter(void 0, void 0, void 0, function () {
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0: return [4 /*yield*/, (0, cloud_projection_js_1.exerciseMessageProjection)(new cloud_memory_js_1.InMemoryCloudRepository({ users: [{ id: "alice" }] }))];
            case 1:
                _a.sent();
                return [2 /*return*/];
        }
    });
}); });
(0, test_1.it)("serializes competing task runs and claim versus queued cancellation", function () { return __awaiter(void 0, void 0, void 0, function () {
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0: return [4 /*yield*/, (0, cloud_projection_js_1.exerciseActiveRunRace)(new cloud_memory_js_1.InMemoryCloudRepository({ users: [{ id: "alice" }] }))];
            case 1:
                _a.sent();
                return [2 /*return*/];
        }
    });
}); });
(0, test_1.it)("resets account admission at the UTC month boundary while preserving round usage", function () { return __awaiter(void 0, void 0, void 0, function () {
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0: return [4 /*yield*/, (0, cloud_usage_limits_js_1.exerciseUTCMonthBudget)(new cloud_memory_js_1.InMemoryCloudRepository({ users: [{ id: "alice" }] }))];
            case 1:
                _a.sent();
                return [2 /*return*/];
        }
    });
}); });
(0, test_1.it)("enforces six calls and sixty seconds for each Search Run", function () { return __awaiter(void 0, void 0, void 0, function () {
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0: return [4 /*yield*/, (0, cloud_usage_limits_js_1.exerciseSearchBudget)(new cloud_memory_js_1.InMemoryCloudRepository({ users: [{ id: "alice" }] }))];
            case 1:
                _a.sent();
                return [2 /*return*/];
        }
    });
}); });
(0, test_1.it)("renews Computer duration per Run while retaining the shared round call budget", function () { return __awaiter(void 0, void 0, void 0, function () {
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0: return [4 /*yield*/, (0, cloud_usage_limits_js_1.exerciseComputerRunDuration)(new cloud_memory_js_1.InMemoryCloudRepository({ users: [{ id: "alice" }] }))];
            case 1:
                _a.sent();
                return [2 /*return*/];
        }
    });
}); });
//# sourceMappingURL=cloud.test.js.map