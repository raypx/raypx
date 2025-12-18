import sharp from "sharp";

/**
 * Image processing options
 */
export interface ImageProcessOptions {
  /**
   * Target width in pixels
   */
  width?: number;
  /**
   * Target height in pixels
   */
  height?: number;
  /**
   * Image quality (1-100)
   * @default 80
   */
  quality?: number;
  /**
   * Output format
   * @default 'webp'
   */
  format?: "webp" | "jpeg" | "png";
  /**
   * Whether to fit the image within dimensions (contain) or cover
   * @default 'cover'
   */
  fit?: "cover" | "contain" | "fill";
}

/**
 * Process and optimize an image
 * Converts to WebP, resizes, and compresses
 */
export async function processImage(
  buffer: Buffer,
  options: ImageProcessOptions = {},
): Promise<Buffer> {
  const { width = 256, height = 256, quality = 80, format = "webp", fit = "cover" } = options;

  try {
    let pipeline = sharp(buffer);

    // Resize if dimensions provided
    if (width || height) {
      pipeline = pipeline.resize(width, height, {
        fit,
        position: "center",
        background: { r: 255, g: 255, b: 255, alpha: 0 },
      });
    }

    // Convert to target format
    switch (format) {
      case "webp":
        pipeline = pipeline.webp({ quality });
        break;
      case "jpeg":
        pipeline = pipeline.jpeg({ quality, progressive: true });
        break;
      case "png":
        pipeline = pipeline.png({ quality, progressive: true });
        break;
    }

    return pipeline.toBuffer();
  } catch (error) {
    throw new Error(`Failed to process image: ${error}`);
  }
}

/**
 * Get image metadata
 */
export async function getImageMetadata(buffer: Buffer) {
  try {
    const metadata = await sharp(buffer).metadata();
    return {
      width: metadata.width,
      height: metadata.height,
      format: metadata.format,
      size: metadata.size,
      hasAlpha: metadata.hasAlpha,
    };
  } catch (error) {
    throw new Error(`Failed to get image metadata: ${error}`);
  }
}

/**
 * Validate image file
 */
export async function validateImage(buffer: Buffer): Promise<{
  valid: boolean;
  error?: string;
}> {
  try {
    const metadata = await sharp(buffer).metadata();

    // Check format
    const allowedFormats = ["jpeg", "jpg", "png", "webp", "gif"];
    if (!metadata.format || !allowedFormats.includes(metadata.format)) {
      return {
        valid: false,
        error: `Invalid image format. Allowed: ${allowedFormats.join(", ")}`,
      };
    }

    // Check dimensions
    if (!metadata.width || !metadata.height) {
      return { valid: false, error: "Invalid image dimensions" };
    }

    // Check minimum dimensions
    if (metadata.width < 50 || metadata.height < 50) {
      return { valid: false, error: "Image too small. Minimum 50x50 pixels" };
    }

    // Check maximum dimensions
    if (metadata.width > 4096 || metadata.height > 4096) {
      return { valid: false, error: "Image too large. Maximum 4096x4096 pixels" };
    }

    return { valid: true };
  } catch (_error) {
    return { valid: false, error: "Invalid image file" };
  }
}
