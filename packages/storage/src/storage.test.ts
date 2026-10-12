import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vite-plus/test";
import {
  createFilesystemStorage,
  createMemoryStorage,
  verifyFilesystemUpload,
  verifyFilesystemDownload,
  createS3Storage,
} from "./index.js";

const bytes = new TextEncoder().encode("可信文件内容");
const checksum = createHash("sha256").update(bytes).digest("hex");
describe("private object transport", () => {
  it("reads old directory objects, writes new objects to the current directory and removes both copies", async () => {
    const root = await mkdtemp(join(tmpdir(), "raypx-storage-migration-"));
    try {
      const directory = join(root, "current");
      const legacyDirectory = join(root, "previous");
      const previous = createFilesystemStorage({ directory: legacyDirectory });
      const current = createFilesystemStorage({ directory });
      const storage = createFilesystemStorage({ directory, legacyDirectory });
      const object = {
        key: "cloud/old/version",
        body: bytes,
        contentType: "text/plain",
        checksumSha256: checksum,
      };
      await previous.put(object);
      expect(await storage.head(object.key)).toMatchObject({ checksumSha256: checksum });
      const read = await storage.read(object.key);
      const chunks: Uint8Array[] = [];
      for await (const chunk of read!.body) chunks.push(chunk);
      expect(Buffer.concat(chunks).toString()).toBe("可信文件内容");
      await expect(storage.put({ ...object, contentType: "text/html" })).rejects.toThrow(
        "immutable",
      );
      await storage.put({ ...object, key: "cloud/new/version" });
      expect(await current.head("cloud/new/version")).not.toBeNull();
      expect(await previous.head("cloud/new/version")).toBeNull();
      await current.put({ ...object, contentType: "text/html" });
      expect(await storage.head(object.key)).toMatchObject({ contentType: "text/html" });
      await storage.remove(object.key);
      expect(await current.head(object.key)).toBeNull();
      expect(await previous.head(object.key)).toBeNull();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
  it("signs S3 POST policies with exact byte size, media type and verified SHA256", async () => {
    const storage = createS3Storage({
      bucket: "private-raypx",
      region: "us-east-1",
      credentials: { accessKeyId: "test-key", secretAccessKey: "test-secret" },
    });
    try {
      const signed = await storage.signUpload({
        key: "cloud/account/asset",
        byteSize: bytes.byteLength,
        contentType: "text/plain",
        checksumSha256: checksum,
        expiresInSeconds: 60,
      });
      const policy = JSON.parse(Buffer.from(signed.fields.Policy!, "base64").toString("utf8")) as {
        conditions: unknown[];
      };
      expect(signed.method).toBe("POST");
      expect(policy.conditions).toContainEqual([
        "content-length-range",
        bytes.byteLength,
        bytes.byteLength,
      ]);
      expect(policy.conditions).toContainEqual(["eq", "$Content-Type", "text/plain"]);
      expect(policy.conditions).toContainEqual([
        "eq",
        "$x-amz-checksum-sha256",
        Buffer.from(checksum, "hex").toString("base64"),
      ]);
      await expect(
        storage.signDownload({ key: "cloud/account/asset", expiresInSeconds: 3600 }),
      ).rejects.toThrow("900");
    } finally {
      await storage.close?.();
    }
  });
  it("verifies immutable checksums, copies content and rejects traversal", async () => {
    const storage = createMemoryStorage();
    await storage.put({
      key: "cloud/file/version",
      body: bytes,
      contentType: "text/plain",
      checksumSha256: checksum,
    });
    await expect(
      storage.put({
        key: "cloud/file/version",
        body: bytes,
        contentType: "text/plain",
        checksumSha256: "0".repeat(64),
      }),
    ).rejects.toThrow("checksum");
    await expect(storage.head("../private")).rejects.toThrow("key");
    const read = await storage.read("cloud/file/version");
    const chunks = [];
    for await (const chunk of read!.body) chunks.push(chunk);
    expect(Buffer.concat(chunks).toString()).toBe("可信文件内容");
    await storage.remove("cloud/file/version");
    expect(await storage.head("cloud/file/version")).toBeNull();
  });
  it("signs exact upload metadata, checks expiry, and separates upload/download signatures", async () => {
    const directory = await mkdtemp(join(tmpdir(), "raypx-storage-test-"));
    try {
      const storage = createFilesystemStorage({
        directory,
        signingSecret: "test-secret",
        publicBaseUrl: "http://localhost:3002",
      });
      const request = await storage.signUpload({
        key: "cloud/asset/version",
        byteSize: bytes.byteLength,
        contentType: "text/plain",
        checksumSha256: checksum,
      });
      expect(request.method).toBe("POST");
      expect(
        verifyFilesystemUpload({ fields: request.fields, signingSecret: "test-secret" }).byteSize,
      ).toBe(bytes.byteLength);
      expect(() =>
        verifyFilesystemUpload({
          fields: { ...request.fields, byteSize: "1000" },
          signingSecret: "test-secret",
        }),
      ).toThrow("signature");
      expect(() =>
        verifyFilesystemUpload({
          fields: request.fields,
          signingSecret: "test-secret",
          now: new Date(request.expiresAt.getTime() + 1),
        }),
      ).toThrow("expired");
      expect(() =>
        verifyFilesystemDownload({ fields: request.fields, signingSecret: "test-secret" }),
      ).toThrow("signature");
      await storage.put({
        key: "cloud/asset/version",
        body: bytes,
        contentType: "text/plain",
        checksumSha256: checksum,
      });
      const download = await storage.signDownload({
        key: "cloud/asset/version",
        filename: "分析.txt",
      });
      const fields = Object.fromEntries(new URL(download.url).searchParams);
      expect(verifyFilesystemDownload({ fields, signingSecret: "test-secret" })).toEqual({
        key: "cloud/asset/version",
        filename: "分析.txt",
      });
      expect(await storage.head("cloud/asset/version")).toMatchObject({
        byteSize: bytes.byteLength,
        checksumSha256: checksum,
      });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
