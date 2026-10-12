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
Object.defineProperty(exports, "__esModule", { value: true });
exports.authMutations = authMutations;
exports.mailMutations = mailMutations;
exports.secretMutations = secretMutations;
exports.changesFor = changesFor;
exports.changedAudit = changedAudit;
exports.applyMemoryChanges = applyMemoryChanges;
var values_js_1 = require("./values.js");
function mutation(key, input, serialize) {
    return (input && {
        key: key,
        action: input.action,
        value: input.action === "reset" ? null : serialize(input.value),
    });
}
function authMutations(input) {
    return [
        mutation("auth.registration_mode", input.registrationMode, String),
        mutation("auth.allowed_email_domains", input.allowedEmailDomains, JSON.stringify),
        mutation("mail.welcome_enabled", input.welcomeEmailEnabled, String),
        mutation("mail.verification_enabled", input.verificationEmailEnabled, String),
        mutation("mail.password_reset_enabled", input.passwordResetEmailEnabled, String),
    ];
}
function mailMutations(input) {
    var trim = function (value) { return value.trim(); };
    return [
        mutation("mail.enabled", input.enabled, String),
        mutation("mail.from", input.from, trim),
        mutation("mail.from_name", input.fromName, trim),
        mutation("mail.templates_base_url", input.templatesBaseUrl, trim),
    ];
}
function secretMutations(input) {
    var value = input.resendApiKey;
    return [
        value && {
            key: "mail.resend_api_key",
            action: value.action,
            value: value.action === "reset" ? null : value.value.trim(),
        },
    ];
}
/** Compute changed keys without exposing their values to audit reporting. */
function changesFor(existing, mutations) {
    return mutations.flatMap(function (change) {
        var _a;
        if (!change ||
            (change.value === null
                ? !existing.has(change.key)
                : ((_a = existing.get(change.key)) === null || _a === void 0 ? void 0 : _a.value) === change.value))
            return [];
        return [__assign(__assign({}, change), { operation: "".concat(change.key, ":").concat(change.action) })];
    });
}
function changedAudit(audit, changes) {
    var operations = changes.map(function (change) { return change.operation; });
    return __assign(__assign({}, audit), { metadata: {
            fields: operations.map(values_js_1.operationKey).join(","),
            operations: operations.join(","),
            result: "updated",
        } });
}
function applyMemoryChanges(store, changes, input) {
    for (var _i = 0, changes_1 = changes; _i < changes_1.length; _i++) {
        var _a = changes_1[_i], key = _a.key, value = _a.value;
        if (value === null)
            store.delete(key);
        else
            store.set(key, {
                value: value,
                updatedAt: new Date(input.audit.occurredAt),
                updatedBy: input.actorId,
            });
    }
}
//# sourceMappingURL=mutations.js.map