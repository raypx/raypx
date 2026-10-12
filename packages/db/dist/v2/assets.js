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
exports.PostgresAssetVersionV2Repository = exports.PostgresAssetV2Repository = void 0;
var results_js_1 = require("./results.js");
var drizzle_orm_1 = require("drizzle-orm");
var pagination_js_1 = require("../pagination.js");
var visibility_js_1 = require("./visibility.js");
var schema_js_1 = require("../schema.js");
var PostgresAssetV2Repository = /** @class */ (function () {
    function PostgresAssetV2Repository(db) {
        this.db = db;
    }
    PostgresAssetV2Repository.prototype.listVisible = function (query) {
        return __awaiter(this, void 0, void 0, function () {
            var page, time, statement, _a, _b;
            var _c;
            return __generator(this, function (_d) {
                switch (_d.label) {
                    case 0:
                        page = (0, pagination_js_1.cursorPage)(query, "assets:".concat(query.actorId, ":").concat((_c = query.projectId) !== null && _c !== void 0 ? _c : ""));
                        time = (0, pagination_js_1.timestampKey)(schema_js_1.v2Assets.updatedAt);
                        statement = this.db
                            .select()
                            .from(schema_js_1.v2Assets)
                            .where((0, drizzle_orm_1.and)((0, visibility_js_1.resourceVisibility)(query.actorId, schema_js_1.v2Assets.projectId), query.projectId ? (0, drizzle_orm_1.eq)(schema_js_1.v2Assets.projectId, query.projectId) : undefined, page.seek(time, schema_js_1.v2Assets.id)))
                            .orderBy((0, drizzle_orm_1.desc)(time), (0, drizzle_orm_1.desc)(schema_js_1.v2Assets.id))
                            .$dynamic();
                        if (page.limit !== undefined)
                            statement = statement.limit(page.limit + 1);
                        _b = (_a = page).finish;
                        return [4 /*yield*/, statement];
                    case 1: return [2 /*return*/, _b.apply(_a, [_d.sent(), function (row) { return row.updatedAt; }])];
                }
            });
        });
    };
    PostgresAssetV2Repository.prototype.getById = function (id) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                return [2 /*return*/, (0, results_js_1.first)(this.db.select().from(schema_js_1.v2Assets).where((0, drizzle_orm_1.eq)(schema_js_1.v2Assets.id, id)).limit(1))];
            });
        });
    };
    PostgresAssetV2Repository.prototype.listByProject = function (projectId) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                return [2 /*return*/, this.db
                        .select()
                        .from(schema_js_1.v2Assets)
                        .where((0, drizzle_orm_1.eq)(schema_js_1.v2Assets.projectId, projectId))
                        .orderBy((0, drizzle_orm_1.desc)(schema_js_1.v2Assets.updatedAt), (0, drizzle_orm_1.desc)(schema_js_1.v2Assets.id))];
            });
        });
    };
    PostgresAssetV2Repository.prototype.create = function (_a) {
        return __awaiter(this, void 0, void 0, function () {
            var now = _a.now, record = __rest(_a, ["now"]);
            return __generator(this, function (_b) {
                return [2 /*return*/, (0, results_js_1.inserted)(this.db
                        .insert(schema_js_1.v2Assets)
                        .values(__assign(__assign({}, record), { archived: false, createdAt: now, updatedAt: now }))
                        .returning(), "Asset insert")];
            });
        });
    };
    return PostgresAssetV2Repository;
}());
exports.PostgresAssetV2Repository = PostgresAssetV2Repository;
var PostgresAssetVersionV2Repository = /** @class */ (function () {
    function PostgresAssetVersionV2Repository(db) {
        this.db = db;
    }
    PostgresAssetVersionV2Repository.prototype.getById = function (id) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                return [2 /*return*/, (0, results_js_1.first)(this.db.select().from(schema_js_1.v2AssetVersions).where((0, drizzle_orm_1.eq)(schema_js_1.v2AssetVersions.id, id)).limit(1))];
            });
        });
    };
    PostgresAssetVersionV2Repository.prototype.listByAsset = function (assetId) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                return [2 /*return*/, this.db
                        .select()
                        .from(schema_js_1.v2AssetVersions)
                        .where((0, drizzle_orm_1.eq)(schema_js_1.v2AssetVersions.assetId, assetId))
                        .orderBy((0, drizzle_orm_1.desc)(schema_js_1.v2AssetVersions.createdAt), (0, drizzle_orm_1.desc)(schema_js_1.v2AssetVersions.id))];
            });
        });
    };
    PostgresAssetVersionV2Repository.prototype.create = function (_a) {
        return __awaiter(this, void 0, void 0, function () {
            var now = _a.now, record = __rest(_a, ["now"]);
            return __generator(this, function (_b) {
                return [2 /*return*/, (0, results_js_1.inserted)(this.db
                        .insert(schema_js_1.v2AssetVersions)
                        .values(__assign(__assign({}, record), { createdAt: now }))
                        .returning(), "Asset version insert")];
            });
        });
    };
    return PostgresAssetVersionV2Repository;
}());
exports.PostgresAssetVersionV2Repository = PostgresAssetVersionV2Repository;
//# sourceMappingURL=assets.js.map