import { createHash } from "node:crypto";
import {
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { logger } from "@raypx/shared/logger";
import { NodeHttpHandler } from "@smithy/node-http-handler";
import { env } from "./envs";

/**
 * Cloudflare R2 client singleton
 */
let r2Client: S3Client | null = null;

/**
 * Get or create R2 client
 */
export function getR2Client(): S3Client {
  if (r2Client) {
    return r2Client;
  }

  try {
    // Configure HTTP handler with proper timeouts and connection settings
    const requestHandler = new NodeHttpHandler({
      requestTimeout: 300000, // 5 minutes for large file uploads
      connectionTimeout: 10000, // 10 seconds to establish connection
      socketTimeout: 300000, // 5 minutes socket timeout
    });

    r2Client = new S3Client({
      region: "auto",
      endpoint: env.R2_ENDPOINT,
      credentials: {
        accessKeyId: env.R2_ACCESS_KEY_ID,
        secretAccessKey: env.R2_SECRET_ACCESS_KEY,
      },
      requestHandler,
      // Increase maxAttempts for better reliability
      maxAttempts: 3,
      // Use forcePathStyle if needed for R2 compatibility
      forcePathStyle: false,
    });

    return r2Client;
  } catch (error) {
    throw new Error(`Failed to initialize R2 client: ${error}`);
  }
}

/**
 * Check if R2 is configured
 */
export function isR2Configured(): boolean {
  try {
    return !!(
      env.R2_ENDPOINT &&
      env.R2_ACCESS_KEY_ID &&
      env.R2_SECRET_ACCESS_KEY &&
      env.R2_BUCKET_NAME
    );
  } catch {
    return false;
  }
}

/**
 * Upload options
 */
export interface UploadOptions {
  /**
   * File key (path) in the bucket
   */
  key: string;
  /**
   * File buffer
   */
  buffer: Buffer;
  /**
   * Content type (MIME type)
   * @default 'application/octet-stream'
   */
  contentType?: string;
  /**
   * Cache control header
   * @default 'public, max-age=31536000, immutable'
   */
  cacheControl?: string;
  /**
   * Custom metadata
   */
  metadata?: Record<string, string>;
}

/**
 * Sanitize metadata value for S3/R2 headers
 * Removes invalid characters that are not allowed in HTTP headers
 */
function sanitizeMetadataValue(value: string): string {
  // Remove or replace invalid characters for HTTP headers
  // Invalid characters include: \r, \n, and other control characters
  return value
    .replace(/[\r\n\t]/g, " ") // Replace newlines, carriage returns, tabs with spaces
    .replace(/[^\x20-\x7E]/g, "") // Remove non-printable ASCII characters
    .trim()
    .slice(0, 2000); // Limit length (S3 metadata values have a practical limit)
}

/**
 * Sanitize metadata object for S3/R2 upload
 * Ensures all values are valid HTTP header values
 */
function sanitizeMetadata(metadata: Record<string, string>): Record<string, string> {
  const sanitized: Record<string, string> = {};
  for (const [key, value] of Object.entries(metadata)) {
    // Sanitize key (remove invalid characters, ensure lowercase)
    const sanitizedKey = key
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, "_")
      .slice(0, 64); // S3 metadata keys are limited

    // Sanitize value
    sanitized[sanitizedKey] = sanitizeMetadataValue(String(value));
  }
  return sanitized;
}

/**
 * Upload a file to R2
 */
export async function uploadToR2(options: UploadOptions): Promise<{
  key: string;
  url: string;
  size: number;
}> {
  if (!isR2Configured()) {
    throw new Error("R2 is not configured");
  }

  const client = getR2Client();

  const {
    key,
    buffer,
    contentType = "application/octet-stream",
    cacheControl = "public, max-age=31536000, immutable",
    metadata = {},
  } = options;

  // Sanitize metadata to ensure valid HTTP header values
  const sanitizedMetadata = sanitizeMetadata(metadata);

  try {
    const command = new PutObjectCommand({
      Bucket: env.R2_BUCKET_NAME,
      Key: key,
      Body: buffer,
      ContentType: contentType,
      CacheControl: cacheControl,
      Metadata: sanitizedMetadata,
    });

    await client.send(command);

    // Construct public URL
    const publicUrl = `${env.VITE_R2_PUBLIC_URL}/${key}`;

    logger.info(`Uploaded file to R2: ${key} (${buffer.length} bytes)`);

    return {
      key,
      url: publicUrl,
      size: buffer.length,
    };
  } catch (error) {
    logger.error("Failed to upload to R2:", error);
    throw new Error(`Failed to upload to R2: ${error}`);
  }
}

/**
 * Upload an avatar image to R2
 * Automatically generates key with content hash and sets proper content type
 */
export async function uploadAvatar(
  userId: string,
  buffer: Buffer,
  format: "webp" | "jpeg" | "png" = "webp",
): Promise<{
  key: string;
  url: string;
  size: number;
}> {
  const contentTypeMap = {
    webp: "image/webp",
    jpeg: "image/jpeg",
    png: "image/png",
  };

  // Generate content hash (first 16 chars of SHA-256) for unique URL
  // This ensures each upload gets a new URL, breaking browser cache
  const contentHash = createHash("sha256").update(buffer).digest("hex");
  const timestamp = Date.now();

  // Build initial key and hash it again for shorter, cleaner filename
  const initialKey = `${userId}-${timestamp}-${contentHash}.${format}`;
  const keyHash = createHash("sha256").update(initialKey).digest("hex");
  const key = `avatars/${keyHash}.${format}`;
  const contentType = contentTypeMap[format];

  return uploadToR2({
    key,
    buffer,
    contentType,
    metadata: {
      userId,
      uploadedAt: new Date().toISOString(),
      contentHash,
      keyHash,
    },
  });
}

/**
 * Generate avatar URL from user ID
 */
export function getAvatarUrl(userId: string, format: "webp" | "jpeg" | "png" = "webp"): string {
  return `${env.VITE_R2_PUBLIC_URL}/avatars/${userId}.${format}`;
}

/**
 * Get a file from R2 storage
 */
export async function getFromR2(key: string): Promise<Buffer | null> {
  if (!isR2Configured()) {
    throw new Error("R2 is not configured");
  }

  const client = getR2Client();

  try {
    const command = new GetObjectCommand({
      Bucket: env.R2_BUCKET_NAME,
      Key: key,
    });

    const response = await client.send(command);

    if (!response.Body) {
      return null;
    }

    // Convert stream to buffer
    const chunks: Uint8Array[] = [];
    for await (const chunk of response.Body as any) {
      chunks.push(chunk);
    }

    return Buffer.concat(chunks);
  } catch (error) {
    logger.error(`Failed to get file from R2: ${key}`, error);
    return null;
  }
}

/**
 * Delete a file from R2 storage
 */
export async function deleteFromR2(key: string): Promise<boolean> {
  if (!isR2Configured()) {
    throw new Error("R2 is not configured");
  }

  const client = getR2Client();

  try {
    const command = new DeleteObjectCommand({
      Bucket: env.R2_BUCKET_NAME,
      Key: key,
    });

    await client.send(command);
    logger.info(`Deleted file from R2: ${key}`);
    return true;
  } catch (error) {
    logger.error(`Failed to delete file from R2: ${key}`, error);
    return false;
  }
}

/**
 * Delete multiple files from R2 storage
 */
export async function deleteMultipleFromR2(keys: string[]): Promise<{
  deleted: number;
  failed: number;
}> {
  if (!isR2Configured()) {
    throw new Error("R2 is not configured");
  }

  if (keys.length === 0) {
    return { deleted: 0, failed: 0 };
  }

  const client = getR2Client();
  let deleted = 0;
  let failed = 0;

  // R2/S3 DeleteObjectsCommand supports up to 1000 objects per request
  const batchSize = 1000;
  const batches: string[][] = [];

  for (let i = 0; i < keys.length; i += batchSize) {
    batches.push(keys.slice(i, i + batchSize));
  }

  for (const batch of batches) {
    try {
      const command = new DeleteObjectsCommand({
        Bucket: env.R2_BUCKET_NAME,
        Delete: {
          Objects: batch.map((key) => ({ Key: key })),
          Quiet: false,
        },
      });

      const response = await client.send(command);

      if (response.Deleted) {
        deleted += response.Deleted.length;
      }
      if (response.Errors) {
        failed += response.Errors.length;
        logger.error("Failed to delete some files from R2:", response.Errors);
      }
    } catch (error) {
      logger.error("Failed to delete batch from R2:", error);
      failed += batch.length;
    }
  }

  logger.info(`Deleted ${deleted} files from R2, ${failed} failed`);
  return { deleted, failed };
}

/**
 * List all files in R2 with a given prefix
 */
export async function listR2Files(prefix: string): Promise<string[]> {
  if (!isR2Configured()) {
    throw new Error("R2 is not configured");
  }

  const client = getR2Client();
  const keys: string[] = [];
  let continuationToken: string | undefined;

  try {
    do {
      const command = new ListObjectsV2Command({
        Bucket: env.R2_BUCKET_NAME,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      });

      const response = await client.send(command);

      if (response.Contents) {
        for (const object of response.Contents) {
          if (object.Key) {
            keys.push(object.Key);
          }
        }
      }

      continuationToken = response.NextContinuationToken;
    } while (continuationToken);

    logger.info(`Listed ${keys.length} files from R2 with prefix: ${prefix}`);
    return keys;
  } catch (error) {
    logger.error(`Failed to list files from R2 with prefix: ${prefix}`, error);
    throw error;
  }
}

/**
 * Extract R2 key from a public URL
 * Example: https://pub-xxx.r2.dev/avatars/abc123.webp -> avatars/abc123.webp
 */
function extractKeyFromUrl(url: string): string | null {
  try {
    // Remove the public URL prefix to get the key
    const publicUrl = env.VITE_R2_PUBLIC_URL;
    if (url.startsWith(publicUrl)) {
      return url.slice(publicUrl.length + 1); // +1 for the trailing slash
    }
    // If URL doesn't match public URL, try to extract key from path
    const urlObj = new URL(url);
    const pathParts = urlObj.pathname.split("/").filter(Boolean);
    if (pathParts.length >= 2) {
      // Assume format: /avatars/keyhash.format
      return pathParts.slice(0).join("/");
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Delete all files belonging to a user from R2
 * This includes:
 * - Avatar: extracted from user.image URL if it's an R2 URL
 */
export async function deleteUserFiles(
  userId: string,
  avatarUrl?: string | null,
): Promise<{
  deleted: number;
  failed: number;
}> {
  if (!isR2Configured()) {
    throw new Error("R2 is not configured");
  }

  try {
    const allKeys: string[] = [];

    // Extract avatar key from user's image URL if provided
    if (avatarUrl) {
      const avatarKey = extractKeyFromUrl(avatarUrl);
      if (avatarKey?.startsWith("avatars/")) {
        allKeys.push(avatarKey);
        logger.info(`Found avatar key for user ${userId}: ${avatarKey}`);
      }
    }

    if (allKeys.length === 0) {
      logger.info(`No files found for user ${userId}`);
      return { deleted: 0, failed: 0 };
    }

    // Delete all files
    const result = await deleteMultipleFromR2(allKeys);
    logger.info(`Deleted ${result.deleted} files for user ${userId}, ${result.failed} failed`);
    return result;
  } catch (error) {
    logger.error(`Failed to delete user files for user ${userId}:`, error);
    throw error;
  }
}

/**
 * Options for generating presigned URL
 */
export interface PresignedUrlOptions {
  /**
   * File key (path) in the bucket
   */
  key: string;
  /**
   * Content type (MIME type)
   * @default 'application/octet-stream'
   */
  contentType?: string;
  /**
   * URL expiration time in seconds
   * @default 3600 (1 hour)
   */
  expiresIn?: number;
  /**
   * Cache control header
   * @default 'public, max-age=31536000, immutable'
   */
  cacheControl?: string;
  /**
   * Custom metadata (will be sanitized)
   */
  metadata?: Record<string, string>;
}

/**
 * Generate a presigned URL for direct upload to R2
 * This allows clients to upload files directly to R2 without going through the server
 */
export async function generatePresignedUploadUrl(options: PresignedUrlOptions): Promise<{
  url: string;
  key: string;
  expiresAt: Date;
}> {
  if (!isR2Configured()) {
    throw new Error("R2 is not configured");
  }

  const client = getR2Client();

  const {
    key,
    contentType = "application/octet-stream",
    expiresIn = 3600, // 1 hour default
    cacheControl = "public, max-age=31536000, immutable",
    metadata = {},
  } = options;

  // Sanitize metadata to ensure valid HTTP header values
  const sanitizedMetadata = sanitizeMetadata(metadata);

  try {
    const command = new PutObjectCommand({
      Bucket: env.R2_BUCKET_NAME,
      Key: key,
      ContentType: contentType,
      CacheControl: cacheControl,
      Metadata: sanitizedMetadata,
    });

    const presignedUrl = await getSignedUrl(client, command, { expiresIn });

    const expiresAt = new Date(Date.now() + expiresIn * 1000);

    logger.info(`Generated presigned URL for R2 upload: ${key} (expires in ${expiresIn}s)`);

    return {
      url: presignedUrl,
      key,
      expiresAt,
    };
  } catch (error) {
    logger.error("Failed to generate presigned URL:", error);
    throw new Error(`Failed to generate presigned URL: ${error}`);
  }
}
