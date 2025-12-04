import { createHash } from "node:crypto";
import { auth } from "@raypx/auth/server";
import { and, db, eq } from "@raypx/database";
import { datasets as Datasets, documents as Documents } from "@raypx/database/schemas";
import { isR2Configured, uploadToR2 } from "@raypx/storage";
import { createFileRoute } from "@tanstack/react-router";
import { nanoid } from "nanoid";

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
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const datasetId = formData.get("datasetId") as string | null;

    if (!file) {
      return new Response(JSON.stringify({ error: "No file provided" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (!datasetId) {
      return new Response(JSON.stringify({ error: "Dataset ID is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
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

    // Validate file size (max 50MB)
    const maxSize = 50 * 1024 * 1024; // 50MB
    if (file.size > maxSize) {
      return new Response(
        JSON.stringify({ error: `File size exceeds maximum limit of ${maxSize / 1024 / 1024}MB` }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    // Read file buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Generate file key with nanoid (shorter and URL-safe)
    const contentHash = createHash("sha256").update(buffer).digest("hex");
    const fileExtension = file.name.split(".").pop() || "bin";
    // Generate a short unique ID (12 characters) using nanoid
    const fileId = nanoid(12);
    // Include userId in the path: documents/{userId}/{fileId}.{extension}
    const key = `documents/${userId}/${fileId}.${fileExtension}`;

    // Upload to R2
    const uploadResult = await uploadToR2({
      key,
      buffer,
      contentType: file.type || "application/octet-stream",
      metadata: {
        userId,
        datasetId,
        originalName: file.name,
        uploadedAt: new Date().toISOString(),
        contentHash,
      },
    });

    // Create document record with uploaded status since upload succeeded
    // Status flow: processing -> uploaded -> completed (if processing needed)
    // If there's additional processing needed (e.g., text extraction, vectorization),
    // it can be done asynchronously and status can be updated to "completed" later
    const [document] = await db
      .insert(Documents)
      .values({
        name: file.name,
        originalName: file.name,
        mimeType: file.type || "application/octet-stream",
        size: file.size,
        datasetId,
        status: "uploaded", // Set to uploaded since file upload succeeded
        metadata: {
          storageKey: key,
          storageUrl: uploadResult.url,
          contentHash,
        },
        userId,
      })
      .returning();

    return new Response(
      JSON.stringify({
        id: document.id,
        name: document.name,
        originalName: document.originalName,
        mimeType: document.mimeType,
        size: document.size,
        status: document.status,
        url: uploadResult.url,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("Document upload error:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Failed to upload document",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}

export const Route = createFileRoute("/api/upload/document")({
  server: {
    handlers: {
      POST: handler,
    },
  },
});
