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
var __await = (this && this.__await) || function (v) { return this instanceof __await ? (this.v = v, this) : new __await(v); }
var __asyncGenerator = (this && this.__asyncGenerator) || function (thisArg, _arguments, generator) {
    if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
    var g = generator.apply(thisArg, _arguments || []), i, q = [];
    return i = Object.create((typeof AsyncIterator === "function" ? AsyncIterator : Object).prototype), verb("next"), verb("throw"), verb("return", awaitReturn), i[Symbol.asyncIterator] = function () { return this; }, i;
    function awaitReturn(f) { return function (v) { return Promise.resolve(v).then(f, reject); }; }
    function verb(n, f) { if (g[n]) { i[n] = function (v) { return new Promise(function (a, b) { q.push([n, v, a, b]) > 1 || resume(n, v); }); }; if (f) i[n] = f(i[n]); } }
    function resume(n, v) { try { step(g[n](v)); } catch (e) { settle(q[0][3], e); } }
    function step(r) { r.value instanceof __await ? Promise.resolve(r.value.v).then(fulfill, reject) : settle(q[0][2], r); }
    function fulfill(value) { resume("next", value); }
    function reject(value) { resume("throw", value); }
    function settle(f, v) { if (f(v), q.shift(), q.length) resume(q[0][0], q[0][1]); }
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
exports.createMemoryStorage = createMemoryStorage;
exports.verifyFilesystemUpload = verifyFilesystemUpload;
exports.verifyFilesystemDownload = verifyFilesystemDownload;
exports.createFilesystemStorage = createFilesystemStorage;
var node_crypto_1 = require("node:crypto");
var promises_1 = require("node:fs/promises");
var node_path_1 = require("node:path");
var index_js_1 = require("./index.js");
function createMemoryStorage() {
    var objects = new Map();
    return {
        put: function (input) {
            return __awaiter(this, void 0, void 0, function () {
                var metadata, existing;
                return __generator(this, function (_a) {
                    metadata = {
                        key: input.key,
                        byteSize: input.body.byteLength,
                        contentType: input.contentType,
                        checksumSha256: input.checksumSha256,
                    };
                    (0, index_js_1.validateObjectInput)(metadata);
                    if ((0, node_crypto_1.createHash)("sha256").update(input.body).digest("hex") !== input.checksumSha256)
                        throw new Error("Object checksum does not match content.");
                    existing = objects.get(input.key);
                    if (existing &&
                        (existing.metadata.checksumSha256 !== metadata.checksumSha256 ||
                            existing.metadata.contentType !== metadata.contentType))
                        throw new Error("Object key is immutable.");
                    objects.set(input.key, { metadata: metadata, body: input.body.slice() });
                    return [2 /*return*/, metadata];
                });
            });
        },
        head: function (key) {
            return __awaiter(this, void 0, void 0, function () {
                var _a, _b;
                return __generator(this, function (_c) {
                    (0, index_js_1.validateObjectKey)(key);
                    return [2 /*return*/, (_b = (_a = objects.get(key)) === null || _a === void 0 ? void 0 : _a.metadata) !== null && _b !== void 0 ? _b : null];
                });
            });
        },
        read: function (key) {
            return __awaiter(this, void 0, void 0, function () {
                var item;
                return __generator(this, function (_a) {
                    (0, index_js_1.validateObjectKey)(key);
                    item = objects.get(key);
                    return [2 /*return*/, item
                            ? {
                                metadata: item.metadata,
                                body: (function () {
                                    return __asyncGenerator(this, arguments, function () {
                                        return __generator(this, function (_a) {
                                            switch (_a.label) {
                                                case 0: return [4 /*yield*/, __await(item.body.slice())];
                                                case 1: return [4 /*yield*/, _a.sent()];
                                                case 2:
                                                    _a.sent();
                                                    return [2 /*return*/];
                                            }
                                        });
                                    });
                                })(),
                            }
                            : null];
                });
            });
        },
        remove: function (key) {
            return __awaiter(this, void 0, void 0, function () {
                return __generator(this, function (_a) {
                    (0, index_js_1.validateObjectKey)(key);
                    objects.delete(key);
                    return [2 /*return*/];
                });
            });
        },
        signUpload: function () {
            return __awaiter(this, void 0, void 0, function () {
                return __generator(this, function (_a) {
                    throw new index_js_1.StorageUnavailableError("Memory storage cannot issue external upload URLs.");
                });
            });
        },
        signDownload: function () {
            return __awaiter(this, void 0, void 0, function () {
                return __generator(this, function (_a) {
                    throw new index_js_1.StorageUnavailableError("Memory storage cannot issue external download URLs.");
                });
            });
        },
    };
}
var signedFields = function (kind, fields, secret) {
    return (0, node_crypto_1.createHmac)("sha256", secret)
        .update(JSON.stringify(__spreadArray([
        kind
    ], Object.entries(fields)
        .filter(function (_a) {
        var key = _a[0];
        return key !== "sig";
    })
        .sort(function (_a, _b) {
        var a = _a[0];
        var b = _b[0];
        return a.localeCompare(b);
    }), true)))
        .digest("hex");
};
function verifyFields(input, kind) {
    var _a, _b;
    var expiry = Number(input.fields.expires);
    var now = ((_a = input.now) !== null && _a !== void 0 ? _a : new Date()).getTime();
    if (!input.signingSecret ||
        !Number.isSafeInteger(expiry) ||
        expiry <= now ||
        expiry > now + 900000 ||
        !/^[a-f0-9]{64}$/.test((_b = input.fields.sig) !== null && _b !== void 0 ? _b : ""))
        throw new Error("Invalid or expired object signature.");
    var expected = signedFields(kind, input.fields, input.signingSecret);
    if (!(0, node_crypto_1.timingSafeEqual)(Buffer.from(expected, "hex"), Buffer.from(input.fields.sig, "hex")))
        throw new Error("Invalid object signature.");
}
function verifyFilesystemUpload(input) {
    var _a, _b, _c;
    verifyFields(input, "upload");
    var metadata = {
        key: (_a = input.fields.key) !== null && _a !== void 0 ? _a : "",
        byteSize: Number(input.fields.byteSize),
        contentType: (_b = input.fields.contentType) !== null && _b !== void 0 ? _b : "",
        checksumSha256: (_c = input.fields.checksumSha256) !== null && _c !== void 0 ? _c : "",
    };
    (0, index_js_1.validateObjectInput)(metadata);
    return metadata;
}
function verifyFilesystemDownload(input) {
    var _a;
    verifyFields(input, "download");
    var key = (_a = input.fields.key) !== null && _a !== void 0 ? _a : "";
    (0, index_js_1.validateObjectKey)(key);
    return __assign({ key: key }, (input.fields.filename ? { filename: input.fields.filename } : {}));
}
function createFilesystemStorage(options) {
    var _this = this;
    var pathFor = function (key) {
        (0, index_js_1.validateObjectKey)(key);
        return (0, node_path_1.join)(options.directory, key);
    };
    var head = function (key) { return __awaiter(_this, void 0, void 0, function () {
        var metadata, _a, _b, error_1;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    _c.trys.push([0, 2, , 3]);
                    _b = (_a = JSON).parse;
                    return [4 /*yield*/, (0, promises_1.readFile)("".concat(pathFor(key), ".metadata.json"), "utf8")];
                case 1:
                    metadata = _b.apply(_a, [_c.sent()]);
                    (0, index_js_1.validateObjectInput)(metadata);
                    return [2 /*return*/, metadata];
                case 2:
                    error_1 = _c.sent();
                    if (error_1.code === "ENOENT")
                        return [2 /*return*/, null];
                    throw error_1;
                case 3: return [2 /*return*/];
            }
        });
    }); };
    return {
        put: function (input) {
            return __awaiter(this, void 0, void 0, function () {
                var metadata, existing, path, error_2, _a, _b;
                return __generator(this, function (_c) {
                    switch (_c.label) {
                        case 0:
                            metadata = {
                                key: input.key,
                                byteSize: input.body.byteLength,
                                contentType: input.contentType,
                                checksumSha256: input.checksumSha256,
                            };
                            (0, index_js_1.validateObjectInput)(metadata);
                            if ((0, node_crypto_1.createHash)("sha256").update(input.body).digest("hex") !== metadata.checksumSha256)
                                throw new Error("Object checksum does not match content.");
                            return [4 /*yield*/, head(input.key)];
                        case 1:
                            existing = _c.sent();
                            if (existing) {
                                if (existing.checksumSha256 !== metadata.checksumSha256 ||
                                    existing.contentType !== metadata.contentType)
                                    throw new Error("Object key is immutable.");
                                return [2 /*return*/, existing];
                            }
                            path = pathFor(input.key);
                            return [4 /*yield*/, (0, promises_1.mkdir)((0, node_path_1.dirname)(path), { recursive: true })];
                        case 2:
                            _c.sent();
                            _c.label = 3;
                        case 3:
                            _c.trys.push([3, 5, , 7]);
                            return [4 /*yield*/, (0, promises_1.writeFile)(path, input.body, { flag: "wx", mode: 384 })];
                        case 4:
                            _c.sent();
                            return [3 /*break*/, 7];
                        case 5:
                            error_2 = _c.sent();
                            if (error_2.code !== "EEXIST")
                                throw error_2;
                            _b = (_a = (0, node_crypto_1.createHash)("sha256"))
                                .update;
                            return [4 /*yield*/, (0, promises_1.readFile)(path)];
                        case 6:
                            if (_b.apply(_a, [_c.sent()])
                                .digest("hex") !== metadata.checksumSha256)
                                throw new Error("Object key is immutable.");
                            return [3 /*break*/, 7];
                        case 7: return [4 /*yield*/, (0, promises_1.writeFile)("".concat(path, ".metadata.json"), JSON.stringify(metadata), { mode: 384 })];
                        case 8:
                            _c.sent();
                            return [2 /*return*/, metadata];
                    }
                });
            });
        },
        head: head,
        read: function (key) {
            return __awaiter(this, void 0, void 0, function () {
                var metadata, bytes;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0: return [4 /*yield*/, head(key)];
                        case 1:
                            metadata = _a.sent();
                            if (!metadata)
                                return [2 /*return*/, null];
                            return [4 /*yield*/, (0, promises_1.readFile)(pathFor(key))];
                        case 2:
                            bytes = _a.sent();
                            if (bytes.byteLength !== metadata.byteSize ||
                                (0, node_crypto_1.createHash)("sha256").update(bytes).digest("hex") !== metadata.checksumSha256)
                                throw new Error("Stored object checksum mismatch.");
                            return [2 /*return*/, {
                                    metadata: metadata,
                                    body: (function () {
                                        return __asyncGenerator(this, arguments, function () {
                                            return __generator(this, function (_a) {
                                                switch (_a.label) {
                                                    case 0: return [4 /*yield*/, __await(bytes)];
                                                    case 1: return [4 /*yield*/, _a.sent()];
                                                    case 2:
                                                        _a.sent();
                                                        return [2 /*return*/];
                                                }
                                            });
                                        });
                                    })(),
                                }];
                    }
                });
            });
        },
        remove: function (key) {
            return __awaiter(this, void 0, void 0, function () {
                var _this = this;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0: return [4 /*yield*/, Promise.all([pathFor(key), "".concat(pathFor(key), ".metadata.json")].map(function (path) { return __awaiter(_this, void 0, void 0, function () {
                                var error_3;
                                return __generator(this, function (_a) {
                                    switch (_a.label) {
                                        case 0:
                                            _a.trys.push([0, 2, , 3]);
                                            return [4 /*yield*/, (0, promises_1.unlink)(path)];
                                        case 1:
                                            _a.sent();
                                            return [3 /*break*/, 3];
                                        case 2:
                                            error_3 = _a.sent();
                                            if (error_3.code !== "ENOENT")
                                                throw error_3;
                                            return [3 /*break*/, 3];
                                        case 3: return [2 /*return*/];
                                    }
                                });
                            }); }))];
                        case 1:
                            _a.sent();
                            return [2 /*return*/];
                    }
                });
            });
        },
        signUpload: function (input) {
            return __awaiter(this, void 0, void 0, function () {
                var seconds, expiresAt, fields;
                var _a;
                return __generator(this, function (_b) {
                    if (!options.signingSecret || !options.publicBaseUrl)
                        throw new index_js_1.StorageUnavailableError("Filesystem signing endpoint is not configured.");
                    (0, index_js_1.validateObjectInput)(input);
                    seconds = (_a = input.expiresInSeconds) !== null && _a !== void 0 ? _a : 300;
                    if (!Number.isInteger(seconds) || seconds < 1 || seconds > 900)
                        throw new Error("Invalid object signature expiry.");
                    expiresAt = new Date(Date.now() + seconds * 1000);
                    fields = {
                        key: input.key,
                        byteSize: String(input.byteSize),
                        contentType: input.contentType,
                        checksumSha256: input.checksumSha256,
                        expires: String(expiresAt.getTime()),
                    };
                    fields.sig = signedFields("upload", fields, options.signingSecret);
                    return [2 /*return*/, {
                            url: "".concat(options.publicBaseUrl.replace(/\/$/, ""), "/api/cloud/storage/upload"),
                            method: "POST",
                            fields: fields,
                            headers: {},
                            expiresAt: expiresAt,
                        }];
                });
            });
        },
        signDownload: function (input) {
            return __awaiter(this, void 0, void 0, function () {
                var seconds, expiresAt, fields;
                var _a;
                return __generator(this, function (_b) {
                    if (!options.signingSecret || !options.publicBaseUrl)
                        throw new index_js_1.StorageUnavailableError("Filesystem signing endpoint is not configured.");
                    (0, index_js_1.validateObjectKey)(input.key);
                    seconds = (_a = input.expiresInSeconds) !== null && _a !== void 0 ? _a : 300;
                    if (!Number.isInteger(seconds) || seconds < 1 || seconds > 900)
                        throw new Error("Invalid object signature expiry.");
                    expiresAt = new Date(Date.now() + seconds * 1000);
                    fields = __assign({ key: input.key, expires: String(expiresAt.getTime()) }, (input.filename ? { filename: input.filename } : {}));
                    fields.sig = signedFields("download", fields, options.signingSecret);
                    return [2 /*return*/, {
                            url: "".concat(options.publicBaseUrl.replace(/\/$/, ""), "/api/cloud/storage/download?").concat(new URLSearchParams(fields).toString()),
                            method: "GET",
                            headers: {},
                            expiresAt: expiresAt,
                        }];
                });
            });
        },
    };
}
//# sourceMappingURL=local.js.map