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
var __rest = (this && this.__rest) || function (s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
            if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                t[p[i]] = s[p[i]];
        }
    return t;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SettingsReader = void 0;
var values_js_1 = require("./values.js");
/** Both adapters expose the same resolved views and secret-free public settings. */
var SettingsReader = /** @class */ (function () {
    function SettingsReader() {
    }
    SettingsReader.prototype.getAuthSettings = function () {
        return __awaiter(this, void 0, void 0, function () {
            var _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        _a = values_js_1.resolveAuthSettings;
                        return [4 /*yield*/, this.readSettings(values_js_1.authSettingKeys)];
                    case 1: return [2 /*return*/, _a.apply(void 0, [_b.sent()])];
                }
            });
        });
    };
    SettingsReader.prototype.resolveAuthSettings = function () {
        return __awaiter(this, void 0, void 0, function () {
            var _a, _sources, _inherited, settings;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0: return [4 /*yield*/, this.getAuthSettings()];
                    case 1:
                        _a = _b.sent(), _sources = _a.sources, _inherited = _a.inherited, settings = __rest(_a, ["sources", "inherited"]);
                        return [2 /*return*/, settings];
                }
            });
        });
    };
    SettingsReader.prototype.mail = function (fallback) {
        return __awaiter(this, void 0, void 0, function () {
            var rows, secret;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.readSettings(values_js_1.mailSettingKeys)];
                    case 1:
                        rows = _a.sent();
                        return [4 /*yield*/, this.readSecret(values_js_1.mailSecretKey)];
                    case 2:
                        secret = _a.sent();
                        return [2 /*return*/, { view: (0, values_js_1.resolveMailSettings)(rows, secret, fallback), secret: secret }];
                }
            });
        });
    };
    SettingsReader.prototype.getMailSettings = function (fallback) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.mail(fallback)];
                    case 1: return [2 /*return*/, (_a.sent()).view];
                }
            });
        });
    };
    SettingsReader.prototype.resolveMailConfiguration = function (fallback) {
        return __awaiter(this, void 0, void 0, function () {
            var _a, view, secret, _sources, _inherited, _key, _date, settings;
            var _b;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0: return [4 /*yield*/, this.mail(fallback)];
                    case 1:
                        _a = _c.sent(), view = _a.view, secret = _a.secret;
                        _sources = view.sources, _inherited = view.inherited, _key = view.resendApiKey, _date = view.updatedAt, settings = __rest(view, ["sources", "inherited", "resendApiKey", "updatedAt"]);
                        return [2 /*return*/, { settings: settings, resendApiKey: (_b = secret === null || secret === void 0 ? void 0 : secret.value) !== null && _b !== void 0 ? _b : fallback.resendApiKey.value }];
                }
            });
        });
    };
    return SettingsReader;
}());
exports.SettingsReader = SettingsReader;
//# sourceMappingURL=reader.js.map