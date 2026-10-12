import type { BlobDownload, BlobStorageRepository, BlobUpload } from "@voidmix/core";
/** Durable local object storage used by the API when BLOB_STORAGE_DIR is configured. */
export declare class FileSystemBlobStorageRepository implements BlobStorageRepository {
    private readonly root;
    private readonly options;
    private readonly uploads;
    constructor(root: string, options?: {
        now?: () => Date;
        id?: () => string;
        uploadTtlMs?: number;
    });
    createUpload(input: Parameters<BlobStorageRepository["createUpload"]>[0]): Promise<BlobUpload>;
    completeUpload(input: Parameters<BlobStorageRepository["completeUpload"]>[0]): Promise<{
        blobHash: any;
        byteSize: number;
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
    private assertSize;
    private now;
    private uploadDirectory;
    private blobPath;
    private metadataPath;
    private uploadPath;
    private getUpload;
}
//# sourceMappingURL=blob-filesystem.d.ts.map