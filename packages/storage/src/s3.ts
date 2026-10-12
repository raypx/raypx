import { createHash } from "node:crypto";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { createPresignedPost } from "@aws-sdk/s3-presigned-post";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { ObjectMetadata, ObjectStorage } from "@voidmix/core";
import { validateObjectInput, validateObjectKey } from "./index.js";

export interface S3StorageOptions {
  bucket: string;
  region: string;
  endpoint?: string;
  forcePathStyle?: boolean;
  credentials?: { accessKeyId: string; secretAccessKey: string };
}

const expires = (value = 300): number => {
  if (!Number.isInteger(value) || value < 1 || value > 900)
    throw new Error("Object signature expiry must be between 1 and 900 seconds.");
  return value;
};

export function createS3Storage(options: S3StorageOptions): ObjectStorage {
  if (!options.bucket || !options.region) throw new Error("S3 bucket and region are required.");
  const client = new S3Client({
    region: options.region,
    requestHandler: { connectionTimeout: 5000, requestTimeout: 30_000 },
    ...(options.endpoint ? { endpoint: options.endpoint } : {}),
    ...(options.forcePathStyle === undefined ? {} : { forcePathStyle: options.forcePathStyle }),
    ...(options.credentials ? { credentials: options.credentials } : {}),
  });
  const head: ObjectStorage["head"] = async (key) => {
    validateObjectKey(key);
    try {
      const result = await client.send(
        new HeadObjectCommand({ Bucket: options.bucket, Key: key, ChecksumMode: "ENABLED" }),
      );
      // Multipart composite checksums cannot verify our single-object upload intent.
      const checksum = result.ChecksumSHA256;
      if (!checksum || !/^[A-Za-z0-9+/]{43}=$/.test(checksum))
        throw new Error("Stored object has no verifiable SHA256 checksum.");
      return {
        key,
        byteSize: result.ContentLength ?? 0,
        contentType: result.ContentType ?? "application/octet-stream",
        checksumSha256: Buffer.from(checksum, "base64").toString("hex"),
      };
    } catch (error) {
      const value = error as { name?: string; $metadata?: { httpStatusCode?: number } };
      if (
        value.name === "NotFound" ||
        value.name === "NoSuchKey" ||
        value.$metadata?.httpStatusCode === 404
      )
        return null;
      throw error;
    }
  };
  return {
    async close() {
      client.destroy();
    },
    async put(input) {
      const metadata: ObjectMetadata = {
        key: input.key,
        byteSize: input.body.byteLength,
        contentType: input.contentType,
        checksumSha256: input.checksumSha256,
      };
      validateObjectInput(metadata);
      if (createHash("sha256").update(input.body).digest("hex") !== input.checksumSha256)
        throw new Error("Object checksum does not match content.");
      const existing = await head(input.key);
      if (existing) {
        if (
          existing.checksumSha256 !== metadata.checksumSha256 ||
          existing.byteSize !== metadata.byteSize ||
          existing.contentType !== metadata.contentType
        )
          throw new Error("Object key is immutable.");
        return existing;
      }
      try {
        await client.send(
          new PutObjectCommand({
            Bucket: options.bucket,
            Key: input.key,
            Body: input.body,
            ContentType: input.contentType,
            ChecksumSHA256: Buffer.from(input.checksumSha256, "hex").toString("base64"),
            IfNoneMatch: "*",
          }),
        );
      } catch (error) {
        if (
          (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode !== 412
        )
          throw error;
        const raced = await head(input.key);
        if (
          !raced ||
          raced.checksumSha256 !== metadata.checksumSha256 ||
          raced.contentType !== metadata.contentType ||
          raced.byteSize !== metadata.byteSize
        )
          throw new Error("Object key is immutable.");
      }
      return metadata;
    },
    head,
    async read(key) {
      const metadata = await head(key);
      if (!metadata) return null;
      const result = await client.send(
        new GetObjectCommand({ Bucket: options.bucket, Key: key, ChecksumMode: "ENABLED" }),
      );
      if (!result.Body) throw new Error("Stored object has no body.");
      return { metadata, body: result.Body as AsyncIterable<Uint8Array> };
    },
    async remove(key) {
      validateObjectKey(key);
      await client.send(new DeleteObjectCommand({ Bucket: options.bucket, Key: key }));
    },
    async signUpload(input) {
      validateObjectInput(input);
      const duration = expires(input.expiresInSeconds);
      const checksum = Buffer.from(input.checksumSha256, "hex").toString("base64");
      const signed = await createPresignedPost(client, {
        Bucket: options.bucket,
        Key: input.key,
        Expires: duration,
        Fields: {
          "Content-Type": input.contentType,
          "x-amz-checksum-sha256": checksum,
          "x-amz-checksum-algorithm": "SHA256",
        },
        Conditions: [
          ["content-length-range", input.byteSize, input.byteSize],
          ["eq", "$Content-Type", input.contentType],
          ["eq", "$x-amz-checksum-sha256", checksum],
          ["eq", "$x-amz-checksum-algorithm", "SHA256"],
        ],
      });
      return {
        ...signed,
        method: "POST",
        headers: {},
        expiresAt: new Date(Date.now() + duration * 1000),
      };
    },
    async signDownload(input) {
      validateObjectKey(input.key);
      const duration = expires(input.expiresInSeconds);
      const disposition = input.filename
        ? `attachment; filename*=UTF-8''${encodeURIComponent(input.filename.replace(/[\r\n]/g, ""))}`
        : undefined;
      const url = await getSignedUrl(
        client,
        new GetObjectCommand({
          Bucket: options.bucket,
          Key: input.key,
          ...(disposition ? { ResponseContentDisposition: disposition } : {}),
        }),
        { expiresIn: duration },
      );
      return { url, method: "GET", headers: {}, expiresAt: new Date(Date.now() + duration * 1000) };
    },
  };
}
