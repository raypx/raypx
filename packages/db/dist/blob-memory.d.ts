import type { BlobDownload, BlobStorageRepository, BlobUpload } from "@voidmix/core";
export declare class InMemoryBlobStorageRepository implements BlobStorageRepository {
    private readonly options;
    readonly uploads: any;
    readonly blobs: any;
    constructor(options?: {
        now?: () => Date;
        id?: () => string;
        uploadTtlMs?: number;
    });
    createUpload(input: Parameters<BlobStorageRepository["createUpload"]>[0]): Promise<BlobUpload>;
    completeUpload(input: Parameters<BlobStorageRepository["completeUpload"]>[0]): Promise<{
        blobHash: any;
        byteSize: any;
        contentType: any;
    }>;
    getDownload(input: {
        workspaceId: string;
        blobHash: string;
    }): Promise<BlobDownload | null>;
    delete(input: {
        workspaceId: string;
        blobHash: string;
    }): Promise<void>;
}
//# sourceMappingURL=blob-memory.d.ts.map