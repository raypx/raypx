import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { logger } from "@raypx/shared/logger";
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
    r2Client = new S3Client({
      region: "auto",
      endpoint: env.R2_ENDPOINT,
      credentials: {
        accessKeyId: env.R2_ACCESS_KEY_ID,
        secretAccessKey: env.R2_SECRET_ACCESS_KEY,
      },
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

  try {
    const command = new PutObjectCommand({
      Bucket: env.R2_BUCKET_NAME,
      Key: key,
      Body: buffer,
      ContentType: contentType,
      CacheControl: cacheControl,
      Metadata: metadata,
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
 * Automatically generates key and sets proper content type
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

  const key = `avatars/${userId}.${format}`;
  const contentType = contentTypeMap[format];

  return uploadToR2({
    key,
    buffer,
    contentType,
    metadata: {
      userId,
      uploadedAt: new Date().toISOString(),
    },
  });
}

/**
 * Generate avatar URL from user ID
 */
export function getAvatarUrl(userId: string, format: "webp" | "jpeg" | "png" = "webp"): string {
  return `${env.VITE_R2_PUBLIC_URL}/avatars/${userId}.${format}`;
}
