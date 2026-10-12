import type { BlobDownload, BlobStorageRepository, BlobUpload } from "@voidmix/core";
import { AssetDomainError } from "@voidmix/core";
import { defaultClock, defaultIdGenerator } from "@voidmix/shared";
import { createHash } from "node:crypto";

export class InMemoryBlobStorageRepository implements BlobStorageRepository {
  readonly uploads = new Map<string, BlobUpload>();
  readonly blobs = new Map<
    string,
    { workspaceId: string; bytes: Uint8Array; contentType: string }
  >();
  constructor(
    private readonly options: { now?: () => Date; id?: () => string; uploadTtlMs?: number } = {},
  ) {}
  async createUpload(
    input: Parameters<BlobStorageRepository["createUpload"]>[0],
  ): Promise<BlobUpload> {
    if (input.byteSize < 0 || input.byteSize > 10 * 1024 * 1024)
      throw new AssetDomainError("BLOB_TOO_LARGE", "Blob exceeds the 10 MiB limit.");
    const now = (this.options.now ?? defaultClock.now)();
    const upload = {
      ...input,
      id: (this.options.id ?? defaultIdGenerator.next)(),
      expiresAt: new Date(now.getTime() + (this.options.uploadTtlMs ?? 15 * 60 * 1000)),
    };
    this.uploads.set(upload.id, upload);
    return upload;
  }
  async completeUpload(input: Parameters<BlobStorageRepository["completeUpload"]>[0]) {
    const upload = this.uploads.get(input.uploadId);
    if (
      !upload ||
      upload.actorId !== input.actorId ||
      upload.expiresAt <= (this.options.now ?? defaultClock.now)()
    )
      throw new AssetDomainError("BLOB_UPLOAD_EXPIRED", "Blob upload is missing or expired.");
    if (
      (input.workspaceId !== undefined && upload.workspaceId !== input.workspaceId) ||
      upload.byteSize !== input.byteSize ||
      upload.contentType !== input.contentType ||
      upload.expectedHash !== input.blobHash
    )
      throw new AssetDomainError("BLOB_CHECKSUM_MISMATCH", "Blob upload metadata does not match.");
    if (!input.body) throw new AssetDomainError("BLOB_CHECKSUM_MISMATCH", "Blob body is required.");
    const bytes = new Uint8Array(input.body);
    if (
      bytes.byteLength !== input.byteSize ||
      createHash("sha256").update(bytes).digest("hex") !== input.blobHash
    )
      throw new AssetDomainError("BLOB_CHECKSUM_MISMATCH", "Blob size does not match.");
    this.blobs.set(`${upload.workspaceId}:${input.blobHash}`, {
      workspaceId: upload.workspaceId,
      bytes,
      contentType: input.contentType,
    });
    this.uploads.delete(input.uploadId);
    return { blobHash: input.blobHash, byteSize: input.byteSize, contentType: input.contentType };
  }
  async getDownload(input: {
    workspaceId: string;
    blobHash: string;
  }): Promise<BlobDownload | null> {
    const blob = this.blobs.get(`${input.workspaceId}:${input.blobHash}`);
    if (!blob || blob.workspaceId !== input.workspaceId) return null;
    return {
      blobHash: input.blobHash,
      byteSize: blob.bytes.byteLength,
      contentType: blob.contentType,
      body: (async function* () {
        yield new Uint8Array(blob.bytes);
      })(),
    };
  }
  async delete(input: { workspaceId: string; blobHash: string }): Promise<void> {
    const blob = this.blobs.get(`${input.workspaceId}:${input.blobHash}`);
    if (blob?.workspaceId === input.workspaceId)
      this.blobs.delete(`${input.workspaceId}:${input.blobHash}`);
  }
}
