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
var __asyncValues = (this && this.__asyncValues) || function (o) {
    if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
    var m = o[Symbol.asyncIterator], i;
    return m ? m.call(o) : (o = typeof __values === "function" ? __values(o) : o[Symbol.iterator](), i = {}, verb("next"), verb("throw"), verb("return"), i[Symbol.asyncIterator] = function () { return this; }, i);
    function verb(n) { i[n] = o[n] && function (v) { return new Promise(function (resolve, reject) { v = o[n](v), settle(resolve, reject, v.done, v.value); }); }; }
    function settle(resolve, reject, d, v) { Promise.resolve(v).then(function(v) { resolve({ value: v, done: d }); }, reject); }
};
Object.defineProperty(exports, "__esModule", { value: true });
var node_crypto_1 = require("node:crypto");
var promises_1 = require("node:fs/promises");
var node_os_1 = require("node:os");
var node_path_1 = require("node:path");
var test_1 = require("vite-plus/test");
var blob_filesystem_js_1 = require("./blob-filesystem.js");
(0, test_1.describe)("FileSystemBlobStorageRepository", function () {
    (0, test_1.it)("persists a checked blob and its upload metadata across instances", function () { return __awaiter(void 0, void 0, void 0, function () {
        var root, body, hash, first, second, download, chunks, _a, _b, _c, chunk, e_1_1;
        var _d, e_1, _e, _f;
        var _g;
        return __generator(this, function (_h) {
            switch (_h.label) {
                case 0: return [4 /*yield*/, (0, promises_1.mkdtemp)((0, node_path_1.join)((0, node_os_1.tmpdir)(), "voidmix-blobs-"))];
                case 1:
                    root = _h.sent();
                    _h.label = 2;
                case 2:
                    _h.trys.push([2, , 18, 20]);
                    body = new TextEncoder().encode("hello");
                    hash = (0, node_crypto_1.createHash)("sha256").update(body).digest("hex");
                    first = new blob_filesystem_js_1.FileSystemBlobStorageRepository(root, { id: function () { return "upload-1"; } });
                    return [4 /*yield*/, first.createUpload({
                            workspaceId: "workspace-1",
                            actorId: "user-1",
                            byteSize: body.byteLength,
                            contentType: "text/plain",
                            expectedHash: hash,
                        })];
                case 3:
                    _h.sent();
                    second = new blob_filesystem_js_1.FileSystemBlobStorageRepository(root);
                    return [4 /*yield*/, second.completeUpload({
                            uploadId: "upload-1",
                            actorId: "user-1",
                            byteSize: body.byteLength,
                            contentType: "text/plain",
                            blobHash: hash,
                            body: body,
                        })];
                case 4:
                    _h.sent();
                    return [4 /*yield*/, second.getDownload({ workspaceId: "workspace-1", blobHash: hash })];
                case 5:
                    download = _h.sent();
                    (0, test_1.expect)(download === null || download === void 0 ? void 0 : download.contentType).toBe("text/plain");
                    chunks = [];
                    _h.label = 6;
                case 6:
                    _h.trys.push([6, 11, 12, 17]);
                    _a = true, _b = __asyncValues((_g = download === null || download === void 0 ? void 0 : download.body) !== null && _g !== void 0 ? _g : []);
                    _h.label = 7;
                case 7: return [4 /*yield*/, _b.next()];
                case 8:
                    if (!(_c = _h.sent(), _d = _c.done, !_d)) return [3 /*break*/, 10];
                    _f = _c.value;
                    _a = false;
                    chunk = _f;
                    chunks.push(chunk);
                    _h.label = 9;
                case 9:
                    _a = true;
                    return [3 /*break*/, 7];
                case 10: return [3 /*break*/, 17];
                case 11:
                    e_1_1 = _h.sent();
                    e_1 = { error: e_1_1 };
                    return [3 /*break*/, 17];
                case 12:
                    _h.trys.push([12, , 15, 16]);
                    if (!(!_a && !_d && (_e = _b.return))) return [3 /*break*/, 14];
                    return [4 /*yield*/, _e.call(_b)];
                case 13:
                    _h.sent();
                    _h.label = 14;
                case 14: return [3 /*break*/, 16];
                case 15:
                    if (e_1) throw e_1.error;
                    return [7 /*endfinally*/];
                case 16: return [7 /*endfinally*/];
                case 17:
                    (0, test_1.expect)(Buffer.concat(chunks.map(function (chunk) { return Buffer.from(chunk); })).toString()).toBe("hello");
                    return [3 /*break*/, 20];
                case 18: return [4 /*yield*/, (0, promises_1.rm)(root, { recursive: true, force: true })];
                case 19:
                    _h.sent();
                    return [7 /*endfinally*/];
                case 20: return [2 /*return*/];
            }
        });
    }); });
    (0, test_1.it)("rejects a body whose checksum does not match", function () { return __awaiter(void 0, void 0, void 0, function () {
        var root, repository;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, promises_1.mkdtemp)((0, node_path_1.join)((0, node_os_1.tmpdir)(), "voidmix-blobs-"))];
                case 1:
                    root = _a.sent();
                    _a.label = 2;
                case 2:
                    _a.trys.push([2, , 5, 7]);
                    repository = new blob_filesystem_js_1.FileSystemBlobStorageRepository(root, { id: function () { return "upload-1"; } });
                    return [4 /*yield*/, repository.createUpload({
                            workspaceId: "workspace-1",
                            actorId: "user-1",
                            byteSize: 5,
                            contentType: "text/plain",
                            expectedHash: "0000000000000000000000000000000000000000000000000000000000000000",
                        })];
                case 3:
                    _a.sent();
                    return [4 /*yield*/, (0, test_1.expect)(repository.completeUpload({
                            uploadId: "upload-1",
                            actorId: "user-1",
                            byteSize: 5,
                            contentType: "text/plain",
                            blobHash: "0000000000000000000000000000000000000000000000000000000000000000",
                            body: new TextEncoder().encode("hello"),
                        })).rejects.toMatchObject({ code: "BLOB_CHECKSUM_MISMATCH" })];
                case 4:
                    _a.sent();
                    return [3 /*break*/, 7];
                case 5: return [4 /*yield*/, (0, promises_1.rm)(root, { recursive: true, force: true })];
                case 6:
                    _a.sent();
                    return [7 /*endfinally*/];
                case 7: return [2 /*return*/];
            }
        });
    }); });
});
//# sourceMappingURL=blob-filesystem.test.js.map