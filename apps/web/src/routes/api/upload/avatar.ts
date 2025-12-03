import { auth } from "@raypx/auth/server";
import { eq } from "@raypx/database";
import { user as User } from "@raypx/database/schemas";
import { isR2Configured, processImage, uploadAvatar, validateImage } from "@raypx/storage";
import { createTRPCContext } from "@raypx/trpc";
import { createFileRoute } from "@tanstack/react-router";

/**
 * Avatar upload API route
 * Handles multipart/form-data file uploads
 */
async function handler({ request }: { request: Request }) {
  // Check authentication
  const session = await auth.api.getSession({
    headers: request.headers,
  });

  if (!session?.user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const userId = session.user.id;

  if (!isR2Configured()) {
    return new Response(JSON.stringify({ error: "Storage is not configured" }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    // Parse FormData
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const format = (formData.get("format") as string) || "jpeg";

    if (!file) {
      return new Response(JSON.stringify({ error: "No file provided" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Validate format
    if (!["webp", "jpeg", "png"].includes(format)) {
      return new Response(JSON.stringify({ error: "Invalid format" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Convert File to Buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Validate image
    const validation = await validateImage(buffer);
    if (!validation.valid) {
      return new Response(JSON.stringify({ error: validation.error || "Invalid image" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Process image (resize to 256x256, compress, convert format)
    const processedBuffer = await processImage(buffer, {
      width: 256,
      height: 256,
      quality: 85,
      format: format as "webp" | "jpeg" | "png",
      fit: "cover",
    });

    // Upload to R2
    const result = await uploadAvatar(userId, processedBuffer, format as "webp" | "jpeg" | "png");

    // Create database context to update user
    const ctx = await createTRPCContext({
      headers: request.headers,
    });

    // Update user's avatar URL in database
    await ctx.db
      .update(User)
      .set({
        image: result.url,
        updatedAt: new Date(),
      })
      .where(eq(User.id, userId));

    return new Response(
      JSON.stringify({
        url: result.url,
        size: result.size,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("Avatar upload error:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Failed to upload avatar",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}

export const Route = createFileRoute("/api/upload/avatar")({
  server: {
    handlers: {
      POST: handler,
    },
  },
});
