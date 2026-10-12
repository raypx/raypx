import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { describe, expect, it, vi } from "vite-plus/test";

const publication = vi.hoisted(() => ({ pause: undefined as (() => Promise<void>) | undefined }));
vi.mock("node:fs/promises", async (importOriginal) => {
  const fs = await importOriginal<typeof import("node:fs/promises")>();
  return {
    ...fs,
    async link(...args: Parameters<typeof fs.link>) {
      await fs.link(...args);
      if (basename(String(args[1])) === "version") await publication.pause?.();
    },
    async rename(...args: Parameters<typeof fs.rename>) {
      await fs.rename(...args);
      if (basename(String(args[0])) === "object" && basename(String(args[1])) !== "object")
        await publication.pause?.();
    },
  };
});
import {
  createFilesystemStorage,
  createMemoryStorage,
  verifyFilesystemUpload,
  verifyFilesystemDownload,
  createS3Storage,
  type ObjectStorage,
} from "./index.js";

const bytes = new TextEncoder().encode("可信文件内容");
const checksum = createHash("sha256").update(bytes).digest("hex");
async function content(storage: ObjectStorage, key: string) {
  const stored = await storage.read(key);
  if (!stored) throw new Error("Object is missing.");
  const chunks: Uint8Array[] = [];
  for await (const chunk of stored.body) chunks.push(chunk);
  return Buffer.concat(chunks);
}
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
  it("publishes one immutable metadata value across concurrent filesystem writers", async () => {
    const directory = await mkdtemp(join(tmpdir(), "raypx-storage-race-"));
    const first = createFilesystemStorage({ directory });
    const second = createFilesystemStorage({ directory });
    try {
      const input = {
        key: "cloud/file/version",
        body: bytes,
        checksumSha256: checksum,
      };
      const results = await Promise.allSettled([
        first.put({ ...input, contentType: "text/plain" }),
        second.put({ ...input, contentType: "text/html" }),
      ]);
      expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
      const rejected = results.find((result) => result.status === "rejected");
      expect(rejected?.reason).toBeInstanceOf(Error);
      expect(rejected?.reason.message).toMatch(/immutable/);
      const winner = results.find((result) => result.status === "fulfilled")!.value;
      expect(await first.head(input.key)).toEqual(winner);
      expect(await second.head(input.key)).toEqual(winner);
      expect(await content(first, input.key)).toEqual(Buffer.from(bytes));
      await expect(
        Promise.all([
          first.put({ ...input, contentType: winner.contentType }),
          second.put({ ...input, contentType: winner.contentType }),
        ]),
      ).resolves.toEqual([winner, winner]);
      expect(
        (await readdir(directory, { recursive: true })).some((path) => path.includes(".raypx-")),
      ).toBe(false);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
  it("recovers an unpublished content file without replacing different immutable bytes", async () => {
    const directory = await mkdtemp(join(tmpdir(), "raypx-storage-recovery-"));
    const storage = createFilesystemStorage({ directory });
    try {
      const input = {
        key: "cloud/file/version",
        body: bytes,
        contentType: "text/plain",
        checksumSha256: checksum,
      };
      await mkdir(join(directory, "cloud/file"), { recursive: true });
      await writeFile(join(directory, input.key), bytes);
      expect(await storage.head(input.key)).toBeNull();
      const published = await storage.put(input);
      expect(await storage.head(input.key)).toEqual(published);
      await writeFile(join(directory, "cloud/file/conflict"), "different bytes");
      await expect(storage.put({ ...input, key: "cloud/file/conflict" })).rejects.toThrow(
        "immutable",
      );
      expect(await storage.head("cloud/file/conflict")).toBeNull();
      expect(await readFile(join(directory, "cloud/file/conflict"), "utf8")).toBe(
        "different bytes",
      );
      expect((await readdir(join(directory, "cloud/file"))).sort()).toEqual([
        "conflict",
        "version",
      ]);
      expect(
        (await readdir(directory, { recursive: true })).some((path) => path.includes(".raypx-")),
      ).toBe(false);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
  it("repairs old metadata-only objects and keeps prefix-related keys independent", async () => {
    const directory = await mkdtemp(join(tmpdir(), "raypx-storage-layout-"));
    const storage = createFilesystemStorage({ directory });
    const input = {
      key: "cloud/file/version",
      body: bytes,
      contentType: "text/plain",
      checksumSha256: checksum,
    };
    try {
      await mkdir(join(directory, "cloud/file"), { recursive: true });
      await writeFile(
        join(directory, `${input.key}.metadata.json`),
        JSON.stringify({
          key: input.key,
          contentType: input.contentType,
          checksumSha256: input.checksumSha256,
          byteSize: bytes.byteLength,
        }),
      );
      await expect(storage.put({ ...input, contentType: "text/html" })).rejects.toThrow(
        "immutable",
      );
      await storage.put(input);
      expect(await content(storage, input.key)).toEqual(Buffer.from(bytes));
      await writeFile(join(directory, input.key), bytes);
      const child = { ...input, key: `${input.key}/child` };
      await storage.put(child);
      await storage.remove(input.key);
      expect(await storage.head(input.key)).toBeNull();
      expect(await content(storage, child.key)).toEqual(Buffer.from(bytes));
      await storage.remove(child.key);
      expect(await storage.head(child.key)).toBeNull();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
  it("creates and removes a new parent key without deleting flat-layout children", async () => {
    const directory = await mkdtemp(join(tmpdir(), "raypx-storage-prefix-migration-"));
    const storage = createFilesystemStorage({ directory });
    const input = {
      key: "cloud/file/parent",
      body: bytes,
      contentType: "text/plain",
      checksumSha256: checksum,
    };
    const child = `${input.key}/child`;
    try {
      await mkdir(join(directory, input.key), { recursive: true });
      await writeFile(join(directory, child), bytes);
      await writeFile(
        join(directory, `${child}.metadata.json`),
        JSON.stringify({
          key: child,
          contentType: input.contentType,
          checksumSha256: checksum,
          byteSize: bytes.byteLength,
        }),
      );
      await storage.put(input);
      expect(await content(storage, input.key)).toEqual(Buffer.from(bytes));
      await storage.remove(input.key);
      expect(await storage.head(input.key)).toBeNull();
      expect(await content(storage, child)).toEqual(Buffer.from(bytes));
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
  it("removes a concurrently published object without leaving readable metadata alone", async () => {
    const directory = await mkdtemp(join(tmpdir(), "raypx-storage-delete-race-"));
    const first = createFilesystemStorage({ directory });
    const second = createFilesystemStorage({ directory });
    let published!: () => void;
    let release!: () => void;
    const ready = new Promise<void>((resolve) => (published = resolve));
    const resume = new Promise<void>((resolve) => (release = resolve));
    publication.pause = async () => {
      published();
      await resume;
    };
    const input = {
      key: "cloud/file/version",
      body: bytes,
      contentType: "text/plain",
      checksumSha256: checksum,
    };
    const pending = first.put(input);
    try {
      await Promise.race([
        ready,
        pending.then(() => {
          throw new Error("The publication boundary was not observed.");
        }),
      ]);
      await second.remove(input.key);
      release();
      await pending;
      expect(await second.head(input.key)).toBeNull();
      expect(await second.read(input.key)).toBeNull();
      publication.pause = undefined;
      const retried = await first.put(input);
      expect(await second.head(input.key)).toEqual(retried);
      expect(await second.read(input.key)).not.toBeNull();
    } finally {
      release();
      publication.pause = undefined;
      await pending.catch(() => {});
      await rm(directory, { recursive: true, force: true });
    }
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
