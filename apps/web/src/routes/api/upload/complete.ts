import { auth } from "@raypx/auth/server";
import { and, db, eq } from "@raypx/database";
import { datasets as Datasets } from "@raypx/database/schemas";
import { createTRPCContext, trpcRouter } from "@raypx/trpc";
import { createFileRoute } from "@tanstack/react-router";

/**
 * Request body for upload completion
 */
interface UploadCompleteRequest {
  key: string;
  fileName: string;
  fileSize: number;
  contentType: string;
  datasetId: string;
  publicUrl: string;
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

  try {
    const body = (await request.json()) as UploadCompleteRequest;
    const { key, fileName, fileSize, contentType, datasetId, publicUrl } = body;

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

    // Create document record via tRPC mutation
    const ctx = await createTRPCContext({ headers: request.headers });
    const caller = trpcRouter.createCaller(ctx);

    const document = await caller.documents.create({
      name: fileName,
      originalName: fileName,
      mimeType: contentType || "application/octet-stream",
      size: fileSize,
      datasetId,
      status: "uploaded", // Set to uploaded so user can manually trigger vectorization
      metadata: {
        storageKey: key,
        storageUrl: publicUrl,
      },
      autoVectorize: false, // Disable auto-vectorization, user will trigger manually
    });

    return new Response(
      JSON.stringify({
        id: document.id,
        name: document.name,
        originalName: document.originalName,
        mimeType: document.mimeType,
        size: document.size,
        status: document.status,
        url: publicUrl,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("Upload completion error:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Failed to complete upload",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}

export const Route = createFileRoute("/api/upload/complete")({
  server: {
    handlers: {
      POST: handler,
    },
  },
});
