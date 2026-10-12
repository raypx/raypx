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
  it("signs S3 POST policies with exact byte size, media type and verified SHA256", async () => {
    const storage = createS3Storage({
      bucket: "private-voidmix",
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
    const directory = await mkdtemp(join(tmpdir(), "voidmix-storage-test-"));
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
