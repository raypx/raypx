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
exports.InMemoryUserRepository = void 0;
var InMemoryUserRepository = /** @class */ (function () {
    function InMemoryUserRepository(seed) {
        if (seed === void 0) { seed = []; }
        this.administrationQueue = Promise.resolve();
        this.users = new Map();
        this.auditEvents = [];
        for (var _i = 0, seed_1 = seed; _i < seed_1.length; _i++) {
            var user = seed_1[_i];
            this.users.set(user.id, __assign({}, user));
        }
    }
    InMemoryUserRepository.prototype.runAdministration = function (operation) {
        return __awaiter(this, void 0, void 0, function () {
            var previous, release, tx, result, _i, _a, _b, id, user;
            var _c;
            return __generator(this, function (_d) {
                switch (_d.label) {
                    case 0:
                        previous = this.administrationQueue;
                        this.administrationQueue = new Promise(function (resolve) {
                            release = resolve;
                        });
                        return [4 /*yield*/, previous];
                    case 1:
                        _d.sent();
                        tx = Object.assign(Object.create(Object.getPrototypeOf(this)), this, {
                            users: new Map(__spreadArray([], this.users, true).map(function (_a) {
                                var id = _a[0], user = _a[1];
                                return [id, __assign({}, user)];
                            })),
                            auditEvents: [],
                        });
                        _d.label = 2;
                    case 2:
                        _d.trys.push([2, , 4, 5]);
                        return [4 /*yield*/, operation(tx)];
                    case 3:
                        result = _d.sent();
                        this.users.clear();
                        for (_i = 0, _a = tx.users; _i < _a.length; _i++) {
                            _b = _a[_i], id = _b[0], user = _b[1];
                            this.users.set(id, __assign({}, user));
                        }
                        (_c = this.auditEvents).push.apply(_c, tx.auditEvents.map(function (event) { return (__assign(__assign({}, event), { metadata: __assign({}, event.metadata) })); }));
                        return [2 /*return*/, result];
                    case 4:
                        release();
                        return [7 /*endfinally*/];
                    case 5: return [2 /*return*/];
                }
            });
        });
    };
    InMemoryUserRepository.prototype.list = function (query) {
        return __awaiter(this, void 0, void 0, function () {
            var normalizedQuery, offset, matches, items, nextOffset;
            var _a;
            return __generator(this, function (_b) {
                normalizedQuery = (_a = query.query) === null || _a === void 0 ? void 0 : _a.toLowerCase();
                offset = query.cursor ? Number.parseInt(query.cursor, 10) || 0 : 0;
                matches = __spreadArray([], this.users.values(), true).filter(function (user) {
                    return (!query.role || user.role === query.role) &&
                        (!query.status || user.status === query.status);
                })
                    .filter(function (user) {
                    return !normalizedQuery ||
                        user.email.toLowerCase().includes(normalizedQuery) ||
                        user.displayName.toLowerCase().includes(normalizedQuery);
                })
                    .sort(function (left, right) {
                    return right.createdAt.getTime() - left.createdAt.getTime() || right.id.localeCompare(left.id);
                });
                items = matches.slice(offset, offset + query.limit);
                nextOffset = offset + items.length;
                return [2 /*return*/, {
                        items: items.map(function (user) { return (__assign({}, user)); }),
                        total: matches.length,
                        nextCursor: nextOffset < matches.length ? String(nextOffset) : null,
                    }];
            });
        });
    };
    InMemoryUserRepository.prototype.getById = function (id) {
        return __awaiter(this, void 0, void 0, function () {
            var user;
            return __generator(this, function (_a) {
                user = this.users.get(id);
                return [2 /*return*/, user ? __assign({}, user) : null];
            });
        });
    };
    InMemoryUserRepository.prototype.getByEmail = function (email) {
        return __awaiter(this, void 0, void 0, function () {
            var normalized, user;
            return __generator(this, function (_a) {
                normalized = email.toLowerCase();
                user = __spreadArray([], this.users.values(), true).find(function (candidate) { return candidate.email.toLowerCase() === normalized; });
                return [2 /*return*/, user ? __assign({}, user) : null];
            });
        });
    };
    InMemoryUserRepository.prototype.countActiveAdministrators = function () {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                return [2 /*return*/, __spreadArray([], this.users.values(), true).filter(function (user) { return user.status === "active" && (user.role === "admin" || user.role === "owner"); }).length];
            });
        });
    };
    InMemoryUserRepository.prototype.save = function (user) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                this.users.set(user.id, __assign(__assign({}, user), { email: user.email.toLowerCase() }));
                return [2 /*return*/];
            });
        });
    };
    InMemoryUserRepository.prototype.updateStatus = function (id, status) {
        return __awaiter(this, void 0, void 0, function () {
            var existing, updated;
            return __generator(this, function (_a) {
                existing = this.users.get(id);
                if (!existing)
                    throw new Error("Cannot update missing user ".concat(id));
                updated = __assign(__assign({}, existing), { status: status });
                this.users.set(id, updated);
                return [2 /*return*/, __assign({}, updated)];
            });
        });
    };
    InMemoryUserRepository.prototype.appendAudit = function (event) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                this.auditEvents.push(__assign(__assign({}, event), { metadata: __assign({}, event.metadata) }));
                return [2 /*return*/];
            });
        });
    };
    InMemoryUserRepository.prototype.listAudit = function (limit) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                return [2 /*return*/, __spreadArray([], this.auditEvents, true).sort(function (left, right) {
                        return right.occurredAt.getTime() - left.occurredAt.getTime() || right.id.localeCompare(left.id);
                    })
                        .slice(0, limit)
                        .map(function (event) { return (__assign(__assign({}, event), { metadata: __assign({}, event.metadata) })); })];
            });
        });
    };
    return InMemoryUserRepository;
}());
exports.InMemoryUserRepository = InMemoryUserRepository;
//# sourceMappingURL=memory.js.map