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
Object.defineProperty(exports, "__esModule", { value: true });
exports.FileSystemBlobStorageRepository = void 0;
var node_crypto_1 = require("node:crypto");
var promises_1 = require("node:fs/promises");
var node_path_1 = require("node:path");
var core_1 = require("@voidmix/core");
var shared_1 = require("@voidmix/shared");
var MAX_BLOB_SIZE = 10 * 1024 * 1024;
/** Durable local object storage used by the API when BLOB_STORAGE_DIR is configured. */
var FileSystemBlobStorageRepository = /** @class */ (function () {
    function FileSystemBlobStorageRepository(root, options) {
        if (options === void 0) { options = {}; }
        this.root = root;
        this.options = options;
        this.uploads = new Map();
    }
    FileSystemBlobStorageRepository.prototype.createUpload = function (input) {
        return __awaiter(this, void 0, void 0, function () {
            var now, upload;
            var _a, _b, _c;
            return __generator(this, function (_d) {
                switch (_d.label) {
                    case 0:
                        this.assertSize(input.byteSize);
                        now = ((_a = this.options.now) !== null && _a !== void 0 ? _a : shared_1.defaultClock.now)();
                        upload = __assign(__assign({}, input), { id: ((_b = this.options.id) !== null && _b !== void 0 ? _b : shared_1.defaultIdGenerator.next)(), expiresAt: new Date(now.getTime() + ((_c = this.options.uploadTtlMs) !== null && _c !== void 0 ? _c : 15 * 60 * 1000)) });
                        this.uploads.set(upload.id, upload);
                        return [4 /*yield*/, (0, promises_1.mkdir)(this.uploadDirectory(upload.workspaceId), { recursive: true })];
                    case 1:
                        _d.sent();
                        return [4 /*yield*/, (0, promises_1.mkdir)((0, node_path_1.join)(this.root, "uploads"), { recursive: true })];
                    case 2:
                        _d.sent();
                        return [4 /*yield*/, (0, promises_1.writeFile)(this.uploadPath(upload.id), JSON.stringify(upload), "utf8")];
                    case 3:
                        _d.sent();
                        return [2 /*return*/, upload];
                }
            });
        });
    };
    FileSystemBlobStorageRepository.prototype.completeUpload = function (input) {
        return __awaiter(this, void 0, void 0, function () {
            var upload, bytes;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.getUpload(input.uploadId)];
                    case 1:
                        upload = _a.sent();
                        if (!upload || upload.actorId !== input.actorId || upload.expiresAt <= this.now()) {
                            throw new core_1.AssetDomainError("BLOB_UPLOAD_EXPIRED", "Blob upload is missing or expired.");
                        }
                        if ((input.workspaceId !== undefined && upload.workspaceId !== input.workspaceId) ||
                            upload.byteSize !== input.byteSize ||
                            upload.contentType !== input.contentType ||
                            upload.expectedHash !== input.blobHash ||
                            !input.body) {
                            throw new core_1.AssetDomainError("BLOB_CHECKSUM_MISMATCH", "Blob upload metadata or body is invalid.");
                        }
                        bytes = new Uint8Array(input.body);
                        if (bytes.byteLength !== input.byteSize || sha256(bytes) !== input.blobHash) {
                            throw new core_1.AssetDomainError("BLOB_CHECKSUM_MISMATCH", "Blob checksum does not match the body.");
                        }
                        return [4 /*yield*/, (0, promises_1.writeFile)(this.blobPath(upload.workspaceId, input.blobHash), bytes)];
                    case 2:
                        _a.sent();
                        return [4 /*yield*/, (0, promises_1.writeFile)(this.metadataPath(upload.workspaceId, input.blobHash), JSON.stringify({ contentType: input.contentType }), "utf8")];
                    case 3:
                        _a.sent();
                        this.uploads.delete(input.uploadId);
                        return [4 /*yield*/, (0, promises_1.rm)(this.uploadPath(input.uploadId), { force: true })];
                    case 4:
                        _a.sent();
                        return [2 /*return*/, { blobHash: input.blobHash, byteSize: bytes.byteLength, contentType: input.contentType }];
                }
            });
        });
    };
    FileSystemBlobStorageRepository.prototype.getDownload = function (input) {
        return __awaiter(this, void 0, void 0, function () {
            var bytes_1, _a, metadata, _b, _c, error_1;
            var _d;
            return __generator(this, function (_e) {
                switch (_e.label) {
                    case 0:
                        _e.trys.push([0, 3, , 4]);
                        _a = Uint8Array.bind;
                        return [4 /*yield*/, (0, promises_1.readFile)(this.blobPath(input.workspaceId, input.blobHash))];
                    case 1:
                        bytes_1 = new (_a.apply(Uint8Array, [void 0, _e.sent()]))();
                        _c = (_b = JSON).parse;
                        return [4 /*yield*/, (0, promises_1.readFile)(this.metadataPath(input.workspaceId, input.blobHash), "utf8")];
                    case 2:
                        metadata = _c.apply(_b, [_e.sent()]);
                        return [2 /*return*/, {
                                blobHash: input.blobHash,
                                byteSize: bytes_1.byteLength,
                                contentType: (_d = metadata.contentType) !== null && _d !== void 0 ? _d : null,
                                body: (function () {
                                    return __asyncGenerator(this, arguments, function () {
                                        return __generator(this, function (_a) {
                                            switch (_a.label) {
                                                case 0: return [4 /*yield*/, __await(bytes_1)];
                                                case 1: return [4 /*yield*/, _a.sent()];
                                                case 2:
                                                    _a.sent();
                                                    return [2 /*return*/];
                                            }
                                        });
                                    });
                                })(),
                            }];
                    case 3:
                        error_1 = _e.sent();
                        if (error_1.code === "ENOENT")
                            return [2 /*return*/, null];
                        throw error_1;
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    FileSystemBlobStorageRepository.prototype.delete = function (input) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, (0, promises_1.rm)(this.blobPath(input.workspaceId, input.blobHash), { force: true })];
                    case 1:
                        _a.sent();
                        return [4 /*yield*/, (0, promises_1.rm)(this.metadataPath(input.workspaceId, input.blobHash), { force: true })];
                    case 2:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        });
    };
    FileSystemBlobStorageRepository.prototype.assertSize = function (byteSize) {
        if (!Number.isSafeInteger(byteSize) || byteSize < 0 || byteSize > MAX_BLOB_SIZE) {
            throw new core_1.AssetDomainError("BLOB_TOO_LARGE", "Blob exceeds the 10 MiB limit.");
        }
    };
    FileSystemBlobStorageRepository.prototype.now = function () {
        var _a;
        return ((_a = this.options.now) !== null && _a !== void 0 ? _a : shared_1.defaultClock.now)();
    };
    FileSystemBlobStorageRepository.prototype.uploadDirectory = function (workspaceId) {
        return (0, node_path_1.join)(this.root, encodeURIComponent(workspaceId));
    };
    FileSystemBlobStorageRepository.prototype.blobPath = function (workspaceId, hash) {
        return (0, node_path_1.join)(this.uploadDirectory(workspaceId), "".concat(hash, ".blob"));
    };
    FileSystemBlobStorageRepository.prototype.metadataPath = function (workspaceId, hash) {
        return (0, node_path_1.join)(this.uploadDirectory(workspaceId), "".concat(hash, ".json"));
    };
    FileSystemBlobStorageRepository.prototype.uploadPath = function (id) {
        return (0, node_path_1.join)(this.root, "uploads", "".concat(encodeURIComponent(id), ".json"));
    };
    FileSystemBlobStorageRepository.prototype.getUpload = function (id) {
        return __awaiter(this, void 0, void 0, function () {
            var memory, stored, _a, _b, error_2;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        memory = this.uploads.get(id);
                        if (memory)
                            return [2 /*return*/, memory];
                        _c.label = 1;
                    case 1:
                        _c.trys.push([1, 3, , 4]);
                        _b = (_a = JSON).parse;
                        return [4 /*yield*/, (0, promises_1.readFile)(this.uploadPath(id), "utf8")];
                    case 2:
                        stored = _b.apply(_a, [_c.sent()]);
                        return [2 /*return*/, __assign(__assign({}, stored), { expiresAt: new Date(stored.expiresAt) })];
                    case 3:
                        error_2 = _c.sent();
                        if (error_2.code === "ENOENT")
                            return [2 /*return*/, undefined];
                        throw error_2;
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    return FileSystemBlobStorageRepository;
}());
exports.FileSystemBlobStorageRepository = FileSystemBlobStorageRepository;
function sha256(bytes) {
    return (0, node_crypto_1.createHash)("sha256").update(bytes).digest("hex");
}
//# sourceMappingURL=blob-filesystem.js.map