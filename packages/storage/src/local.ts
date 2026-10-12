import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { lstat, mkdir, mkdtemp, readFile, rename, rm, writeFile, unlink } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { ObjectMetadata, ObjectStorage } from "@raypx/core";
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
  legacyDirectory?: string;
  signingSecret?: string;
  publicBaseUrl?: string;
}): ObjectStorage {
  const directories = [
    options.directory,
    ...(options.legacyDirectory ? [options.legacyDirectory] : []),
  ];
  const pathFor = (key: string, directory = options.directory) => {
    validateObjectKey(key);
    return join(directory, key);
  };
  const objectPathFor = (key: string, directory = options.directory) => {
    validateObjectKey(key);
    const hash = createHash("sha256").update(key).digest("hex");
    return join(directory, ".objects", hash.slice(0, 2), hash);
  };
  const locate = async (key: string) => {
    for (const directory of directories) {
      const objectPath = objectPathFor(key, directory);
      const legacyPath = pathFor(key, directory);
      for (const { metadataPath, path } of [
        { metadataPath: join(objectPath, "metadata.json"), path: join(objectPath, "body") },
        { metadataPath: `${legacyPath}.metadata.json`, path: legacyPath },
      ]) {
        try {
          const metadata = JSON.parse(await readFile(metadataPath, "utf8")) as ObjectMetadata;
          validateObjectInput(metadata);
          return { metadata, path };
        } catch (error) {
          if (!["ENOENT", "ENOTDIR"].includes((error as NodeJS.ErrnoException).code ?? ""))
            throw error;
        }
      }
    }
    return null;
  };
  const head: ObjectStorage["head"] = async (key) => (await locate(key))?.metadata ?? null;
  const immutableMetadata = (existing: ObjectMetadata | null, proposed: ObjectMetadata) => {
    if (
      !existing ||
      existing.byteSize !== proposed.byteSize ||
      existing.checksumSha256 !== proposed.checksumSha256 ||
      existing.contentType !== proposed.contentType
    )
      throw new Error("Object key is immutable.");
    return existing;
  };
  const immutableBytes = (bytes: Uint8Array, proposed: ObjectMetadata) => {
    if (
      bytes.byteLength !== proposed.byteSize ||
      createHash("sha256").update(bytes).digest("hex") !== proposed.checksumSha256
    )
      throw new Error("Object key is immutable.");
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
      const existing = await locate(input.key);
      if (existing) {
        immutableMetadata(existing.metadata, metadata);
        try {
          immutableBytes(await readFile(existing.path), metadata);
          return existing.metadata;
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        }
      }
      // Preserve bytes left by the old flat layout's interrupted upload.
      try {
        immutableBytes(await readFile(pathFor(input.key)), metadata);
      } catch (error) {
        if (!["ENOENT", "ENOTDIR", "EISDIR"].includes((error as NodeJS.ErrnoException).code ?? ""))
          throw error;
      }
      const path = objectPathFor(input.key);
      await mkdir(dirname(path), { recursive: true });
      const stage = await mkdtemp(join(dirname(path), ".raypx-upload-"));
      try {
        const object = join(stage, "object");
        await mkdir(object, { mode: 0o700 });
        await writeFile(join(object, "body"), input.body, { mode: 0o600 });
        await writeFile(join(object, "metadata.json"), JSON.stringify(metadata), { mode: 0o600 });
        // A nonempty destination cannot be replaced; bytes and metadata publish together.
        try {
          await rename(object, path);
        } catch (error) {
          if (
            !["EEXIST", "ENOTEMPTY", "EPERM"].includes((error as NodeJS.ErrnoException).code ?? "")
          )
            throw error;
          const raced = await locate(input.key);
          if (!raced) throw error;
          immutableMetadata(raced.metadata, metadata);
          immutableBytes(await readFile(raced.path), metadata);
          return raced.metadata;
        }
        return metadata;
      } finally {
        await rm(stage, { recursive: true, force: true });
      }
    },
    head,
    async read(key) {
      const stored = await locate(key);
      if (!stored) return null;
      const { metadata, path } = stored;
      const bytes = await readFile(path);
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
        directories.map(async (directory) => {
          const objectPath = objectPathFor(key, directory);
          let stage: string | undefined;
          try {
            stage = await mkdtemp(join(dirname(objectPath), ".raypx-remove-"));
            // Detach the whole object before deletion, so an overlapping put stays complete.
            await rename(objectPath, join(stage, "object"));
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
          } finally {
            if (stage) await rm(stage, { recursive: true, force: true });
          }
          const path = pathFor(key, directory);
          for (const legacyPath of [path, `${path}.metadata.json`])
            try {
              // A flat prefix directory may still own another object's bytes.
              if (!(await lstat(legacyPath)).isDirectory()) await unlink(legacyPath);
            } catch (error) {
              if (
                !["ENOENT", "ENOTDIR", "EISDIR"].includes(
                  (error as NodeJS.ErrnoException).code ?? "",
                )
              )
                throw error;
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
