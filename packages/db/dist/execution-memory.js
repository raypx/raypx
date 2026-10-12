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
exports.InMemoryExecutionRepository = void 0;
var empty = function () { return ({
    devices: new Map(),
    bindings: new Map(),
    runs: new Map(),
    events: new Map(),
    commands: new Map(),
    artifacts: new Map(),
    outbox: new Map(),
}); };
var copy = function (value) { return structuredClone(value); };
var bindingKey = function (deviceId, projectId) { return JSON.stringify([deviceId, projectId]); };
function transaction(state) {
    var _this = this;
    return {
        getDevice: function (id) { return __awaiter(_this, void 0, void 0, function () { var _a; return __generator(this, function (_b) {
            return [2 /*return*/, copy((_a = state.devices.get(id)) !== null && _a !== void 0 ? _a : null)];
        }); }); },
        findDeviceByHash: function (hash) { return __awaiter(_this, void 0, void 0, function () { var _a; return __generator(this, function (_b) {
            return [2 /*return*/, copy((_a = __spreadArray([], state.devices.values(), true).find(function (device) { return device.credentialHash === hash; })) !== null && _a !== void 0 ? _a : null)];
        }); }); },
        listDevices: function (ownerId) { return __awaiter(_this, void 0, void 0, function () { return __generator(this, function (_a) {
            return [2 /*return*/, copy(__spreadArray([], state.devices.values(), true).filter(function (device) { return device.ownerUserId === ownerId; }))];
        }); }); },
        saveDevice: function (device) { return __awaiter(_this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                state.devices.set(device.id, copy(device));
                return [2 /*return*/];
            });
        }); },
        getBinding: function (deviceId, projectId) { return __awaiter(_this, void 0, void 0, function () { var _a; return __generator(this, function (_b) {
            return [2 /*return*/, copy((_a = state.bindings.get(bindingKey(deviceId, projectId))) !== null && _a !== void 0 ? _a : null)];
        }); }); },
        listBindings: function (deviceId) { return __awaiter(_this, void 0, void 0, function () { return __generator(this, function (_a) {
            return [2 /*return*/, copy(__spreadArray([], state.bindings.values(), true).filter(function (binding) { return binding.deviceId === deviceId; }))];
        }); }); },
        saveBinding: function (binding) { return __awaiter(_this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                state.bindings.set(bindingKey(binding.deviceId, binding.projectId), copy(binding));
                return [2 /*return*/];
            });
        }); },
        getRun: function (id) { return __awaiter(_this, void 0, void 0, function () { var _a; return __generator(this, function (_b) {
            return [2 /*return*/, copy((_a = state.runs.get(id)) !== null && _a !== void 0 ? _a : null)];
        }); }); },
        listRuns: function (projectId, taskId) { return __awaiter(_this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                return [2 /*return*/, copy(__spreadArray([], state.runs.values(), true).filter(function (run) { return run.projectId === projectId && (!taskId || run.taskId === taskId); }))];
            });
        }); },
        listDeviceRuns: function (deviceId) { return __awaiter(_this, void 0, void 0, function () { return __generator(this, function (_a) {
            return [2 /*return*/, copy(__spreadArray([], state.runs.values(), true).filter(function (run) { return run.targetDeviceId === deviceId; }))];
        }); }); },
        findRunIntent: function (actorId, key) { return __awaiter(_this, void 0, void 0, function () {
            var _a;
            return __generator(this, function (_b) {
                return [2 /*return*/, copy((_a = __spreadArray([], state.runs.values(), true).find(function (run) { return run.requestedByUserId === actorId && run.idempotencyKey === key; })) !== null && _a !== void 0 ? _a : null)];
            });
        }); },
        saveRun: function (run) { return __awaiter(_this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                state.runs.set(run.id, copy(run));
                return [2 /*return*/];
            });
        }); },
        queueRun: function (run) { return __awaiter(_this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                state.runs.set(run.id, copy(run));
                state.outbox.set("execution-".concat(run.id), {
                    id: "execution-".concat(run.id),
                    type: "agent.run.queued",
                    payload: { runId: run.id, projectId: run.projectId, targetDeviceId: run.targetDeviceId },
                });
                return [2 /*return*/];
            });
        }); },
        listEvents: function (runId, afterSeq, limit) { return __awaiter(_this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                return [2 /*return*/, copy(__spreadArray([], state.events.values(), true).filter(function (event) { return event.runId === runId && event.seq > afterSeq; })
                        .sort(function (a, b) { return a.seq - b.seq; })
                        .slice(0, limit))];
            });
        }); },
        getEvent: function (runId, seq) { return __awaiter(_this, void 0, void 0, function () { var _a; return __generator(this, function (_b) {
            return [2 /*return*/, copy((_a = state.events.get("".concat(runId, ":").concat(seq))) !== null && _a !== void 0 ? _a : null)];
        }); }); },
        appendEvent: function (event) { return __awaiter(_this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                state.events.set("".concat(event.runId, ":").concat(event.seq), copy(event));
                return [2 /*return*/];
            });
        }); },
        listCommands: function (runId) { return __awaiter(_this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                return [2 /*return*/, copy(__spreadArray([], state.commands.values(), true).filter(function (command) { return command.runId === runId; })
                        .sort(function (a, b) { return a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id); }))];
            });
        }); },
        saveCommand: function (command) { return __awaiter(_this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                state.commands.set(command.id, copy(command));
                return [2 /*return*/];
            });
        }); },
        listArtifacts: function (runId) { return __awaiter(_this, void 0, void 0, function () { return __generator(this, function (_a) {
            return [2 /*return*/, copy(__spreadArray([], state.artifacts.values(), true).filter(function (artifact) { return artifact.runId === runId; }))];
        }); }); },
        saveArtifact: function (artifact) { return __awaiter(_this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                state.artifacts.set(artifact.id, copy(artifact));
                return [2 /*return*/];
            });
        }); },
    };
}
/** Atomic copy-on-commit transactions preserve rollback and prevent mutable read leaks. */
var InMemoryExecutionRepository = /** @class */ (function () {
    function InMemoryExecutionRepository() {
        this.state = empty();
        this.tail = Promise.resolve();
    }
    InMemoryExecutionRepository.prototype.read = function (operation) {
        return operation(transaction(copy(this.state)));
    };
    InMemoryExecutionRepository.prototype.transaction = function (operation) {
        return __awaiter(this, void 0, void 0, function () {
            var predecessor, release, draft, result;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        predecessor = this.tail;
                        this.tail = new Promise(function (resolve) {
                            release = resolve;
                        });
                        return [4 /*yield*/, predecessor];
                    case 1:
                        _a.sent();
                        _a.label = 2;
                    case 2:
                        _a.trys.push([2, , 4, 5]);
                        draft = copy(this.state);
                        return [4 /*yield*/, operation(transaction(draft))];
                    case 3:
                        result = _a.sent();
                        this.state = draft;
                        return [2 /*return*/, copy(result)];
                    case 4:
                        release();
                        return [7 /*endfinally*/];
                    case 5: return [2 /*return*/];
                }
            });
        });
    };
    InMemoryExecutionRepository.prototype.outboxItems = function () {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                return [2 /*return*/, copy(__spreadArray([], this.state.outbox.values(), true))];
            });
        });
    };
    return InMemoryExecutionRepository;
}());
exports.InMemoryExecutionRepository = InMemoryExecutionRepository;
//# sourceMappingURL=execution-memory.js.map