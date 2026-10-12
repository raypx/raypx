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
exports.PostgresSystemSettingsRepository = void 0;
var reader_js_1 = require("./reader.js");
var audit_js_1 = require("../audit.js");
var values_js_1 = require("./values.js");
var mutations_js_1 = require("./mutations.js");
var drizzle_orm_1 = require("drizzle-orm");
var schema_js_1 = require("../schema.js");
var PostgresSystemSettingsRepository = /** @class */ (function (_super) {
    __extends(PostgresSystemSettingsRepository, _super);
    function PostgresSystemSettingsRepository(db) {
        var _this = _super.call(this) || this;
        _this.db = db;
        return _this;
    }
    PostgresSystemSettingsRepository.prototype.readSettings = function (keys) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                return [2 /*return*/, this.db
                        .select()
                        .from(schema_js_1.systemSettings)
                        .where((0, drizzle_orm_1.inArray)(schema_js_1.systemSettings.key, __spreadArray([], keys, true)))];
            });
        });
    };
    PostgresSystemSettingsRepository.prototype.readSecret = function (key) {
        return __awaiter(this, void 0, void 0, function () {
            var row;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.db
                            .select()
                            .from(schema_js_1.systemSecrets)
                            .where((0, drizzle_orm_1.eq)(schema_js_1.systemSecrets.key, key))
                            .limit(1)];
                    case 1:
                        row = (_a.sent())[0];
                        return [2 /*return*/, row !== null && row !== void 0 ? row : null];
                }
            });
        });
    };
    PostgresSystemSettingsRepository.prototype.updateAuthSettings = function (input) {
        return __awaiter(this, void 0, void 0, function () {
            var _this = this;
            return __generator(this, function (_a) {
                return [2 /*return*/, this.db.transaction(function (tx) { return __awaiter(_this, void 0, void 0, function () {
                        var settingRows, existingSettings, changes, current;
                        return __generator(this, function (_a) {
                            switch (_a.label) {
                                case 0: return [4 /*yield*/, tx
                                        .select()
                                        .from(schema_js_1.systemSettings)
                                        .where((0, drizzle_orm_1.inArray)(schema_js_1.systemSettings.key, __spreadArray([], values_js_1.authSettingKeys, true)))];
                                case 1:
                                    settingRows = _a.sent();
                                    existingSettings = new Map(settingRows.map(function (row) { return [row.key, row]; }));
                                    changes = (0, mutations_js_1.changesFor)(existingSettings, (0, mutations_js_1.authMutations)(input.settings));
                                    return [4 /*yield*/, persistChanges(tx, schema_js_1.systemSettings, existingSettings, changes, input)];
                                case 2:
                                    _a.sent();
                                    current = (0, values_js_1.resolveAuthSettings)(__spreadArray([], existingSettings.values(), true));
                                    if (!changes.length) return [3 /*break*/, 4];
                                    return [4 /*yield*/, tx.insert(schema_js_1.auditEvents).values((0, audit_js_1.toAuditInsert)((0, mutations_js_1.changedAudit)(input.audit, changes)))];
                                case 3:
                                    _a.sent();
                                    _a.label = 4;
                                case 4: return [2 /*return*/, current];
                            }
                        });
                    }); })];
            });
        });
    };
    PostgresSystemSettingsRepository.prototype.updateMailSettings = function (input) {
        return __awaiter(this, void 0, void 0, function () {
            var _this = this;
            return __generator(this, function (_a) {
                return [2 /*return*/, this.db.transaction(function (tx) { return __awaiter(_this, void 0, void 0, function () {
                        var settingRows, secretRow, existingSettings, changes, secrets, secretChanges, current;
                        var _a;
                        return __generator(this, function (_b) {
                            switch (_b.label) {
                                case 0: return [4 /*yield*/, tx
                                        .select()
                                        .from(schema_js_1.systemSettings)
                                        .where((0, drizzle_orm_1.inArray)(schema_js_1.systemSettings.key, __spreadArray([], values_js_1.mailSettingKeys, true)))];
                                case 1:
                                    settingRows = _b.sent();
                                    return [4 /*yield*/, tx
                                            .select()
                                            .from(schema_js_1.systemSecrets)
                                            .where((0, drizzle_orm_1.eq)(schema_js_1.systemSecrets.key, values_js_1.mailSecretKey))
                                            .limit(1)];
                                case 2:
                                    secretRow = (_b.sent())[0];
                                    existingSettings = new Map(settingRows.map(function (row) { return [row.key, row]; }));
                                    changes = (0, mutations_js_1.changesFor)(existingSettings, (0, mutations_js_1.mailMutations)(input.settings));
                                    return [4 /*yield*/, persistChanges(tx, schema_js_1.systemSettings, existingSettings, changes, input)];
                                case 3:
                                    _b.sent();
                                    secrets = new Map(secretRow ? [[secretRow.key, secretRow]] : []);
                                    secretChanges = (0, mutations_js_1.changesFor)(secrets, (0, mutations_js_1.secretMutations)(input.settings));
                                    return [4 /*yield*/, persistChanges(tx, schema_js_1.systemSecrets, secrets, secretChanges, input)];
                                case 4:
                                    _b.sent();
                                    changes.push.apply(changes, secretChanges);
                                    current = (0, values_js_1.resolveMailSettings)(__spreadArray([], existingSettings.values(), true), (_a = secrets.get(values_js_1.mailSecretKey)) !== null && _a !== void 0 ? _a : null, input.fallback);
                                    if (!changes.length) return [3 /*break*/, 6];
                                    return [4 /*yield*/, tx.insert(schema_js_1.auditEvents).values((0, audit_js_1.toAuditInsert)((0, mutations_js_1.changedAudit)(input.audit, changes)))];
                                case 5:
                                    _b.sent();
                                    _b.label = 6;
                                case 6: return [2 /*return*/, current];
                            }
                        });
                    }); })];
            });
        });
    };
    return PostgresSystemSettingsRepository;
}(reader_js_1.SettingsReader));
exports.PostgresSystemSettingsRepository = PostgresSystemSettingsRepository;
function persistChanges(tx, table, existing, changes, input) {
    return __awaiter(this, void 0, void 0, function () {
        var _this = this;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, Promise.all(changes.map(function (_a) { return __awaiter(_this, [_a], void 0, function (_b) {
                        var row;
                        var key = _b.key, value = _b.value;
                        return __generator(this, function (_c) {
                            switch (_c.label) {
                                case 0:
                                    if (!(value === null)) return [3 /*break*/, 2];
                                    return [4 /*yield*/, tx.delete(table).where((0, drizzle_orm_1.eq)(table.key, key))];
                                case 1:
                                    _c.sent();
                                    existing.delete(key);
                                    return [2 /*return*/];
                                case 2:
                                    row = { key: key, value: value, updatedAt: input.audit.occurredAt, updatedBy: input.actorId };
                                    return [4 /*yield*/, tx.insert(table).values(row).onConflictDoUpdate({ target: table.key, set: row })];
                                case 3:
                                    _c.sent();
                                    existing.set(key, row);
                                    return [2 /*return*/];
                            }
                        });
                    }); }))];
                case 1:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
//# sourceMappingURL=postgres.js.map