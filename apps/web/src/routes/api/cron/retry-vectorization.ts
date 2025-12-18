import { retryFailedVectorizations } from "@raypx/rag";
import { createFileRoute } from "@tanstack/react-router";
import { json } from "@tanstack/react-start";

/**
 * API endpoint for retrying failed document vectorizations
 * This endpoint can be called by:
 * - Vercel Cron Jobs (configured in vercel.json)
 * - External cron services (e.g., cron-job.org)
 * - Manual triggers
 */
async function handler({ request }: { request: Request }) {
  // Optional: Add authentication/authorization check
  // For Vercel Cron, you can use a secret header
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await retryFailedVectorizations({
      maxDocumentsPerRun: 10,
      maxRetries: 3,
      minRetryDelay: 60000, // 1 minute
    });

    return json({
      success: true,
      ...result,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("[Cron] Error retrying vectorizations:", errorMessage);

    return json(
      {
        success: false,
        error: errorMessage,
        timestamp: new Date().toISOString(),
      },
      { status: 500 },
    );
  }
}

export const Route = createFileRoute("/api/cron/retry-vectorization")({
  server: {
    handlers: {
      POST: handler,
      GET: handler, // Support both GET and POST for flexibility
    },
  },
});
