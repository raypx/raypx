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
var test_1 = require("vite-plus/test");
var postgres_js_1 = require("./postgres.js");
var schema_js_1 = require("./schema.js");
var FakePostgresDatabase = /** @class */ (function () {
    function FakePostgresDatabase(options) {
        if (options === void 0) { options = {}; }
        this.settings = new Map();
        this.secrets = new Map();
        this.audits = [];
        this.tables = new Map();
        for (var _i = 0, _a = [
            [schema_js_1.systemSettings, this.settings, options.settings, options.settingDeletes],
            [schema_js_1.systemSecrets, this.secrets, options.secrets, options.secretDeletes],
        ]; _i < _a.length; _i++) {
            var _b = _a[_i], table = _b[0], rows = _b[1], values = _b[2], deletes = _b[3];
            this.tables.set(table, { rows: rows, deletes: __spreadArray([], (deletes !== null && deletes !== void 0 ? deletes : []), true) });
            for (var _c = 0, _d = Object.entries(values !== null && values !== void 0 ? values : {}); _c < _d.length; _c++) {
                var _e = _d[_c], key = _e[0], value = _e[1];
                rows.set(key, {
                    key: key,
                    value: value,
                    updatedAt: new Date("2026-08-24T00:00:00.000Z"),
                    updatedBy: null,
                });
            }
        }
    }
    FakePostgresDatabase.prototype.transaction = function (run) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                return [2 /*return*/, run(this)];
            });
        });
    };
    FakePostgresDatabase.prototype.select = function () {
        var _this = this;
        return {
            from: function (table) { return ({
                where: function () {
                    var rows = __spreadArray([], _this.tables.get(table).rows.values(), true);
                    return Object.assign(Promise.resolve(rows), {
                        limit: function (limit) { return __awaiter(_this, void 0, void 0, function () { return __generator(this, function (_a) {
                            return [2 /*return*/, rows.slice(0, limit)];
                        }); }); },
                    });
                },
            }); },
        };
    };
    FakePostgresDatabase.prototype.delete = function (table) {
        var _this = this;
        return {
            where: function () { return __awaiter(_this, void 0, void 0, function () {
                var _a, rows, deletes, key;
                return __generator(this, function (_b) {
                    _a = this.tables.get(table), rows = _a.rows, deletes = _a.deletes;
                    key = deletes.shift();
                    if (key)
                        rows.delete(key);
                    return [2 /*return*/];
                });
            }); },
        };
    };
    FakePostgresDatabase.prototype.insert = function (table) {
        var _this = this;
        return {
            values: function (row) {
                if (table === schema_js_1.auditEvents) {
                    _this.audits.push(__assign({}, row));
                    return Promise.resolve();
                }
                return {
                    onConflictDoUpdate: function () { return __awaiter(_this, void 0, void 0, function () {
                        return __generator(this, function (_a) {
                            this.tables.get(table).rows.set(row.key, __assign({}, row));
                            return [2 /*return*/];
                        });
                    }); },
                };
            },
        };
    };
    return FakePostgresDatabase;
}());
var fallback = {
    enabled: { value: true, source: "default" },
    from: { value: "environment@example.com", source: "environment" },
    fromName: { value: "Voidmix", source: "default" },
    templatesBaseUrl: { value: null, source: "missing" },
    resendApiKey: { value: "environment-key", source: "environment" },
};
function repository(database) {
    return new postgres_js_1.PostgresSystemSettingsRepository(database);
}
function audit(id, targetId) {
    return {
        id: id,
        actorId: "owner-1",
        action: "system.settings.updated",
        targetType: "system_setting",
        targetId: targetId,
        targetUserId: null,
        occurredAt: new Date("2026-08-24T02:00:00.000Z"),
        metadata: {},
    };
}
(0, test_1.describe)("PostgresSystemSettingsRepository", function () {
    (0, test_1.it)("deletes an Auth override, upserts only submitted fields, and audits operations", function () { return __awaiter(void 0, void 0, void 0, function () {
        var database, updated;
        var _a, _b;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    database = new FakePostgresDatabase({
                        settings: { "auth.registration_mode": "closed" },
                        settingDeletes: ["auth.registration_mode"],
                    });
                    return [4 /*yield*/, repository(database).updateAuthSettings({
                            actorId: "owner-1",
                            settings: {
                                registrationMode: { action: "reset" },
                                allowedEmailDomains: { action: "set", value: ["example.com"] },
                            },
                            audit: audit("audit-auth", "auth"),
                        })];
                case 1:
                    updated = _c.sent();
                    (0, test_1.expect)(database.settings.has("auth.registration_mode")).toBe(false);
                    (0, test_1.expect)((_a = database.settings.get("auth.allowed_email_domains")) === null || _a === void 0 ? void 0 : _a.value).toBe('["example.com"]');
                    (0, test_1.expect)(updated).toMatchObject({
                        registrationMode: "open",
                        sources: { registrationMode: "default", allowedEmailDomains: "database" },
                    });
                    (0, test_1.expect)((_b = database.audits[0]) === null || _b === void 0 ? void 0 : _b.metadata).toEqual({
                        fields: "auth.registration_mode,auth.allowed_email_domains",
                        operations: "auth.registration_mode:reset,auth.allowed_email_domains:set",
                        result: "updated",
                    });
                    (0, test_1.expect)(JSON.stringify(database.audits)).not.toContain("example.com");
                    return [2 /*return*/];
            }
        });
    }); });
    (0, test_1.it)("resets mail and secret rows to environment fallbacks in one transaction result", function () { return __awaiter(void 0, void 0, void 0, function () {
        var database, updated;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    database = new FakePostgresDatabase({
                        settings: { "mail.from": "database@example.com" },
                        secrets: { "mail.resend_api_key": "database-key" },
                        settingDeletes: ["mail.from"],
                        secretDeletes: ["mail.resend_api_key"],
                    });
                    return [4 /*yield*/, repository(database).updateMailSettings({
                            actorId: "owner-1",
                            settings: {
                                from: { action: "reset" },
                                fromName: { action: "set", value: "Database sender" },
                                resendApiKey: { action: "reset" },
                            },
                            fallback: fallback,
                            audit: audit("audit-mail", "mail"),
                        })];
                case 1:
                    updated = _a.sent();
                    (0, test_1.expect)(__spreadArray([], database.settings.keys(), true)).toEqual(["mail.from_name"]);
                    (0, test_1.expect)(database.secrets.size).toBe(0);
                    (0, test_1.expect)(updated).toMatchObject({
                        from: "environment@example.com",
                        fromName: "Database sender",
                        sources: { from: "environment", fromName: "database" },
                        resendApiKey: { configured: true, source: "environment" },
                    });
                    (0, test_1.expect)(JSON.stringify(database.audits)).not.toContain("database-key");
                    (0, test_1.expect)(JSON.stringify(database.audits)).not.toContain("environment-key");
                    return [2 /*return*/];
            }
        });
    }); });
    (0, test_1.it)("does not write or audit absent reset operations", function () { return __awaiter(void 0, void 0, void 0, function () {
        var database;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    database = new FakePostgresDatabase();
                    return [4 /*yield*/, repository(database).updateAuthSettings({
                            actorId: "owner-1",
                            settings: { registrationMode: { action: "reset" } },
                            audit: audit("audit-noop", "auth"),
                        })];
                case 1:
                    _a.sent();
                    (0, test_1.expect)(database.settings.size).toBe(0);
                    (0, test_1.expect)(database.audits).toHaveLength(0);
                    return [2 /*return*/];
            }
        });
    }); });
});
(0, test_1.describe)("settings adapter parity", function () {
    (0, test_1.it)("preserves omission, set, reset, inheritance and redacted no-op auditing", function () { return __awaiter(void 0, void 0, void 0, function () {
        var database, InMemorySystemSettingsRepository, memory, postgres, _i, _a, settings, input, _b, _c, _d, _e, _f, settings, input, _g, _h, _j, _k, _l, _m;
        return __generator(this, function (_o) {
            switch (_o.label) {
                case 0:
                    database = new FakePostgresDatabase({
                        settingDeletes: ["auth.registration_mode"],
                        secretDeletes: ["mail.resend_api_key"],
                    });
                    return [4 /*yield*/, Promise.resolve().then(function () { return require("./memory.js"); })];
                case 1:
                    InMemorySystemSettingsRepository = (_o.sent()).InMemorySystemSettingsRepository;
                    memory = new InMemorySystemSettingsRepository();
                    postgres = repository(database);
                    _i = 0, _a = [
                        { registrationMode: { action: "set", value: "closed" } },
                        {},
                        { registrationMode: { action: "set", value: "closed" } },
                        { registrationMode: { action: "reset" } },
                        { registrationMode: { action: "reset" } },
                    ];
                    _o.label = 2;
                case 2:
                    if (!(_i < _a.length)) return [3 /*break*/, 6];
                    settings = _a[_i];
                    input = { actorId: "owner-1", settings: settings, audit: audit("auth-parity", "auth") };
                    _c = test_1.expect;
                    return [4 /*yield*/, postgres.updateAuthSettings(input)];
                case 3:
                    _d = (_b = _c.apply(void 0, [_o.sent()])).toEqual;
                    return [4 /*yield*/, memory.updateAuthSettings(input)];
                case 4:
                    _d.apply(_b, [_o.sent()]);
                    (0, test_1.expect)(database.audits.map(function (row) { return row.metadata; })).toEqual(memory.auditEvents.map(function (row) { return row.metadata; }));
                    _o.label = 5;
                case 5:
                    _i++;
                    return [3 /*break*/, 2];
                case 6:
                    (0, test_1.expect)(database.audits).toHaveLength(2);
                    _e = 0, _f = [
                        { resendApiKey: { action: "replace", value: "private-key" } },
                        {},
                        { resendApiKey: { action: "replace", value: "private-key" } },
                        { resendApiKey: { action: "reset" } },
                        { resendApiKey: { action: "reset" } },
                    ];
                    _o.label = 7;
                case 7:
                    if (!(_e < _f.length)) return [3 /*break*/, 13];
                    settings = _f[_e];
                    input = { actorId: "owner-1", settings: settings, fallback: fallback, audit: audit("mail-parity", "mail") };
                    _h = test_1.expect;
                    return [4 /*yield*/, postgres.updateMailSettings(input)];
                case 8:
                    _j = (_g = _h.apply(void 0, [_o.sent()])).toEqual;
                    return [4 /*yield*/, memory.updateMailSettings(input)];
                case 9:
                    _j.apply(_g, [_o.sent()]);
                    _l = test_1.expect;
                    return [4 /*yield*/, postgres.resolveMailConfiguration(fallback)];
                case 10:
                    _m = (_k = _l.apply(void 0, [_o.sent()])).toEqual;
                    return [4 /*yield*/, memory.resolveMailConfiguration(fallback)];
                case 11:
                    _m.apply(_k, [_o.sent()]);
                    _o.label = 12;
                case 12:
                    _e++;
                    return [3 /*break*/, 7];
                case 13:
                    (0, test_1.expect)(database.audits).toHaveLength(4);
                    (0, test_1.expect)(database.audits.map(function (row) { return row.metadata; })).toEqual(memory.auditEvents.map(function (row) { return row.metadata; }));
                    (0, test_1.expect)(JSON.stringify(database.audits)).not.toContain("private-key");
                    return [2 /*return*/];
            }
        });
    }); });
});
//# sourceMappingURL=postgres.test.js.map