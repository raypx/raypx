import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { BlobDownload, BlobStorageRepository, BlobUpload } from "@voidmix/core";
import { AssetDomainError } from "@voidmix/core";
import { defaultClock, defaultIdGenerator } from "@voidmix/shared";

const MAX_BLOB_SIZE = 10 * 1024 * 1024;

/** Durable local object storage used by the API when BLOB_STORAGE_DIR is configured. */
export class FileSystemBlobStorageRepository implements BlobStorageRepository {
  private readonly uploads = new Map<string, BlobUpload>();

  constructor(
    private readonly root: string,
    private readonly options: { now?: () => Date; id?: () => string; uploadTtlMs?: number } = {},
  ) {}

  async createUpload(
    input: Parameters<BlobStorageRepository["createUpload"]>[0],
  ): Promise<BlobUpload> {
    this.assertSize(input.byteSize);
    const now = (this.options.now ?? defaultClock.now)();
    const upload: BlobUpload = {
      ...input,
      id: (this.options.id ?? defaultIdGenerator.next)(),
      expiresAt: new Date(now.getTime() + (this.options.uploadTtlMs ?? 15 * 60 * 1000)),
    };
    this.uploads.set(upload.id, upload);
    await mkdir(this.uploadDirectory(upload.workspaceId), { recursive: true });
    await mkdir(join(this.root, "uploads"), { recursive: true });
    await writeFile(this.uploadPath(upload.id), JSON.stringify(upload), "utf8");
    return upload;
  }

  async completeUpload(input: Parameters<BlobStorageRepository["completeUpload"]>[0]) {
    const upload = await this.getUpload(input.uploadId);
    if (!upload || upload.actorId !== input.actorId || upload.expiresAt <= this.now()) {
      throw new AssetDomainError("BLOB_UPLOAD_EXPIRED", "Blob upload is missing or expired.");
    }
    if (
      (input.workspaceId !== undefined && upload.workspaceId !== input.workspaceId) ||
      upload.byteSize !== input.byteSize ||
      upload.contentType !== input.contentType ||
      upload.expectedHash !== input.blobHash ||
      !input.body
    ) {
      throw new AssetDomainError(
        "BLOB_CHECKSUM_MISMATCH",
        "Blob upload metadata or body is invalid.",
      );
    }
    const bytes = new Uint8Array(input.body);
    if (bytes.byteLength !== input.byteSize || sha256(bytes) !== input.blobHash) {
      throw new AssetDomainError(
        "BLOB_CHECKSUM_MISMATCH",
        "Blob checksum does not match the body.",
      );
    }
    await writeFile(this.blobPath(upload.workspaceId, input.blobHash), bytes);
    await writeFile(
      this.metadataPath(upload.workspaceId, input.blobHash),
      JSON.stringify({ contentType: input.contentType }),
      "utf8",
    );
    this.uploads.delete(input.uploadId);
    await rm(this.uploadPath(input.uploadId), { force: true });
    return { blobHash: input.blobHash, byteSize: bytes.byteLength, contentType: input.contentType };
  }

  async getDownload(input: {
    workspaceId: string;
    blobHash: string;
  }): Promise<BlobDownload | null> {
    try {
      const bytes = new Uint8Array(
        await readFile(this.blobPath(input.workspaceId, input.blobHash)),
      );
      const metadata = JSON.parse(
        await readFile(this.metadataPath(input.workspaceId, input.blobHash), "utf8"),
      ) as { contentType?: string };
      return {
        blobHash: input.blobHash,
        byteSize: bytes.byteLength,
        contentType: metadata.contentType ?? null,
        body: (async function* () {
          yield bytes;
        })(),
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  }

  async delete(input: { workspaceId: string; blobHash: string }): Promise<void> {
    await rm(this.blobPath(input.workspaceId, input.blobHash), { force: true });
    await rm(this.metadataPath(input.workspaceId, input.blobHash), { force: true });
  }

  private assertSize(byteSize: number): void {
    if (!Number.isSafeInteger(byteSize) || byteSize < 0 || byteSize > MAX_BLOB_SIZE) {
      throw new AssetDomainError("BLOB_TOO_LARGE", "Blob exceeds the 10 MiB limit.");
    }
  }

  private now(): Date {
    return (this.options.now ?? defaultClock.now)();
  }
  private uploadDirectory(workspaceId: string): string {
    return join(this.root, encodeURIComponent(workspaceId));
  }
  private blobPath(workspaceId: string, hash: string): string {
    return join(this.uploadDirectory(workspaceId), `${hash}.blob`);
  }
  private metadataPath(workspaceId: string, hash: string): string {
    return join(this.uploadDirectory(workspaceId), `${hash}.json`);
  }
  private uploadPath(id: string): string {
    return join(this.root, "uploads", `${encodeURIComponent(id)}.json`);
  }
  private async getUpload(id: string): Promise<BlobUpload | undefined> {
    const memory = this.uploads.get(id);
    if (memory) return memory;
    try {
      const stored = JSON.parse(await readFile(this.uploadPath(id), "utf8")) as Omit<
        BlobUpload,
        "expiresAt"
      > & {
        expiresAt: string;
      };
      return { ...stored, expiresAt: new Date(stored.expiresAt) };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
      throw error;
    }
  }
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}
