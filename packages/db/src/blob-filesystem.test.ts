import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vite-plus/test";

import { FileSystemBlobStorageRepository } from "./blob-filesystem.js";

describe("FileSystemBlobStorageRepository", () => {
  it("persists a checked blob and its upload metadata across instances", async () => {
    const root = await mkdtemp(join(tmpdir(), "voidmix-blobs-"));
    try {
      const body = new TextEncoder().encode("hello");
      const hash = createHash("sha256").update(body).digest("hex");
      const first = new FileSystemBlobStorageRepository(root, { id: () => "upload-1" });
      await first.createUpload({
        workspaceId: "workspace-1",
        actorId: "user-1",
        byteSize: body.byteLength,
        contentType: "text/plain",
        expectedHash: hash,
      });
      const second = new FileSystemBlobStorageRepository(root);
      await second.completeUpload({
        uploadId: "upload-1",
        actorId: "user-1",
        byteSize: body.byteLength,
        contentType: "text/plain",
        blobHash: hash,
        body,
      });
      const download = await second.getDownload({ workspaceId: "workspace-1", blobHash: hash });
      expect(download?.contentType).toBe("text/plain");
      const chunks: Uint8Array[] = [];
      for await (const chunk of download?.body ?? []) chunks.push(chunk);
      expect(Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))).toString()).toBe("hello");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("rejects a body whose checksum does not match", async () => {
    const root = await mkdtemp(join(tmpdir(), "voidmix-blobs-"));
    try {
      const repository = new FileSystemBlobStorageRepository(root, { id: () => "upload-1" });
      await repository.createUpload({
        workspaceId: "workspace-1",
        actorId: "user-1",
        byteSize: 5,
        contentType: "text/plain",
        expectedHash: "0000000000000000000000000000000000000000000000000000000000000000",
      });
      await expect(
        repository.completeUpload({
          uploadId: "upload-1",
          actorId: "user-1",
          byteSize: 5,
          contentType: "text/plain",
          blobHash: "0000000000000000000000000000000000000000000000000000000000000000",
          body: new TextEncoder().encode("hello"),
        }),
      ).rejects.toMatchObject({ code: "BLOB_CHECKSUM_MISMATCH" });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
