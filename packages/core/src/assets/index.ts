import { DomainError } from "@voidmix/shared";

export type AssetDomainErrorCode =
  | "BLOB_NOT_FOUND"
  | "BLOB_TOO_LARGE"
  | "BLOB_UNSUPPORTED_MEDIA_TYPE"
  | "BLOB_CHECKSUM_MISMATCH"
  | "BLOB_UPLOAD_EXPIRED";

/** Error raised when an asset invariant is violated. */
export class AssetDomainError extends DomainError<AssetDomainErrorCode> {
  constructor(code: AssetDomainErrorCode, message: string) {
    super(code, message);
    this.name = "AssetDomainError";
  }
}

export interface BlobUpload {
  id: string;
  workspaceId: string;
  actorId: string;
  byteSize: number;
  contentType: string;
  expectedHash: string;
  expiresAt: Date;
}

export interface BlobDownload {
  blobHash: string;
  byteSize: number;
  contentType: string | null;
  body: AsyncIterable<Uint8Array>;
}

export interface BlobStorageRepository {
  createUpload(input: {
    workspaceId: string;
    actorId: string;
    byteSize: number;
    contentType: string;
    expectedHash: string;
  }): Promise<BlobUpload>;
  completeUpload(input: {
    uploadId: string;
    workspaceId?: string;
    actorId: string;
    byteSize: number;
    contentType: string;
    blobHash: string;
    body?: Uint8Array;
  }): Promise<{ blobHash: string; byteSize: number; contentType: string }>;
  getDownload(input: { workspaceId: string; blobHash: string }): Promise<BlobDownload | null>;
  delete(input: { workspaceId: string; blobHash: string }): Promise<void>;
}
