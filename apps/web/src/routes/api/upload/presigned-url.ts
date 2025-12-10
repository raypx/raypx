import { auth } from "@raypx/auth/server";
import { and, db, eq } from "@raypx/database";
import { datasets as Datasets } from "@raypx/database/schemas";
import { nanoid } from "@raypx/shared/utils";
import { generatePresignedUploadUrl, isR2Configured } from "@raypx/storage";
import { createFileRoute } from "@tanstack/react-router";
import env from "~/env";

/**
 * Request body for generating presigned URL
 */
interface PresignedUrlRequest {
  fileName: string;
  fileSize: number;
  contentType: string;
  datasetId: string;
}

async function handler({ request }: { request: Request }) {
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
    const body = (await request.json()) as PresignedUrlRequest;
    const { fileName, fileSize, contentType, datasetId } = body;

    // Validate file size (max 50MB)
    const maxSize = 50 * 1024 * 1024; // 50MB
    if (fileSize > maxSize) {
      return new Response(
        JSON.stringify({ error: `File size exceeds maximum limit of ${maxSize / 1024 / 1024}MB` }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    // Verify dataset exists and belongs to user
    const dataset = await db.query.datasets.findFirst({
      where: and(eq(Datasets.id, datasetId), eq(Datasets.userId, userId)),
    });

    if (!dataset) {
      return new Response(JSON.stringify({ error: "Dataset not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Generate unique file key
    const fileExtension = fileName.split(".").pop() || "bin";
    const fileId = nanoid();
    const key = `documents/${userId}/${fileId}.${fileExtension}`;

    // Generate presigned URL (valid for 1 hour)
    const { url, expiresAt } = await generatePresignedUploadUrl({
      key,
      contentType: contentType || "application/octet-stream",
      expiresIn: 3600, // 1 hour
      metadata: {
        userId,
        datasetId,
        originalName: fileName,
        uploadedAt: new Date().toISOString(),
      },
    });

    // Construct public URL (same logic as in r2.ts)
    const publicUrl = `${env.VITE_R2_PUBLIC_URL}/${key}`;

    return new Response(
      JSON.stringify({
        uploadUrl: url,
        key,
        expiresAt: expiresAt.toISOString(),
        publicUrl,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("Presigned URL generation error:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Failed to generate presigned URL",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}

export const Route = createFileRoute("/api/upload/presigned-url")({
  server: {
    handlers: {
      POST: handler,
    },
  },
});
