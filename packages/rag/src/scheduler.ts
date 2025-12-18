/**
 * Scheduler for retrying failed document vectorization
 */

import { and, db, eq, inArray } from "@raypx/database";
import { documents as Documents } from "@raypx/database/schemas";
import { logger } from "./utils";
import { vectorizeDocument } from "./vectorize";

/**
 * Document metadata type for retry logic
 */
interface DocumentRetryMetadata {
  storageKey?: string;
  retryCount?: number;
  lastRetryAt?: string;
  lastRetryError?: string;
}

export interface RetryVectorizationOptions {
  /**
   * Maximum number of documents to retry per run
   * @default 10
   */
  maxDocumentsPerRun?: number;

  /**
   * Maximum retry attempts per document
   * @default 3
   */
  maxRetries?: number;

  /**
   * Minimum time in milliseconds to wait before retrying a failed document
   * @default 60000 (1 minute)
   */
  minRetryDelay?: number;
}

/**
 * Retry vectorization for failed or uploaded documents
 */
export async function retryFailedVectorizations(options: RetryVectorizationOptions = {}): Promise<{
  processed: number;
  succeeded: number;
  failed: number;
}> {
  const {
    maxDocumentsPerRun = 10,
    maxRetries = 3,
    minRetryDelay = 60000, // 1 minute
  } = options;

  // Find documents that need retry:
  // 1. Status is "failed" or "uploaded"
  // 2. Have a storageKey in metadata
  // 3. Haven't exceeded max retries (check metadata.retryCount)
  const documents = await db.query.documents.findMany({
    where: and(
      inArray(Documents.status, ["failed", "uploaded"]),
      // Only retry documents that have storageKey
      // We'll filter this in code since JSONB queries are complex
    ),
    limit: maxDocumentsPerRun,
    orderBy: (documents, { asc }) => [asc(documents.updatedAt)], // Oldest first
  });

  // Filter documents that have storageKey and haven't exceeded retry limit
  const documentsToRetry = documents.filter((doc) => {
    const metadata = doc.metadata as DocumentRetryMetadata | null;
    if (!metadata?.storageKey) {
      return false; // Skip documents without storageKey
    }

    const retryCount = metadata.retryCount ?? 0;
    if (retryCount >= maxRetries) {
      return false; // Skip documents that exceeded retry limit
    }

    // Check if enough time has passed since last update
    const lastUpdate = doc.updatedAt.getTime();
    const now = Date.now();
    if (now - lastUpdate < minRetryDelay) {
      return false; // Skip documents that were recently updated
    }

    return true;
  });

  let succeeded = 0;
  let failed = 0;

  // Process documents sequentially to avoid overwhelming the system
  for (const document of documentsToRetry) {
    const metadata = document.metadata as DocumentRetryMetadata | null;
    const retryCount = (metadata?.retryCount ?? 0) + 1;

    try {
      // Update retry count before attempting
      await db
        .update(Documents)
        .set({
          metadata: {
            ...metadata,
            retryCount,
            lastRetryAt: new Date().toISOString(),
          },
        })
        .where(eq(Documents.id, document.id));

      // Attempt vectorization
      await vectorizeDocument(document.id, document.userId);

      succeeded += 1;
    } catch (error) {
      failed += 1;
      const errorMessage = error instanceof Error ? error.message : String(error);

      // Update metadata with error information
      await db
        .update(Documents)
        .set({
          metadata: {
            ...metadata,
            retryCount,
            lastRetryAt: new Date().toISOString(),
            lastRetryError: errorMessage,
          },
        })
        .where(eq(Documents.id, document.id));

      logger.error("Retry vectorization failed", {
        documentId: document.id,
        errorMessage,
      });
    }
  }

  return {
    processed: documentsToRetry.length,
    succeeded,
    failed,
  };
}
