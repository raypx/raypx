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
var memory_js_1 = require("./memory.js");
var users = [
    {
        id: "user-1",
        email: "first@example.com",
        displayName: "First",
        role: "user",
        status: "active",
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
    },
    {
        id: "user-2",
        email: "second@example.com",
        displayName: "Second",
        role: "admin",
        status: "active",
        createdAt: new Date("2026-01-02T00:00:00.000Z"),
    },
];
(0, test_1.describe)("InMemoryUserRepository", function () {
    (0, test_1.it)("supports search and cursor pagination", function () { return __awaiter(void 0, void 0, void 0, function () {
        var repository, firstPage, secondPage, _a;
        var _b, _c;
        return __generator(this, function (_d) {
            switch (_d.label) {
                case 0:
                    repository = new memory_js_1.InMemoryUserRepository(users);
                    return [4 /*yield*/, repository.list({ limit: 1 })];
                case 1:
                    firstPage = _d.sent();
                    return [4 /*yield*/, repository.list(__assign({ limit: 1 }, (firstPage.nextCursor ? { cursor: firstPage.nextCursor } : {})))];
                case 2:
                    secondPage = _d.sent();
                    (0, test_1.expect)((_b = firstPage.items[0]) === null || _b === void 0 ? void 0 : _b.id).toBe("user-2");
                    (0, test_1.expect)((_c = secondPage.items[0]) === null || _c === void 0 ? void 0 : _c.id).toBe("user-1");
                    _a = test_1.expect;
                    return [4 /*yield*/, repository.list({ limit: 10, query: "FIRST" })];
                case 3:
                    _a.apply(void 0, [(_d.sent()).total]).toBe(1);
                    return [2 /*return*/];
            }
        });
    }); });
});
(0, test_1.describe)("InMemorySystemSettingsRepository", function () {
    var fallback = {
        enabled: { value: true, source: "default" },
        from: { value: "environment@example.com", source: "environment" },
        fromName: { value: "Environment", source: "environment" },
        templatesBaseUrl: {
            value: "https://environment.example.com",
            source: "environment",
        },
        resendApiKey: { value: "environment-key", source: "environment" },
    };
    (0, test_1.it)("resolves typed auth policy values from system settings", function () { return __awaiter(void 0, void 0, void 0, function () {
        var repository;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    repository = new memory_js_1.InMemorySystemSettingsRepository({
                        settings: {
                            "auth.registration_mode": "closed",
                            "auth.allowed_email_domains": '["example.com","studio.example"]',
                            "mail.welcome_enabled": "false",
                            "mail.verification_enabled": "true",
                            "mail.password_reset_enabled": "false",
                        },
                    });
                    return [4 /*yield*/, (0, test_1.expect)(repository.getAuthSettings()).resolves.toMatchObject({
                            registrationMode: "closed",
                            allowedEmailDomains: ["example.com", "studio.example"],
                            welcomeEmailEnabled: false,
                            verificationEmailEnabled: true,
                            passwordResetEmailEnabled: false,
                        })];
                case 1:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    }); });
    (0, test_1.it)("audits auth policy changes once and records only changed field names", function () { return __awaiter(void 0, void 0, void 0, function () {
        var auditEvents, repository, input;
        var _a, _b;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    auditEvents = [];
                    repository = new memory_js_1.InMemorySystemSettingsRepository({ auditEvents: auditEvents });
                    input = {
                        actorId: "owner-1",
                        settings: {
                            registrationMode: { action: "set", value: "closed" },
                            allowedEmailDomains: { action: "set", value: ["example.com"] },
                            welcomeEmailEnabled: { action: "set", value: false },
                        },
                        audit: settingsAudit("audit-auth-1", "auth", "owner-1", new Date("2026-08-24T01:00:00.000Z")),
                    };
                    return [4 /*yield*/, repository.updateAuthSettings(input)];
                case 1:
                    _c.sent();
                    return [4 /*yield*/, repository.updateAuthSettings(__assign(__assign({}, input), { audit: __assign(__assign({}, input.audit), { id: "audit-auth-2" }) }))];
                case 2:
                    _c.sent();
                    (0, test_1.expect)(auditEvents).toHaveLength(1);
                    (0, test_1.expect)(auditEvents[0]).toMatchObject({
                        targetId: "auth",
                        metadata: { result: "updated" },
                    });
                    (0, test_1.expect)((_a = auditEvents[0]) === null || _a === void 0 ? void 0 : _a.metadata.fields).toContain("auth.registration_mode");
                    (0, test_1.expect)((_b = auditEvents[0]) === null || _b === void 0 ? void 0 : _b.metadata.operations).toContain("auth.registration_mode:set");
                    (0, test_1.expect)(JSON.stringify(auditEvents)).not.toContain("example.com");
                    (0, test_1.expect)(JSON.stringify(auditEvents)).not.toContain('"closed"');
                    return [2 /*return*/];
            }
        });
    }); });
    (0, test_1.it)("resets auth overrides to defaults and ignores an absent repeated reset", function () { return __awaiter(void 0, void 0, void 0, function () {
        var repository, audit, updated;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    repository = new memory_js_1.InMemorySystemSettingsRepository({
                        settings: { "auth.registration_mode": "closed" },
                    });
                    audit = settingsAudit("audit-auth-reset-1", "auth", "owner-1", new Date("2026-08-24T01:30:00.000Z"));
                    return [4 /*yield*/, repository.updateAuthSettings({
                            actorId: "owner-1",
                            settings: { registrationMode: { action: "reset" } },
                            audit: audit,
                        })];
                case 1:
                    updated = _b.sent();
                    return [4 /*yield*/, repository.updateAuthSettings({
                            actorId: "owner-1",
                            settings: { registrationMode: { action: "reset" } },
                            audit: __assign(__assign({}, audit), { id: "audit-auth-reset-2" }),
                        })];
                case 2:
                    _b.sent();
                    (0, test_1.expect)(repository.settings.has("auth.registration_mode")).toBe(false);
                    (0, test_1.expect)(updated).toMatchObject({
                        registrationMode: "open",
                        sources: { registrationMode: "default" },
                    });
                    (0, test_1.expect)(repository.auditEvents).toHaveLength(1);
                    (0, test_1.expect)((_a = repository.auditEvents[0]) === null || _a === void 0 ? void 0 : _a.metadata.operations).toBe("auth.registration_mode:reset");
                    return [2 /*return*/];
            }
        });
    }); });
    (0, test_1.it)("prefers database values and never exposes the secret", function () { return __awaiter(void 0, void 0, void 0, function () {
        var repository, settings, runtime;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    repository = new memory_js_1.InMemorySystemSettingsRepository({
                        settings: { "mail.from": "database@example.com" },
                        secrets: { "mail.resend_api_key": "database-key" },
                    });
                    return [4 /*yield*/, repository.getMailSettings(fallback)];
                case 1:
                    settings = _a.sent();
                    return [4 /*yield*/, repository.resolveMailConfiguration(fallback)];
                case 2:
                    runtime = _a.sent();
                    (0, test_1.expect)(settings).toMatchObject({
                        from: "database@example.com",
                        fromName: "Environment",
                        sources: { from: "database", fromName: "environment" },
                        resendApiKey: { configured: true, source: "database", inheritedConfigured: true },
                        configurationState: "ready",
                    });
                    (0, test_1.expect)(settings.resendApiKey).not.toHaveProperty("value");
                    (0, test_1.expect)(runtime.resendApiKey).toBe("database-key");
                    return [2 /*return*/];
            }
        });
    }); });
    (0, test_1.it)("keeps an omitted key and deletes its database override only when reset", function () { return __awaiter(void 0, void 0, void 0, function () {
        var auditEvents, repository, audit, _a;
        var _b, _c, _d;
        return __generator(this, function (_e) {
            switch (_e.label) {
                case 0:
                    auditEvents = [];
                    repository = new memory_js_1.InMemorySystemSettingsRepository({
                        secrets: { "mail.resend_api_key": "database-key" },
                        auditEvents: auditEvents,
                    });
                    audit = settingsAudit("audit-1", "mail", "admin-1", new Date("2026-08-24T00:00:00.000Z"));
                    return [4 /*yield*/, repository.updateMailSettings({
                            actorId: "admin-1",
                            settings: {},
                            fallback: fallback,
                            audit: audit,
                        })];
                case 1:
                    _e.sent();
                    (0, test_1.expect)((_b = repository.secrets.get("mail.resend_api_key")) === null || _b === void 0 ? void 0 : _b.value).toBe("database-key");
                    return [4 /*yield*/, repository.updateMailSettings({
                            actorId: "admin-1",
                            settings: { resendApiKey: { action: "reset" } },
                            fallback: fallback,
                            audit: __assign(__assign({}, audit), { id: "audit-2" }),
                        })];
                case 2:
                    _e.sent();
                    (0, test_1.expect)(repository.secrets.has("mail.resend_api_key")).toBe(false);
                    _a = test_1.expect;
                    return [4 /*yield*/, repository.getMailSettings(fallback)];
                case 3:
                    _a.apply(void 0, [(_e.sent()).resendApiKey]).toMatchObject({
                        configured: true,
                        source: "environment",
                    });
                    (0, test_1.expect)((_c = auditEvents.at(-1)) === null || _c === void 0 ? void 0 : _c.metadata).not.toHaveProperty("resendApiKey");
                    (0, test_1.expect)((_d = auditEvents.at(-1)) === null || _d === void 0 ? void 0 : _d.metadata.operations).toContain("mail.resend_api_key:reset");
                    (0, test_1.expect)(JSON.stringify(auditEvents)).not.toContain("database-key");
                    return [2 /*return*/];
            }
        });
    }); });
    (0, test_1.it)("does not audit a repeated no-op update", function () { return __awaiter(void 0, void 0, void 0, function () {
        var repository, input;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    repository = new memory_js_1.InMemorySystemSettingsRepository();
                    input = {
                        actorId: "admin-1",
                        settings: {
                            enabled: { action: "set", value: false },
                        },
                        fallback: fallback,
                        audit: settingsAudit("audit-1", "mail", "admin-1", new Date("2026-08-24T00:00:00.000Z")),
                    };
                    return [4 /*yield*/, repository.updateMailSettings(input)];
                case 1:
                    _a.sent();
                    return [4 /*yield*/, repository.updateMailSettings(__assign(__assign({}, input), { audit: __assign(__assign({}, input.audit), { id: "audit-2" }) }))];
                case 2:
                    _a.sent();
                    (0, test_1.expect)(repository.auditEvents).toHaveLength(1);
                    return [2 /*return*/];
            }
        });
    }); });
    (0, test_1.it)("does not create database overrides for omitted mail fields", function () { return __awaiter(void 0, void 0, void 0, function () {
        var repository;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    repository = new memory_js_1.InMemorySystemSettingsRepository();
                    return [4 /*yield*/, repository.updateMailSettings({
                            actorId: "admin-1",
                            settings: { fromName: { action: "set", value: "Database sender" } },
                            fallback: fallback,
                            audit: settingsAudit("audit-one-mail-field", "mail", "admin-1", new Date("2026-08-24T01:45:00.000Z")),
                        })];
                case 1:
                    _a.sent();
                    (0, test_1.expect)(__spreadArray([], repository.settings.keys(), true)).toEqual(["mail.from_name"]);
                    (0, test_1.expect)(repository.secrets.size).toBe(0);
                    return [2 /*return*/];
            }
        });
    }); });
    (0, test_1.it)("resets ordinary database overrides without persisting inherited values", function () { return __awaiter(void 0, void 0, void 0, function () {
        var repository, updated;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    repository = new memory_js_1.InMemorySystemSettingsRepository({
                        settings: { "mail.from": "database@example.com" },
                    });
                    return [4 /*yield*/, repository.updateMailSettings({
                            actorId: "admin-1",
                            settings: { from: { action: "reset" } },
                            fallback: fallback,
                            audit: settingsAudit("audit-reset", "mail", "admin-1", new Date("2026-08-24T02:00:00.000Z")),
                        })];
                case 1:
                    updated = _a.sent();
                    (0, test_1.expect)(repository.settings.has("mail.from")).toBe(false);
                    (0, test_1.expect)(updated).toMatchObject({
                        from: "environment@example.com",
                        sources: { from: "environment" },
                    });
                    return [2 /*return*/];
            }
        });
    }); });
});
function settingsAudit(id, targetId, actorId, occurredAt) {
    return {
        id: id,
        actorId: actorId,
        action: "system.settings.updated",
        targetType: "system_setting",
        targetId: targetId,
        targetUserId: null,
        occurredAt: occurredAt,
        metadata: {},
    };
}
//# sourceMappingURL=memory.test.js.map