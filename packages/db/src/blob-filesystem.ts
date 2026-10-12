import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { BlobDownload, BlobStorageRepository, BlobUpload } from "@raypx/core";
import { AssetDomainError } from "@raypx/core";
import { defaultClock, defaultIdGenerator } from "@raypx/shared";

const MAX_BLOB_SIZE = 10 * 1024 * 1024;

/** Durable local object storage used by the API when BLOB_STORAGE_DIR is configured. */
export class FileSystemBlobStorageRepository implements BlobStorageRepository {
  private readonly uploads = new Map<string, BlobUpload>();

  constructor(
    private readonly root: string,
    private readonly options: {
      now?: () => Date;
      id?: () => string;
      uploadTtlMs?: number;
      legacyRoot?: string;
    } = {},
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
    await mkdir(this.uploadDirectory(upload.workspaceId), { recursive: true });
    await writeFile(this.blobPath(upload.workspaceId, input.blobHash), bytes);
    await writeFile(
      this.metadataPath(upload.workspaceId, input.blobHash),
      JSON.stringify({ contentType: input.contentType }),
      "utf8",
    );
    this.uploads.delete(input.uploadId);
    await Promise.all(
      this.roots.map((root) => rm(this.uploadPath(input.uploadId, root), { force: true })),
    );
    return { blobHash: input.blobHash, byteSize: bytes.byteLength, contentType: input.contentType };
  }

  async getDownload(input: {
    workspaceId: string;
    blobHash: string;
  }): Promise<BlobDownload | null> {
    for (const root of this.roots) {
      try {
        const bytes = new Uint8Array(
          await readFile(this.blobPath(input.workspaceId, input.blobHash, root)),
        );
        const metadata = JSON.parse(
          await readFile(this.metadataPath(input.workspaceId, input.blobHash, root), "utf8"),
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
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    }
    return null;
  }

  async delete(input: { workspaceId: string; blobHash: string }): Promise<void> {
    await Promise.all(
      this.roots.flatMap((root) => [
        rm(this.blobPath(input.workspaceId, input.blobHash, root), { force: true }),
        rm(this.metadataPath(input.workspaceId, input.blobHash, root), { force: true }),
      ]),
    );
  }

  private assertSize(byteSize: number): void {
    if (!Number.isSafeInteger(byteSize) || byteSize < 0 || byteSize > MAX_BLOB_SIZE) {
      throw new AssetDomainError("BLOB_TOO_LARGE", "Blob exceeds the 10 MiB limit.");
    }
  }

  private now(): Date {
    return (this.options.now ?? defaultClock.now)();
  }
  private get roots(): string[] {
    return [this.root, ...(this.options.legacyRoot ? [this.options.legacyRoot] : [])];
  }
  private uploadDirectory(workspaceId: string, root = this.root): string {
    return join(root, encodeURIComponent(workspaceId));
  }
  private blobPath(workspaceId: string, hash: string, root = this.root): string {
    return join(this.uploadDirectory(workspaceId, root), `${hash}.blob`);
  }
  private metadataPath(workspaceId: string, hash: string, root = this.root): string {
    return join(this.uploadDirectory(workspaceId, root), `${hash}.json`);
  }
  private uploadPath(id: string, root = this.root): string {
    return join(root, "uploads", `${encodeURIComponent(id)}.json`);
  }
  private async getUpload(id: string): Promise<BlobUpload | undefined> {
    const memory = this.uploads.get(id);
    if (memory) return memory;
    for (const root of this.roots) {
      try {
        const stored = JSON.parse(await readFile(this.uploadPath(id, root), "utf8")) as Omit<
          BlobUpload,
          "expiresAt"
        > & {
          expiresAt: string;
        };
        return { ...stored, expiresAt: new Date(stored.expiresAt) };
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    }
    return undefined;
  }
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}
