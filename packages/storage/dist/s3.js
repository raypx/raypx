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
Object.defineProperty(exports, "__esModule", { value: true });
exports.createS3Storage = createS3Storage;
var node_crypto_1 = require("node:crypto");
var client_s3_1 = require("@aws-sdk/client-s3");
var s3_presigned_post_1 = require("@aws-sdk/s3-presigned-post");
var s3_request_presigner_1 = require("@aws-sdk/s3-request-presigner");
var index_js_1 = require("./index.js");
var expires = function (value) {
    if (value === void 0) { value = 300; }
    if (!Number.isInteger(value) || value < 1 || value > 900)
        throw new Error("Object signature expiry must be between 1 and 900 seconds.");
    return value;
};
function createS3Storage(options) {
    var _this = this;
    if (!options.bucket || !options.region)
        throw new Error("S3 bucket and region are required.");
    var client = new client_s3_1.S3Client(__assign(__assign(__assign({ region: options.region, requestHandler: { connectionTimeout: 5000, requestTimeout: 30000 } }, (options.endpoint ? { endpoint: options.endpoint } : {})), (options.forcePathStyle === undefined ? {} : { forcePathStyle: options.forcePathStyle })), (options.credentials ? { credentials: options.credentials } : {})));
    var head = function (key) { return __awaiter(_this, void 0, void 0, function () {
        var result, checksum, error_1, value;
        var _a, _b, _c;
        return __generator(this, function (_d) {
            switch (_d.label) {
                case 0:
                    (0, index_js_1.validateObjectKey)(key);
                    _d.label = 1;
                case 1:
                    _d.trys.push([1, 3, , 4]);
                    return [4 /*yield*/, client.send(new client_s3_1.HeadObjectCommand({ Bucket: options.bucket, Key: key, ChecksumMode: "ENABLED" }))];
                case 2:
                    result = _d.sent();
                    checksum = result.ChecksumSHA256;
                    if (!checksum || !/^[A-Za-z0-9+/]{43}=$/.test(checksum))
                        throw new Error("Stored object has no verifiable SHA256 checksum.");
                    return [2 /*return*/, {
                            key: key,
                            byteSize: (_a = result.ContentLength) !== null && _a !== void 0 ? _a : 0,
                            contentType: (_b = result.ContentType) !== null && _b !== void 0 ? _b : "application/octet-stream",
                            checksumSha256: Buffer.from(checksum, "base64").toString("hex"),
                        }];
                case 3:
                    error_1 = _d.sent();
                    value = error_1;
                    if (value.name === "NotFound" ||
                        value.name === "NoSuchKey" ||
                        ((_c = value.$metadata) === null || _c === void 0 ? void 0 : _c.httpStatusCode) === 404)
                        return [2 /*return*/, null];
                    throw error_1;
                case 4: return [2 /*return*/];
            }
        });
    }); };
    return {
        close: function () {
            return __awaiter(this, void 0, void 0, function () {
                return __generator(this, function (_a) {
                    client.destroy();
                    return [2 /*return*/];
                });
            });
        },
        put: function (input) {
            return __awaiter(this, void 0, void 0, function () {
                var metadata, existing, error_2, raced;
                var _a;
                return __generator(this, function (_b) {
                    switch (_b.label) {
                        case 0:
                            metadata = {
                                key: input.key,
                                byteSize: input.body.byteLength,
                                contentType: input.contentType,
                                checksumSha256: input.checksumSha256,
                            };
                            (0, index_js_1.validateObjectInput)(metadata);
                            if ((0, node_crypto_1.createHash)("sha256").update(input.body).digest("hex") !== input.checksumSha256)
                                throw new Error("Object checksum does not match content.");
                            return [4 /*yield*/, head(input.key)];
                        case 1:
                            existing = _b.sent();
                            if (existing) {
                                if (existing.checksumSha256 !== metadata.checksumSha256 ||
                                    existing.byteSize !== metadata.byteSize ||
                                    existing.contentType !== metadata.contentType)
                                    throw new Error("Object key is immutable.");
                                return [2 /*return*/, existing];
                            }
                            _b.label = 2;
                        case 2:
                            _b.trys.push([2, 4, , 6]);
                            return [4 /*yield*/, client.send(new client_s3_1.PutObjectCommand({
                                    Bucket: options.bucket,
                                    Key: input.key,
                                    Body: input.body,
                                    ContentType: input.contentType,
                                    ChecksumSHA256: Buffer.from(input.checksumSha256, "hex").toString("base64"),
                                    IfNoneMatch: "*",
                                }))];
                        case 3:
                            _b.sent();
                            return [3 /*break*/, 6];
                        case 4:
                            error_2 = _b.sent();
                            if (((_a = error_2.$metadata) === null || _a === void 0 ? void 0 : _a.httpStatusCode) !== 412)
                                throw error_2;
                            return [4 /*yield*/, head(input.key)];
                        case 5:
                            raced = _b.sent();
                            if (!raced ||
                                raced.checksumSha256 !== metadata.checksumSha256 ||
                                raced.contentType !== metadata.contentType ||
                                raced.byteSize !== metadata.byteSize)
                                throw new Error("Object key is immutable.");
                            return [3 /*break*/, 6];
                        case 6: return [2 /*return*/, metadata];
                    }
                });
            });
        },
        head: head,
        read: function (key) {
            return __awaiter(this, void 0, void 0, function () {
                var metadata, result;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0: return [4 /*yield*/, head(key)];
                        case 1:
                            metadata = _a.sent();
                            if (!metadata)
                                return [2 /*return*/, null];
                            return [4 /*yield*/, client.send(new client_s3_1.GetObjectCommand({ Bucket: options.bucket, Key: key, ChecksumMode: "ENABLED" }))];
                        case 2:
                            result = _a.sent();
                            if (!result.Body)
                                throw new Error("Stored object has no body.");
                            return [2 /*return*/, { metadata: metadata, body: result.Body }];
                    }
                });
            });
        },
        remove: function (key) {
            return __awaiter(this, void 0, void 0, function () {
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0:
                            (0, index_js_1.validateObjectKey)(key);
                            return [4 /*yield*/, client.send(new client_s3_1.DeleteObjectCommand({ Bucket: options.bucket, Key: key }))];
                        case 1:
                            _a.sent();
                            return [2 /*return*/];
                    }
                });
            });
        },
        signUpload: function (input) {
            return __awaiter(this, void 0, void 0, function () {
                var duration, checksum, signed;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0:
                            (0, index_js_1.validateObjectInput)(input);
                            duration = expires(input.expiresInSeconds);
                            checksum = Buffer.from(input.checksumSha256, "hex").toString("base64");
                            return [4 /*yield*/, (0, s3_presigned_post_1.createPresignedPost)(client, {
                                    Bucket: options.bucket,
                                    Key: input.key,
                                    Expires: duration,
                                    Fields: {
                                        "Content-Type": input.contentType,
                                        "x-amz-checksum-sha256": checksum,
                                        "x-amz-checksum-algorithm": "SHA256",
                                    },
                                    Conditions: [
                                        ["content-length-range", input.byteSize, input.byteSize],
                                        ["eq", "$Content-Type", input.contentType],
                                        ["eq", "$x-amz-checksum-sha256", checksum],
                                        ["eq", "$x-amz-checksum-algorithm", "SHA256"],
                                    ],
                                })];
                        case 1:
                            signed = _a.sent();
                            return [2 /*return*/, __assign(__assign({}, signed), { method: "POST", headers: {}, expiresAt: new Date(Date.now() + duration * 1000) })];
                    }
                });
            });
        },
        signDownload: function (input) {
            return __awaiter(this, void 0, void 0, function () {
                var duration, disposition, url;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0:
                            (0, index_js_1.validateObjectKey)(input.key);
                            duration = expires(input.expiresInSeconds);
                            disposition = input.filename
                                ? "attachment; filename*=UTF-8''".concat(encodeURIComponent(input.filename.replace(/[\r\n]/g, "")))
                                : undefined;
                            return [4 /*yield*/, (0, s3_request_presigner_1.getSignedUrl)(client, new client_s3_1.GetObjectCommand(__assign({ Bucket: options.bucket, Key: input.key }, (disposition ? { ResponseContentDisposition: disposition } : {}))), { expiresIn: duration })];
                        case 1:
                            url = _a.sent();
                            return [2 /*return*/, { url: url, method: "GET", headers: {}, expiresAt: new Date(Date.now() + duration * 1000) }];
                    }
                });
            });
        },
    };
}
//# sourceMappingURL=s3.js.map