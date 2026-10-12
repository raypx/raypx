import type { ObjectStorage } from "@voidmix/core";
export interface S3StorageOptions {
    bucket: string;
    region: string;
    endpoint?: string;
    forcePathStyle?: boolean;
    credentials?: {
        accessKeyId: string;
        secretAccessKey: string;
    };
}
export declare function createS3Storage(options: S3StorageOptions): ObjectStorage;
//# sourceMappingURL=s3.d.ts.map