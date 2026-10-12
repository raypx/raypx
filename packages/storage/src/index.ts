export { createS3Storage } from "./s3.js";
export {
  createFilesystemStorage,
  createMemoryStorage,
  verifyFilesystemUpload,
  verifyFilesystemDownload,
} from "./local.js";
export type {
  ObjectMetadata,
  ObjectStorage,
  SignedObjectRequest,
  SignedObjectUpload,
} from "@voidmix/core";

export class StorageUnavailableError extends Error {
  readonly code = "STORAGE_UNAVAILABLE";
  constructor(message = "Object storage is not configured.") {
    super(message);
    this.name = "StorageUnavailableError";
  }
}

export function validateObjectKey(key: string): void {
  if (
    !/^[a-zA-Z0-9][a-zA-Z0-9/_\-.]{0,511}$/.test(key) ||
    key.split("/").some((part) => !part || part === "." || part === "..")
  )
    throw new Error("Invalid object key.");
}

export function validateObjectInput(input: {
  key: string;
  byteSize: number;
  contentType: string;
  checksumSha256: string;
}): void {
  validateObjectKey(input.key);
  if (
    !Number.isSafeInteger(input.byteSize) ||
    input.byteSize < 0 ||
    !/^[a-f0-9]{64}$/.test(input.checksumSha256) ||
    !/^[\w.+-]+\/[\w.+-]+$/.test(input.contentType)
  )
    throw new Error("Invalid object metadata.");
}
