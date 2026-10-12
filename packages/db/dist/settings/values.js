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
exports.authSettingKeys = exports.mailSecretKey = exports.mailSettingKeys = void 0;
exports.resolveMailSettings = resolveMailSettings;
exports.resolveAuthSettings = resolveAuthSettings;
exports.operationKey = operationKey;
var core_1 = require("@voidmix/core");
exports.mailSettingKeys = [
    "mail.enabled",
    "mail.from",
    "mail.from_name",
    "mail.templates_base_url",
];
exports.mailSecretKey = "mail.resend_api_key";
exports.authSettingKeys = [
    "auth.registration_mode",
    "auth.allowed_email_domains",
    "mail.welcome_enabled",
    "mail.verification_enabled",
    "mail.password_reset_enabled",
];
function resolveMailSettings(settingRows, secretRow, fallback) {
    var _a, _b;
    var values = new Map(settingRows.map(function (row) { return [row.key, row.value]; }));
    var enabled = parseBoolean(values.get("mail.enabled"), fallback.enabled.value);
    var from = resolveNullable(values.get("mail.from"), fallback.from.value);
    var fromName = (_a = values.get("mail.from_name")) !== null && _a !== void 0 ? _a : fallback.fromName.value;
    var templatesBaseUrl = resolveNullable(values.get("mail.templates_base_url"), fallback.templatesBaseUrl.value);
    var resendApiKey = (_b = secretRow === null || secretRow === void 0 ? void 0 : secretRow.value) !== null && _b !== void 0 ? _b : fallback.resendApiKey.value;
    var updatedAt = latestDate(__spreadArray(__spreadArray([], settingRows.map(function (row) { return row.updatedAt; }), true), [secretRow === null || secretRow === void 0 ? void 0 : secretRow.updatedAt], false));
    var missing = [];
    if (enabled && !resendApiKey)
        missing.push("RESEND_API_KEY");
    if (enabled && !from)
        missing.push("MAIL_FROM");
    return {
        enabled: enabled,
        from: from,
        fromName: fromName,
        templatesBaseUrl: templatesBaseUrl,
        sources: {
            enabled: values.has("mail.enabled") ? "database" : fallback.enabled.source,
            from: values.has("mail.from") ? "database" : fallback.from.source,
            fromName: values.has("mail.from_name") ? "database" : fallback.fromName.source,
            templatesBaseUrl: values.has("mail.templates_base_url")
                ? "database"
                : fallback.templatesBaseUrl.source,
        },
        inherited: {
            enabled: __assign({}, fallback.enabled),
            from: __assign({}, fallback.from),
            fromName: __assign({}, fallback.fromName),
            templatesBaseUrl: __assign({}, fallback.templatesBaseUrl),
        },
        resendApiKey: {
            configured: Boolean(resendApiKey),
            source: secretRow ? "database" : fallback.resendApiKey.value ? "environment" : "missing",
            inheritedConfigured: Boolean(fallback.resendApiKey.value),
        },
        configurationState: !enabled ? "disabled" : missing.length === 0 ? "ready" : "incomplete",
        missing: missing,
        updatedAt: updatedAt,
    };
}
function resolveAuthSettings(settingRows) {
    var defaults = (0, core_1.createDefaultAuthSettings)();
    var values = new Map(settingRows.map(function (row) { return [row.key, row.value]; }));
    return {
        registrationMode: values.get("auth.registration_mode") === "closed" ? "closed" : "open",
        allowedEmailDomains: parseStringArray(values.get("auth.allowed_email_domains"), defaults.allowedEmailDomains),
        welcomeEmailEnabled: parseBoolean(values.get("mail.welcome_enabled"), defaults.welcomeEmailEnabled),
        verificationEmailEnabled: parseBoolean(values.get("mail.verification_enabled"), defaults.verificationEmailEnabled),
        passwordResetEmailEnabled: parseBoolean(values.get("mail.password_reset_enabled"), defaults.passwordResetEmailEnabled),
        sources: {
            registrationMode: values.has("auth.registration_mode") ? "database" : "default",
            allowedEmailDomains: values.has("auth.allowed_email_domains") ? "database" : "default",
            welcomeEmailEnabled: values.has("mail.welcome_enabled") ? "database" : "default",
            verificationEmailEnabled: values.has("mail.verification_enabled") ? "database" : "default",
            passwordResetEmailEnabled: values.has("mail.password_reset_enabled") ? "database" : "default",
        },
        inherited: {
            registrationMode: { value: defaults.registrationMode, source: "default" },
            allowedEmailDomains: { value: __spreadArray([], defaults.allowedEmailDomains, true), source: "default" },
            welcomeEmailEnabled: { value: defaults.welcomeEmailEnabled, source: "default" },
            verificationEmailEnabled: {
                value: defaults.verificationEmailEnabled,
                source: "default",
            },
            passwordResetEmailEnabled: {
                value: defaults.passwordResetEmailEnabled,
                source: "default",
            },
        },
        updatedAt: latestDate(settingRows.map(function (row) { return row.updatedAt; })),
    };
}
function parseBoolean(value, fallback) {
    if (value === undefined)
        return fallback;
    return value === "true";
}
function resolveNullable(value, fallback) {
    return value === undefined ? fallback : value || null;
}
function parseStringArray(value, fallback) {
    if (value === undefined)
        return __spreadArray([], fallback, true);
    try {
        var parsed = JSON.parse(value);
        return Array.isArray(parsed) && parsed.every(function (item) { return typeof item === "string"; })
            ? __spreadArray([], new Set(parsed.map(function (item) { return item.trim().toLowerCase(); }).filter(Boolean)), true) : __spreadArray([], fallback, true);
    }
    catch (_a) {
        return __spreadArray([], fallback, true);
    }
}
function latestDate(values) {
    var timestamps = values.filter(function (value) { return value !== undefined; });
    if (timestamps.length === 0)
        return null;
    return new Date(Math.max.apply(Math, timestamps.map(function (value) { return value.getTime(); })));
}
function operationKey(operation) {
    return operation.slice(0, operation.lastIndexOf(":"));
}
//# sourceMappingURL=values.js.map