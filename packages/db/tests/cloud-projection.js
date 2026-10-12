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
exports.exerciseMessageProjection = exerciseMessageProjection;
exports.exerciseActiveRunRace = exerciseActiveRunRace;
var test_1 = require("vite-plus/test");
var application_1 = require("@voidmix/application");
function exerciseMessageProjection(repository) {
    return __awaiter(this, void 0, void 0, function () {
        var service, conversation, run, claimed, fence, i, snapshot, older, tail, _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    service = (0, application_1.createCloudApplication)({ repository: repository });
                    return [4 /*yield*/, service.createConversation({
                            actorId: "alice",
                            title: "History",
                            idempotencyKey: "history-c",
                        })];
                case 1:
                    conversation = _b.sent();
                    return [4 /*yield*/, service.sendTurn({
                            actorId: "alice",
                            conversationId: conversation.id,
                            prompt: "Research",
                            mode: "search",
                            idempotencyKey: "history-turn",
                        })];
                case 2:
                    run = (_b.sent()).run;
                    return [4 /*yield*/, service.acceptQueued({ runId: run.id })];
                case 3:
                    _b.sent();
                    return [4 /*yield*/, service.claim({ runId: run.id, ownerId: "worker" })];
                case 4:
                    claimed = (_b.sent());
                    fence = { runId: run.id, ownerId: "worker", epoch: claimed.epoch };
                    i = 0;
                    _b.label = 5;
                case 5:
                    if (!(i < 205)) return [3 /*break*/, 8];
                    return [4 /*yield*/, service.appendEvent(__assign(__assign({}, fence), { eventId: "delta-".concat(i), type: "message.delta", payload: { messageId: "stable-message", text: "x" } }))];
                case 6:
                    _b.sent();
                    _b.label = 7;
                case 7:
                    i++;
                    return [3 /*break*/, 5];
                case 8: return [4 /*yield*/, service.appendEvent(__assign(__assign({}, fence), { eventId: "complete", type: "message.completed", payload: { messageId: "stable-message", text: "Authoritative complete message" } }))];
                case 9:
                    _b.sent();
                    return [4 /*yield*/, service.getRunSnapshot({ actorId: "alice", runId: run.id })];
                case 10:
                    snapshot = _b.sent();
                    (0, test_1.expect)(snapshot.events).toHaveLength(200);
                    (0, test_1.expect)(snapshot.historyTruncated).toBe(true);
                    (0, test_1.expect)(snapshot.cursor).toBe(snapshot.run.lastSequence);
                    (0, test_1.expect)(snapshot.messages).toMatchObject([
                        { messageId: "stable-message", text: "Authoritative complete message", completed: true },
                    ]);
                    (0, test_1.expect)(snapshot.messages[0].createdAt).toBeInstanceOf(Date);
                    return [4 /*yield*/, service.listEvents({
                            actorId: "alice",
                            runId: run.id,
                            afterSequence: 0,
                            beforeSequence: snapshot.historyCursor,
                            limit: 100,
                        })];
                case 11:
                    older = _b.sent();
                    (0, test_1.expect)(older.items.map(function (event) { return event.sequence; })).toEqual([1, 2, 3, 4, 5, 6, 7]);
                    (0, test_1.expect)(older.hasMore).toBe(false);
                    return [4 /*yield*/, service.appendEvent(__assign(__assign({}, fence), { eventId: "late-delta", type: "message.delta", payload: { messageId: "stable-message", text: "must not overwrite complete" } }))];
                case 12:
                    _b.sent();
                    return [4 /*yield*/, service.listEvents({
                            actorId: "alice",
                            runId: run.id,
                            afterSequence: snapshot.cursor,
                            limit: 100,
                        })];
                case 13:
                    tail = _b.sent();
                    (0, test_1.expect)(tail.items.map(function (event) { return event.sequence; })).toEqual([snapshot.cursor + 1]);
                    _a = test_1.expect;
                    return [4 /*yield*/, service.getRunSnapshot({ actorId: "alice", runId: run.id })];
                case 14:
                    _a.apply(void 0, [(_b.sent()).messages[0].text]).toBe("Authoritative complete message");
                    return [2 /*return*/];
            }
        });
    });
}
function exerciseActiveRunRace(repository) {
    return __awaiter(this, void 0, void 0, function () {
        var service, conversation, task, input, attempts, active, final, _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    service = (0, application_1.createCloudApplication)({ repository: repository });
                    return [4 /*yield*/, service.createConversation({
                            actorId: "alice",
                            title: "Race",
                            idempotencyKey: "race-c",
                        })];
                case 1:
                    conversation = _b.sent();
                    return [4 /*yield*/, service.createTask({
                            actorId: "alice",
                            title: "Race",
                            goal: "One active",
                            idempotencyKey: "race-task",
                        })];
                case 2:
                    task = _b.sent();
                    input = {
                        actorId: "alice",
                        conversationId: conversation.id,
                        taskId: task.id,
                        roundId: task.currentRoundId,
                        goalVersion: task.goalVersion,
                        prompt: "Go",
                        mode: "computer",
                    };
                    return [4 /*yield*/, Promise.allSettled([
                            service.sendTurn(__assign(__assign({}, input), { idempotencyKey: "race-one" })),
                            service.sendTurn(__assign(__assign({}, input), { idempotencyKey: "race-two" })),
                        ])];
                case 3:
                    attempts = _b.sent();
                    (0, test_1.expect)(attempts.filter(function (item) { return item.status === "fulfilled"; })).toHaveLength(1);
                    (0, test_1.expect)(attempts.find(function (item) { return item.status === "rejected"; })).toMatchObject({
                        reason: { code: "CLOUD_RUN_ACTIVE" },
                    });
                    return [4 /*yield*/, service.getTask({ actorId: "alice", taskId: task.id })];
                case 4:
                    active = (_b.sent()).runs[0];
                    return [4 /*yield*/, service.acceptQueued({ runId: active.id })];
                case 5:
                    _b.sent();
                    return [4 /*yield*/, Promise.all([
                            service.createCommand({
                                actorId: "alice",
                                runId: active.id,
                                type: "cancel",
                                idempotencyKey: "race-cancel",
                            }),
                            service.claim({ runId: active.id, ownerId: "race-host" }),
                        ])];
                case 6:
                    _b.sent();
                    return [4 /*yield*/, service.getRunSnapshot({ actorId: "alice", runId: active.id })];
                case 7:
                    final = (_b.sent()).run;
                    (0, test_1.expect)(final.cancelRequested).toBe(true);
                    (0, test_1.expect)(["cancelled", "running"]).toContain(final.status);
                    if (!(final.status === "running")) return [3 /*break*/, 9];
                    return [4 /*yield*/, service.finish({
                            runId: final.id,
                            ownerId: final.ownerId,
                            epoch: final.epoch,
                            status: "cancelled",
                        })];
                case 8:
                    _b.sent();
                    _b.label = 9;
                case 9:
                    _a = test_1.expect;
                    return [4 /*yield*/, service.getRunSnapshot({ actorId: "alice", runId: active.id })];
                case 10:
                    _a.apply(void 0, [(_b.sent()).run.status]).toBe("cancelled");
                    return [2 /*return*/];
            }
        });
    });
}
//# sourceMappingURL=cloud-projection.js.map