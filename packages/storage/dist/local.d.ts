import type { ObjectStorage } from "@voidmix/core";
export declare function createMemoryStorage(): ObjectStorage;
export declare function verifyFilesystemUpload(input: {
    fields: Record<string, string>;
    signingSecret: string;
    now?: Date;
}): {
    key: string;
    byteSize: number;
    contentType: string;
    checksumSha256: string;
};
export declare function verifyFilesystemDownload(input: {
    fields: Record<string, string>;
    signingSecret: string;
    now?: Date;
}): {
    key: string;
    filename?: string;
};
export declare function createFilesystemStorage(options: {
    directory: string;
    signingSecret?: string;
    publicBaseUrl?: string;
}): ObjectStorage;
//# sourceMappingURL=local.d.ts.map