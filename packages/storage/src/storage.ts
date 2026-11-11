import { createStorage, type Driver } from "unstorage";
import memoryDriver from "unstorage/drivers/memory";
import { StorageError } from "./errors.js";
import { assertObjectKey, assertObjectPrefix, fromStorageKey } from "./keys.js";
import type { ObjectStorage, PutObjectOptions, SignedUrlOptions } from "./types.js";

export type UrlSigner = (key: string, options: SignedUrlOptions) => Promise<string>;

export interface ObjectStorageOptions {
  /** Any unstorage driver that stores raw values. */
  driver: Driver;
  signer?: UrlSigner;
}

async function guarded<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof StorageError) throw error;
    throw new StorageError("STORAGE_UNAVAILABLE");
  }
}

function headers(options: PutObjectOptions = {}) {
  const result: Record<string, string> = {};
  if (options.contentType) result["Content-Type"] = options.contentType;
  if (options.cacheControl) result["Cache-Control"] = options.cacheControl;
  if (options.contentDisposition) result["Content-Disposition"] = options.contentDisposition;
  for (const [name, value] of Object.entries(options.metadata ?? {})) {
    if (!/^[a-z0-9-]+$/.test(name)) throw new StorageError("INVALID_INPUT");
    result[`x-amz-meta-${name}`] = value;
  }
  return result;
}

function validateSignedUrlOptions({ method, expiresIn }: SignedUrlOptions) {
  if (
    (method !== "GET" && method !== "PUT") ||
    !Number.isInteger(expiresIn) ||
    expiresIn < 1 ||
    expiresIn > 604_800
  )
    throw new StorageError("INVALID_INPUT");
}

/** Object storage over an unstorage driver; S3 adapters add a URL signer. */
export function createObjectStorage({ driver, signer }: ObjectStorageOptions): ObjectStorage {
  const storage = createStorage({ driver });
  return {
    available: true,
    put: (key, body, options) =>
      guarded(() => storage.setItemRaw(assertObjectKey(key), body, { headers: headers(options) })),
    get: (key) => guarded(() => storage.getItem(assertObjectKey(key), { type: "bytes" })),
    getStream: (key) => guarded(() => storage.getItem(assertObjectKey(key), { type: "stream" })),
    has: (key) => guarded(() => storage.hasItem(assertObjectKey(key))),
    delete: (key) => guarded(() => storage.removeItem(assertObjectKey(key))),
    list: (prefix) =>
      guarded(async () => (await storage.getKeys(assertObjectPrefix(prefix))).map(fromStorageKey)),
    async signedUrl(key, options) {
      assertObjectKey(key);
      validateSignedUrlOptions(options);
      if (!signer) throw new StorageError("STORAGE_SIGNING_UNSUPPORTED");
      return guarded(() => signer(key, options));
    },
  };
}

/** Process-local storage for tests and development; values vanish on restart. */
export function createMemoryStorage(): ObjectStorage {
  return createObjectStorage({ driver: memoryDriver() });
}

/** Placeholder that keeps startup available and fails each operation explicitly. */
export function createUnavailableStorage(): ObjectStorage {
  const fail = async (): Promise<never> => {
    throw new StorageError("STORAGE_NOT_CONFIGURED");
  };
  return {
    available: false,
    put: fail,
    get: fail,
    getStream: fail,
    has: fail,
    delete: fail,
    list: fail,
    signedUrl: fail,
  };
}
