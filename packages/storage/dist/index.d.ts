export { createS3Storage } from "./s3.js";
export { createFilesystemStorage, createMemoryStorage, verifyFilesystemUpload, verifyFilesystemDownload, } from "./local.js";
export type { ObjectMetadata, ObjectStorage, SignedObjectRequest, SignedObjectUpload, } from "@voidmix/core";
export declare class StorageUnavailableError extends Error {
    readonly code = "STORAGE_UNAVAILABLE";
    constructor(message?: string);
}
export declare function validateObjectKey(key: string): void;
export declare function validateObjectInput(input: {
    key: string;
    byteSize: number;
    contentType: string;
    checksumSha256: string;
}): void;
//# sourceMappingURL=index.d.ts.map