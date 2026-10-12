"use strict";
var __makeTemplateObject = (this && this.__makeTemplateObject) || function (cooked, raw) {
    if (Object.defineProperty) { Object.defineProperty(cooked, "raw", { value: raw }); } else { cooked.raw = raw; }
    return cooked;
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
exports.acquireCloudWorkerLease = acquireCloudWorkerLease;
var postgres_1 = require("postgres");
/** Optional duplicate-identity guard. Execution ownership is fenced by each Run's expiring lease. */
function acquireCloudWorkerLease(databaseUrl, ownerId, onLost) {
    return __awaiter(this, void 0, void 0, function () {
        var client, session, closing, lost, lock, connection, originalPid, heartbeat;
        var _a, _b;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    client = (0, postgres_1.default)(databaseUrl, { max: 1, idle_timeout: 0, max_lifetime: 0 });
                    return [4 /*yield*/, client.reserve()];
                case 1:
                    session = _c.sent();
                    closing = false;
                    lost = false;
                    return [4 /*yield*/, session(templateObject_1 || (templateObject_1 = __makeTemplateObject(["select pg_try_advisory_lock(hashtextextended(", ",0)) as locked"], ["select pg_try_advisory_lock(hashtextextended(", ",0)) as locked"])), "voidmix:cloud-worker:identity:".concat(ownerId))];
                case 2:
                    lock = _c.sent();
                    if (!!((_a = lock[0]) === null || _a === void 0 ? void 0 : _a.locked)) return [3 /*break*/, 4];
                    session.release();
                    return [4 /*yield*/, client.end()];
                case 3:
                    _c.sent();
                    throw new Error("Cloud worker identity is already owned; ".concat(ownerId, " cannot start."));
                case 4: return [4 /*yield*/, session(templateObject_2 || (templateObject_2 = __makeTemplateObject(["select pg_backend_pid() as pid"], ["select pg_backend_pid() as pid"])))];
                case 5:
                    connection = _c.sent();
                    originalPid = (_b = connection[0]) === null || _b === void 0 ? void 0 : _b.pid;
                    heartbeat = setInterval(function () {
                        void session(templateObject_3 || (templateObject_3 = __makeTemplateObject(["select pg_backend_pid() as pid"], ["select pg_backend_pid() as pid"]))).then(function (rows) {
                            var _a;
                            if (((_a = rows[0]) === null || _a === void 0 ? void 0 : _a.pid) !== originalPid)
                                throw new Error("Cloud worker lease connection changed.");
                        })
                            .catch(function (error) {
                            if (!closing && !lost) {
                                lost = true;
                                onLost === null || onLost === void 0 ? void 0 : onLost(error instanceof Error ? error : new Error("Cloud worker lease was lost."));
                            }
                        });
                    }, 5000);
                    heartbeat.unref();
                    return [2 /*return*/, {
                            close: function () {
                                return __awaiter(this, void 0, void 0, function () {
                                    return __generator(this, function (_a) {
                                        switch (_a.label) {
                                            case 0:
                                                closing = true;
                                                clearInterval(heartbeat);
                                                _a.label = 1;
                                            case 1:
                                                _a.trys.push([1, , 4, 6]);
                                                if (!!lost) return [3 /*break*/, 3];
                                                return [4 /*yield*/, session(templateObject_4 || (templateObject_4 = __makeTemplateObject(["select pg_advisory_unlock(hashtextextended(", ",0))"], ["select pg_advisory_unlock(hashtextextended(", ",0))"])), "voidmix:cloud-worker:identity:".concat(ownerId))];
                                            case 2:
                                                _a.sent();
                                                _a.label = 3;
                                            case 3: return [3 /*break*/, 6];
                                            case 4:
                                                session.release();
                                                return [4 /*yield*/, client.end()];
                                            case 5:
                                                _a.sent();
                                                return [7 /*endfinally*/];
                                            case 6: return [2 /*return*/];
                                        }
                                    });
                                });
                            },
                        }];
            }
        });
    });
}
var templateObject_1, templateObject_2, templateObject_3, templateObject_4;
//# sourceMappingURL=cloud-worker-lease.js.map