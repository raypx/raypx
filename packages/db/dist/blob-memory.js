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
exports.InMemoryBlobStorageRepository = void 0;
var core_1 = require("@voidmix/core");
var shared_1 = require("@voidmix/shared");
var node_crypto_1 = require("node:crypto");
var InMemoryBlobStorageRepository = /** @class */ (function () {
    function InMemoryBlobStorageRepository(options) {
        if (options === void 0) { options = {}; }
        this.options = options;
        this.uploads = new Map();
        this.blobs = new Map();
    }
    InMemoryBlobStorageRepository.prototype.createUpload = function (input) {
        return __awaiter(this, void 0, void 0, function () {
            var now, upload;
            var _a, _b, _c;
            return __generator(this, function (_d) {
                if (input.byteSize < 0 || input.byteSize > 10 * 1024 * 1024)
                    throw new core_1.AssetDomainError("BLOB_TOO_LARGE", "Blob exceeds the 10 MiB limit.");
                now = ((_a = this.options.now) !== null && _a !== void 0 ? _a : shared_1.defaultClock.now)();
                upload = __assign(__assign({}, input), { id: ((_b = this.options.id) !== null && _b !== void 0 ? _b : shared_1.defaultIdGenerator.next)(), expiresAt: new Date(now.getTime() + ((_c = this.options.uploadTtlMs) !== null && _c !== void 0 ? _c : 15 * 60 * 1000)) });
                this.uploads.set(upload.id, upload);
                return [2 /*return*/, upload];
            });
        });
    };
    InMemoryBlobStorageRepository.prototype.completeUpload = function (input) {
        return __awaiter(this, void 0, void 0, function () {
            var upload, bytes;
            var _a;
            return __generator(this, function (_b) {
                upload = this.uploads.get(input.uploadId);
                if (!upload ||
                    upload.actorId !== input.actorId ||
                    upload.expiresAt <= ((_a = this.options.now) !== null && _a !== void 0 ? _a : shared_1.defaultClock.now)())
                    throw new core_1.AssetDomainError("BLOB_UPLOAD_EXPIRED", "Blob upload is missing or expired.");
                if ((input.workspaceId !== undefined && upload.workspaceId !== input.workspaceId) ||
                    upload.byteSize !== input.byteSize ||
                    upload.contentType !== input.contentType ||
                    upload.expectedHash !== input.blobHash)
                    throw new core_1.AssetDomainError("BLOB_CHECKSUM_MISMATCH", "Blob upload metadata does not match.");
                if (!input.body)
                    throw new core_1.AssetDomainError("BLOB_CHECKSUM_MISMATCH", "Blob body is required.");
                bytes = new Uint8Array(input.body);
                if (bytes.byteLength !== input.byteSize ||
                    (0, node_crypto_1.createHash)("sha256").update(bytes).digest("hex") !== input.blobHash)
                    throw new core_1.AssetDomainError("BLOB_CHECKSUM_MISMATCH", "Blob size does not match.");
                this.blobs.set("".concat(upload.workspaceId, ":").concat(input.blobHash), {
                    workspaceId: upload.workspaceId,
                    bytes: bytes,
                    contentType: input.contentType,
                });
                this.uploads.delete(input.uploadId);
                return [2 /*return*/, { blobHash: input.blobHash, byteSize: input.byteSize, contentType: input.contentType }];
            });
        });
    };
    InMemoryBlobStorageRepository.prototype.getDownload = function (input) {
        return __awaiter(this, void 0, void 0, function () {
            var blob;
            return __generator(this, function (_a) {
                blob = this.blobs.get("".concat(input.workspaceId, ":").concat(input.blobHash));
                if (!blob || blob.workspaceId !== input.workspaceId)
                    return [2 /*return*/, null];
                return [2 /*return*/, {
                        blobHash: input.blobHash,
                        byteSize: blob.bytes.byteLength,
                        contentType: blob.contentType,
                        body: (function () {
                            return __asyncGenerator(this, arguments, function () {
                                return __generator(this, function (_a) {
                                    switch (_a.label) {
                                        case 0: return [4 /*yield*/, __await(new Uint8Array(blob.bytes))];
                                        case 1: return [4 /*yield*/, _a.sent()];
                                        case 2:
                                            _a.sent();
                                            return [2 /*return*/];
                                    }
                                });
                            });
                        })(),
                    }];
            });
        });
    };
    InMemoryBlobStorageRepository.prototype.delete = function (input) {
        return __awaiter(this, void 0, void 0, function () {
            var blob;
            return __generator(this, function (_a) {
                blob = this.blobs.get("".concat(input.workspaceId, ":").concat(input.blobHash));
                if ((blob === null || blob === void 0 ? void 0 : blob.workspaceId) === input.workspaceId)
                    this.blobs.delete("".concat(input.workspaceId, ":").concat(input.blobHash));
                return [2 /*return*/];
            });
        });
    };
    return InMemoryBlobStorageRepository;
}());
exports.InMemoryBlobStorageRepository = InMemoryBlobStorageRepository;
//# sourceMappingURL=blob-memory.js.map