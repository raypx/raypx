import { eq } from "@raypx/database";
import { user as User } from "@raypx/database/schemas";
import {
  getAvatarUrl,
  isR2Configured,
  processImage,
  uploadAvatar,
  validateImage,
} from "@raypx/storage";
import { z } from "zod/v4";

import { Errors } from "../errors";
import { protectedProcedure } from "../trpc";

/**
 * Storage router - handles file uploads and management
 */
export const storageRouter = {
  /**
   * Upload avatar image
   * Validates, processes (resize, compress), and uploads to R2
   */
  uploadAvatar: protectedProcedure
    .input(
      z.object({
        image: z.string(), // Base64 encoded image
        format: z.enum(["webp", "jpeg", "png"]).default("webp"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      if (!isR2Configured()) {
        throw Errors.operationNotAllowed("upload avatar", "Storage is not configured");
      }

      try {
        // Decode base64 image
        const base64Data = input.image.replace(/^data:image\/\w+;base64,/, "");
        const buffer = Buffer.from(base64Data, "base64");

        // Validate image
        const validation = await validateImage(buffer);
        if (!validation.valid) {
          throw new Error(validation.error || "Invalid image");
        }

        // Process image (resize to 256x256, compress, convert to WebP)
        const processedBuffer = await processImage(buffer, {
          width: 256,
          height: 256,
          quality: 85,
          format: input.format,
          fit: "cover",
        });

        // Upload to R2
        const result = await uploadAvatar(userId, processedBuffer, input.format);

        // Update user's avatar URL in database
        await ctx.db
          .update(User)
          .set({
            image: result.url,
            updatedAt: new Date(),
          })
          .where(eq(User.id, userId));

        return {
          url: result.url,
          size: result.size,
        };
      } catch (error) {
        throw Errors.internalError("Failed to upload avatar", error);
      }
    }),

  /**
   * Delete avatar (set to null)
   * Note: This doesn't delete the file from R2, just removes the reference
   */
  deleteAvatar: protectedProcedure.mutation(async ({ ctx }) => {
    const userId = ctx.session.user.id;

    await ctx.db
      .update(User)
      .set({
        image: null,
        updatedAt: new Date(),
      })
      .where(eq(User.id, userId));

    return { success: true };
  }),

  /**
   * Get avatar URL
   */
  getAvatarUrl: protectedProcedure.query(({ ctx }) => {
    const userId = ctx.session.user.id;
    const user = ctx.session.user;

    // If user has custom avatar, return it
    if (user.image) {
      return { url: user.image };
    }

    // Otherwise return default avatar URL
    return { url: getAvatarUrl(userId) };
  }),
};
