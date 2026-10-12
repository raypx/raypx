import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, writeFile, unlink } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { ObjectMetadata, ObjectStorage } from "@voidmix/core";
import { StorageUnavailableError, validateObjectInput, validateObjectKey } from "./index.js";

export function createMemoryStorage(): ObjectStorage {
  const objects = new Map<string, { metadata: ObjectMetadata; body: Uint8Array }>();
  return {
    async put(input) {
      const metadata = {
        key: input.key,
        byteSize: input.body.byteLength,
        contentType: input.contentType,
        checksumSha256: input.checksumSha256,
      };
      validateObjectInput(metadata);
      if (createHash("sha256").update(input.body).digest("hex") !== input.checksumSha256)
        throw new Error("Object checksum does not match content.");
      const existing = objects.get(input.key);
      if (
        existing &&
        (existing.metadata.checksumSha256 !== metadata.checksumSha256 ||
          existing.metadata.contentType !== metadata.contentType)
      )
        throw new Error("Object key is immutable.");
      objects.set(input.key, { metadata, body: input.body.slice() });
      return metadata;
    },
    async head(key) {
      validateObjectKey(key);
      return objects.get(key)?.metadata ?? null;
    },
    async read(key) {
      validateObjectKey(key);
      const item = objects.get(key);
      return item
        ? {
            metadata: item.metadata,
            body: (async function* () {
              yield item.body.slice();
            })(),
          }
        : null;
    },
    async remove(key) {
      validateObjectKey(key);
      objects.delete(key);
    },
    async signUpload() {
      throw new StorageUnavailableError("Memory storage cannot issue external upload URLs.");
    },
    async signDownload() {
      throw new StorageUnavailableError("Memory storage cannot issue external download URLs.");
    },
  };
}

const signedFields = (
  kind: "upload" | "download",
  fields: Record<string, string>,
  secret: string,
) =>
  createHmac("sha256", secret)
    .update(
      JSON.stringify([
        kind,
        ...Object.entries(fields)
          .filter(([key]) => key !== "sig")
          .sort(([a], [b]) => a.localeCompare(b)),
      ]),
    )
    .digest("hex");
function verifyFields(
  input: { fields: Record<string, string>; signingSecret: string; now?: Date },
  kind: "upload" | "download",
): void {
  const expiry = Number(input.fields.expires);
  const now = (input.now ?? new Date()).getTime();
  if (
    !input.signingSecret ||
    !Number.isSafeInteger(expiry) ||
    expiry <= now ||
    expiry > now + 900_000 ||
    !/^[a-f0-9]{64}$/.test(input.fields.sig ?? "")
  )
    throw new Error("Invalid or expired object signature.");
  const expected = signedFields(kind, input.fields, input.signingSecret);
  if (!timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(input.fields.sig!, "hex")))
    throw new Error("Invalid object signature.");
}
export function verifyFilesystemUpload(input: {
  fields: Record<string, string>;
  signingSecret: string;
  now?: Date;
}): { key: string; byteSize: number; contentType: string; checksumSha256: string } {
  verifyFields(input, "upload");
  const metadata = {
    key: input.fields.key ?? "",
    byteSize: Number(input.fields.byteSize),
    contentType: input.fields.contentType ?? "",
    checksumSha256: input.fields.checksumSha256 ?? "",
  };
  validateObjectInput(metadata);
  return metadata;
}
export function verifyFilesystemDownload(input: {
  fields: Record<string, string>;
  signingSecret: string;
  now?: Date;
}): { key: string; filename?: string } {
  verifyFields(input, "download");
  const key = input.fields.key ?? "";
  validateObjectKey(key);
  return { key, ...(input.fields.filename ? { filename: input.fields.filename } : {}) };
}
export function createFilesystemStorage(options: {
  directory: string;
  signingSecret?: string;
  publicBaseUrl?: string;
}): ObjectStorage {
  const pathFor = (key: string) => {
    validateObjectKey(key);
    return join(options.directory, key);
  };
  const head: ObjectStorage["head"] = async (key) => {
    try {
      const metadata = JSON.parse(
        await readFile(`${pathFor(key)}.metadata.json`, "utf8"),
      ) as ObjectMetadata;
      validateObjectInput(metadata);
      return metadata;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  };
  return {
    async put(input) {
      const metadata = {
        key: input.key,
        byteSize: input.body.byteLength,
        contentType: input.contentType,
        checksumSha256: input.checksumSha256,
      };
      validateObjectInput(metadata);
      if (createHash("sha256").update(input.body).digest("hex") !== metadata.checksumSha256)
        throw new Error("Object checksum does not match content.");
      const existing = await head(input.key);
      if (existing) {
        if (
          existing.checksumSha256 !== metadata.checksumSha256 ||
          existing.contentType !== metadata.contentType
        )
          throw new Error("Object key is immutable.");
        return existing;
      }
      const path = pathFor(input.key);
      await mkdir(dirname(path), { recursive: true });
      try {
        await writeFile(path, input.body, { flag: "wx", mode: 0o600 });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
        if (
          createHash("sha256")
            .update(await readFile(path))
            .digest("hex") !== metadata.checksumSha256
        )
          throw new Error("Object key is immutable.");
      }
      await writeFile(`${path}.metadata.json`, JSON.stringify(metadata), { mode: 0o600 });
      return metadata;
    },
    head,
    async read(key) {
      const metadata = await head(key);
      if (!metadata) return null;
      const bytes = await readFile(pathFor(key));
      if (
        bytes.byteLength !== metadata.byteSize ||
        createHash("sha256").update(bytes).digest("hex") !== metadata.checksumSha256
      )
        throw new Error("Stored object checksum mismatch.");
      return {
        metadata,
        body: (async function* () {
          yield bytes;
        })(),
      };
    },
    async remove(key) {
      await Promise.all(
        [pathFor(key), `${pathFor(key)}.metadata.json`].map(async (path) => {
          try {
            await unlink(path);
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
          }
        }),
      );
    },
    async signUpload(input) {
      if (!options.signingSecret || !options.publicBaseUrl)
        throw new StorageUnavailableError("Filesystem signing endpoint is not configured.");
      validateObjectInput(input);
      const seconds = input.expiresInSeconds ?? 300;
      if (!Number.isInteger(seconds) || seconds < 1 || seconds > 900)
        throw new Error("Invalid object signature expiry.");
      const expiresAt = new Date(Date.now() + seconds * 1000);
      const fields: Record<string, string> = {
        key: input.key,
        byteSize: String(input.byteSize),
        contentType: input.contentType,
        checksumSha256: input.checksumSha256,
        expires: String(expiresAt.getTime()),
      };
      fields.sig = signedFields("upload", fields, options.signingSecret);
      return {
        url: `${options.publicBaseUrl.replace(/\/$/, "")}/api/cloud/storage/upload`,
        method: "POST",
        fields,
        headers: {},
        expiresAt,
      };
    },
    async signDownload(input) {
      if (!options.signingSecret || !options.publicBaseUrl)
        throw new StorageUnavailableError("Filesystem signing endpoint is not configured.");
      validateObjectKey(input.key);
      const seconds = input.expiresInSeconds ?? 300;
      if (!Number.isInteger(seconds) || seconds < 1 || seconds > 900)
        throw new Error("Invalid object signature expiry.");
      const expiresAt = new Date(Date.now() + seconds * 1000);
      const fields: Record<string, string> = {
        key: input.key,
        expires: String(expiresAt.getTime()),
        ...(input.filename ? { filename: input.filename } : {}),
      };
      fields.sig = signedFields("download", fields, options.signingSecret);
      return {
        url: `${options.publicBaseUrl.replace(/\/$/, "")}/api/cloud/storage/download?${new URLSearchParams(fields).toString()}`,
        method: "GET",
        headers: {},
        expiresAt,
      };
    },
  };
}
