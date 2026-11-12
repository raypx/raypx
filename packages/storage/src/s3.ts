import * as aws4fetch from "aws4fetch";
import s3Driver from "unstorage/drivers/s3";
import { createObjectStorage, objectHeaders } from "./storage.js";
import { assertObjectKey } from "./keys.js";
import { StorageError } from "./errors.js";
import type { ObjectStorage } from "./types.js";

export interface S3StorageConfig {
  /** Service origin without the bucket, e.g. `https://s3.example.com`. */
  endpoint: string;
  /** Bucket region; provider-specific; defaults to `auto`. */
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
}

/**
 * S3-compatible storage (AWS S3 and compatible providers) through fetch, so the same code
 * runs on Node. Requests use path-style URLs: `<endpoint>/<bucket>/<key>`.
 */
export function createS3Storage(config: S3StorageConfig): ObjectStorage {
  const base = `${config.endpoint.replace(/\/$/, "")}/${encodeURIComponent(config.bucket)}`;
  const client = new aws4fetch.AwsClient({
    service: "s3",
    region: config.region,
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
  });
  const objectUrl = (key: string) =>
    new URL(`${base}/${key.split("/").map(encodeURIComponent).join("/")}`);
  const storage = createObjectStorage({
    // Passing the library avoids unstorage's runtime import, instead of relying on its dynamic import.
    driver: s3Driver({ ...config, lib: aws4fetch }),
    async signer(key, { method, expiresIn, contentType }) {
      const url = objectUrl(key);
      url.searchParams.set("X-Amz-Expires", String(expiresIn));
      const signed = await client.sign(url.href, {
        method,
        ...(method === "PUT" && contentType ? { headers: { "content-type": contentType } } : {}),
        // allHeaders signs Content-Type, which aws4fetch otherwise leaves unsigned.
        aws: { signQuery: true, allHeaders: true },
      });
      return signed.url;
    },
  });
  return {
    ...storage,
    async put(key, body, options) {
      const url = objectUrl(assertObjectKey(key));
      const headers = objectHeaders(options);
      try {
        const request = await client.sign(url.href, {
          method: "PUT",
          headers,
          body: body instanceof Uint8Array ? Uint8Array.from(body) : body,
        });
        // A missing bucket is an upload failure, even though GET treats 404 as a miss.
        const response = await fetch(request, {
          redirect: "error",
          signal: AbortSignal.timeout(10_000),
        });
        void response.body?.cancel().catch(() => {});
        if (!response.ok) throw new StorageError("STORAGE_UNAVAILABLE");
      } catch {
        throw new StorageError("STORAGE_UNAVAILABLE");
      }
    },
  };
}
