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
Object.defineProperty(exports, "__esModule", { value: true });
exports.StorageUnavailableError = exports.verifyFilesystemDownload = exports.verifyFilesystemUpload = exports.createMemoryStorage = exports.createFilesystemStorage = exports.createS3Storage = void 0;
exports.validateObjectKey = validateObjectKey;
exports.validateObjectInput = validateObjectInput;
var s3_js_1 = require("./s3.js");
Object.defineProperty(exports, "createS3Storage", { enumerable: true, get: function () { return s3_js_1.createS3Storage; } });
var local_js_1 = require("./local.js");
Object.defineProperty(exports, "createFilesystemStorage", { enumerable: true, get: function () { return local_js_1.createFilesystemStorage; } });
Object.defineProperty(exports, "createMemoryStorage", { enumerable: true, get: function () { return local_js_1.createMemoryStorage; } });
Object.defineProperty(exports, "verifyFilesystemUpload", { enumerable: true, get: function () { return local_js_1.verifyFilesystemUpload; } });
Object.defineProperty(exports, "verifyFilesystemDownload", { enumerable: true, get: function () { return local_js_1.verifyFilesystemDownload; } });
var StorageUnavailableError = /** @class */ (function (_super) {
    __extends(StorageUnavailableError, _super);
    function StorageUnavailableError(message) {
        if (message === void 0) { message = "Object storage is not configured."; }
        var _this = _super.call(this, message) || this;
        _this.code = "STORAGE_UNAVAILABLE";
        _this.name = "StorageUnavailableError";
        return _this;
    }
    return StorageUnavailableError;
}(Error));
exports.StorageUnavailableError = StorageUnavailableError;
function validateObjectKey(key) {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9/_\-.]{0,511}$/.test(key) ||
        key.split("/").some(function (part) { return !part || part === "." || part === ".."; }))
        throw new Error("Invalid object key.");
}
function validateObjectInput(input) {
    validateObjectKey(input.key);
    if (!Number.isSafeInteger(input.byteSize) ||
        input.byteSize < 0 ||
        !/^[a-f0-9]{64}$/.test(input.checksumSha256) ||
        !/^[\w.+-]+\/[\w.+-]+$/.test(input.contentType))
        throw new Error("Invalid object metadata.");
}
//# sourceMappingURL=index.js.map