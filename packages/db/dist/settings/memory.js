"use strict";
var __extends = (this && this.__extends) || (function () {
    var extendStatics = function (d, b) {
        extendStatics = Object.setPrototypeOf ||
            ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
            function (d, b) { for (var p in b) if (Object.prototype.hasOwnProperty.call(b, p)) d[p] = b[p]; };
        return extendStatics(d, b);
    };
    return function (d, b) {
        if (typeof b !== "function" && b !== null)
            throw new TypeError("Class extends value " + String(b) + " is not a constructor or null");
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
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
exports.InMemorySystemSettingsRepository = void 0;
var reader_js_1 = require("./reader.js");
var mutations_js_1 = require("./mutations.js");
var InMemorySystemSettingsRepository = /** @class */ (function (_super) {
    __extends(InMemorySystemSettingsRepository, _super);
    function InMemorySystemSettingsRepository(options) {
        if (options === void 0) { options = {}; }
        var _a, _b, _c, _d;
        var _this = _super.call(this) || this;
        _this.settings = new Map();
        _this.secrets = new Map();
        var updatedAt = (_a = options.updatedAt) !== null && _a !== void 0 ? _a : new Date("2026-01-01T00:00:00.000Z");
        for (var _i = 0, _e = Object.entries((_b = options.settings) !== null && _b !== void 0 ? _b : {}); _i < _e.length; _i++) {
            var _f = _e[_i], key = _f[0], value = _f[1];
            _this.settings.set(key, { value: value, updatedAt: new Date(updatedAt), updatedBy: null });
        }
        for (var _g = 0, _h = Object.entries((_c = options.secrets) !== null && _c !== void 0 ? _c : {}); _g < _h.length; _g++) {
            var _j = _h[_g], key = _j[0], value = _j[1];
            _this.secrets.set(key, { value: value, updatedAt: new Date(updatedAt), updatedBy: null });
        }
        _this.auditEvents = (_d = options.auditEvents) !== null && _d !== void 0 ? _d : [];
        return _this;
    }
    InMemorySystemSettingsRepository.prototype.readSettings = function (keys) {
        var _this = this;
        return keys.flatMap(function (key) {
            var row = _this.settings.get(key);
            return row ? [__assign({ key: key }, row)] : [];
        });
    };
    InMemorySystemSettingsRepository.prototype.readSecret = function (key) {
        var _a;
        return (_a = this.secrets.get(key)) !== null && _a !== void 0 ? _a : null;
    };
    InMemorySystemSettingsRepository.prototype.updateAuthSettings = function (input) {
        return __awaiter(this, void 0, void 0, function () {
            var changes, current;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        changes = (0, mutations_js_1.changesFor)(this.settings, (0, mutations_js_1.authMutations)(input.settings));
                        (0, mutations_js_1.applyMemoryChanges)(this.settings, changes, input);
                        return [4 /*yield*/, this.getAuthSettings()];
                    case 1:
                        current = _a.sent();
                        if (changes.length)
                            this.auditEvents.push((0, mutations_js_1.changedAudit)(input.audit, changes));
                        return [2 /*return*/, current];
                }
            });
        });
    };
    InMemorySystemSettingsRepository.prototype.updateMailSettings = function (input) {
        return __awaiter(this, void 0, void 0, function () {
            var changes, secrets, current;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        changes = (0, mutations_js_1.changesFor)(this.settings, (0, mutations_js_1.mailMutations)(input.settings));
                        (0, mutations_js_1.applyMemoryChanges)(this.settings, changes, input);
                        secrets = (0, mutations_js_1.changesFor)(this.secrets, (0, mutations_js_1.secretMutations)(input.settings));
                        (0, mutations_js_1.applyMemoryChanges)(this.secrets, secrets, input);
                        changes.push.apply(changes, secrets);
                        return [4 /*yield*/, this.getMailSettings(input.fallback)];
                    case 1:
                        current = _a.sent();
                        if (changes.length)
                            this.auditEvents.push((0, mutations_js_1.changedAudit)(input.audit, changes));
                        return [2 /*return*/, current];
                }
            });
        });
    };
    return InMemorySystemSettingsRepository;
}(reader_js_1.SettingsReader));
exports.InMemorySystemSettingsRepository = InMemorySystemSettingsRepository;
//# sourceMappingURL=memory.js.map