/**
 * Drizzle-based Vector Store implementation
 *
 * Provides a vector store using Drizzle ORM that works with our database schema
 * Implements BaseRetriever interface for LangChain compatibility
 */

import { Document } from "@langchain/core/documents";
import type { Embeddings } from "@langchain/core/embeddings";
import type { BaseRetriever } from "@langchain/core/retrievers";
import { and, eq, sql, vectorDb } from "@raypx/database";
import { vectorEmbeddings } from "@raypx/database/vectorSchemas";
import { logger } from "./utils";

/**
 * Safely format embedding array as PostgreSQL vector literal
 * Validates that all values are finite numbers to prevent SQL injection
 */
function formatVectorLiteral(embedding: number[]): string {
  // Validate all values are finite numbers
  if (!embedding.every((v) => typeof v === "number" && Number.isFinite(v))) {
    throw new Error("Invalid embedding: all values must be finite numbers");
  }
  // Format as PostgreSQL array literal: ARRAY[1,2,3]::vector
  return `ARRAY[${embedding.join(",")}]::vector`;
}

export interface VectorStoreOptions {
  /**
   * User ID for access control
   * All queries will be filtered by this user ID
   */
  userId: string;

  /**
   * Optional document ID filter
   */
  documentId?: string;

  /**
   * Optional dataset ID filter
   */
  datasetId?: string;

  /**
   * Embedding dimensions (default: 1024)
   */
  dimensions?: number;
}

/**
 * Drizzle-based Vector Store that implements BaseRetriever interface
 */
export class DrizzleVectorStore {
  lc_namespace = ["raypx", "rag", "vector-store"];

  private embeddings: Embeddings;
  private options: VectorStoreOptions;

  constructor(embeddings: Embeddings, options: VectorStoreOptions) {
    this.embeddings = embeddings;
    this.options = options;
  }

  /**
   * Get relevant documents using vector similarity search
   */
  async _getRelevantDocuments(query: string): Promise<Document[]> {
    const { userId, documentId, datasetId } = this.options;

    try {
      // Generate embedding for the query
      const queryEmbedding = await this.embeddings.embedQuery(query);

      logger.debug("Performing vector similarity search", {
        queryLength: query.length,
        userId,
        documentId,
        datasetId,
        embeddingDimensions: queryEmbedding.length,
      });

      // Perform vector similarity search using cosine distance
      // Reference: https://github.com/langchain-ai/langchainjs/blob/main/libs/langchain-community/src/vectorstores/pgvector.ts
      // pgvector uses <=> operator for cosine distance
      // Distance: 0 = identical, 2 = opposite
      //
      // Note: We use sql.raw() because pgvector requires ARRAY[...]::vector literal format,
      // and Drizzle's parameterized queries don't support vector type casting.
      // The formatVectorLiteral function validates all values are finite numbers for safety.
      const queryVector = sql.raw(formatVectorLiteral(queryEmbedding));

      // Build WHERE clause conditions using Drizzle query builder
      const conditions = [eq(vectorEmbeddings.userId, userId)];

      if (documentId) {
        conditions.push(
          sql`(${vectorEmbeddings.metadata}->>'documentId' = ${documentId} OR ${vectorEmbeddings.metadata}->>'document_id' = ${documentId})`,
        );
      }

      if (datasetId) {
        conditions.push(
          sql`(${vectorEmbeddings.metadata}->>'datasetId' = ${datasetId} OR ${vectorEmbeddings.metadata}->>'dataset_id' = ${datasetId})`,
        );
      }

      // Use Drizzle query builder with sql template for vector operations
      // Calculate cosine distance using <=> operator
      const distanceExpr = sql<number>`${vectorEmbeddings.embedding} <=> ${queryVector}`;

      const results = await vectorDb
        .select({
          id: vectorEmbeddings.id,
          chunkId: vectorEmbeddings.chunkId,
          content: vectorEmbeddings.content,
          metadata: vectorEmbeddings.metadata,
          distance: distanceExpr,
        })
        .from(vectorEmbeddings)
        .where(and(...conditions))
        .orderBy(distanceExpr)
        .limit(20);

      logger.debug("Vector search completed", {
        resultsCount: results.length,
        userId,
        documentId,
        datasetId,
      });

      // Convert to LangChain Document format
      // LangChain PGVectorStore stores distance directly (0 = identical, 2 = opposite)
      // We convert distance to similarity: 1 - distance (clamped to 0-1)
      const documents: Document[] = results.map((row) => {
        const metadata = (row.metadata as Record<string, unknown>) || {};
        // Distance from pgvector: 0 = identical, 2 = opposite
        // Convert to similarity: 1 - distance (clamped to 0-1)
        const distance = row.distance || 0;
        const similarity = Math.max(0, Math.min(1, 1 - distance));

        return new Document({
          pageContent: row.content || "",
          metadata: {
            ...metadata,
            id: row.id,
            chunkId: row.chunkId,
            score: similarity, // Store similarity score (0-1, higher is better)
            distance, // Store raw distance for consistency with LangChain (0-2, lower is better)
          },
        });
      });

      return documents;
    } catch (error) {
      logger.error("Vector similarity search failed", {
        error: error instanceof Error ? error.message : String(error),
        query,
        userId,
        documentId,
        datasetId,
      });
      throw error;
    }
  }

  /**
   * Similarity search with score
   * Returns documents with their similarity scores
   * Reference: LangChain PGVectorStore.similaritySearchWithScore
   * Returns [Document, distance] where distance is cosine distance (0 = identical, 2 = opposite)
   */
  async similaritySearchWithScore(
    query: string,
    k: number = 5,
    scoreThreshold?: number,
  ): Promise<Array<[Document, number]>> {
    const docs = await this._getRelevantDocuments(query);

    // Filter by score threshold if provided
    // scoreThreshold is similarity threshold (0-1), convert to distance threshold
    let filteredDocs = docs;
    if (scoreThreshold !== undefined && scoreThreshold > 0) {
      const distanceThreshold = 1 - scoreThreshold; // Convert similarity threshold to distance
      filteredDocs = docs.filter((doc) => {
        const distance = (doc.metadata.distance as number) || 2;
        return distance <= distanceThreshold; // Lower distance is better
      });
    }

    // Limit to k results
    const limitedDocs = filteredDocs.slice(0, k);

    // Return as [Document, distance] format (LangChain convention)
    // Distance: 0 = identical, 2 = opposite (cosine distance from pgvector)
    return limitedDocs.map((doc) => {
      const distance = (doc.metadata.distance as number) || 0;
      return [doc, distance] as [Document, number];
    });
  }

  /**
   * Similarity search (without scores)
   */
  async similaritySearch(query: string, k: number = 5): Promise<Document[]> {
    const docs = await this._getRelevantDocuments(query);
    return docs.slice(0, k);
  }

  /**
   * Create a retriever from this vector store
   */
  async asRetriever(options?: {
    k?: number;
    searchType?: "similarity" | "mmr";
    scoreThreshold?: number;
  }): Promise<BaseRetriever> {
    const { k = 5, scoreThreshold } = options || {};

    // Dynamically import BaseRetriever to ensure it's available as a constructor
    const { BaseRetriever: BaseRetrieverClass } = await import("@langchain/core/retrievers");

    // Create a wrapper retriever that respects k and scoreThreshold
    class RetrieverWrapper extends BaseRetrieverClass {
      lc_namespace = ["raypx", "rag", "vector-store", "retriever"];
      private vectorStore: DrizzleVectorStore;

      constructor(vectorStore: DrizzleVectorStore) {
        super({});
        this.vectorStore = vectorStore;
      }

      async _getRelevantDocuments(query: string): Promise<Document[]> {
        const docs = await this.vectorStore.similaritySearchWithScore(query, k * 2, scoreThreshold);
        return docs.map(([doc]: [Document, number]) => doc).slice(0, k);
      }
    }

    return new RetrieverWrapper(this) as BaseRetriever;
  }
}

/**
 * Create a Drizzle-based vector store
 */
export async function createVectorStore(
  embeddings: Embeddings,
  options: VectorStoreOptions,
): Promise<DrizzleVectorStore> {
  logger.debug("Creating DrizzleVectorStore", {
    userId: options.userId,
    documentId: options.documentId,
    datasetId: options.datasetId,
    dimensions: options.dimensions,
  });

  return new DrizzleVectorStore(embeddings, options);
}

/**
 * Create a retriever with user access control
 * This is a convenience wrapper that creates a retriever from the vector store
 */
export async function createRetrieverWithAccessControl(
  vectorStore: DrizzleVectorStore,
  options: VectorStoreOptions & {
    k?: number;
    scoreThreshold?: number;
  },
): Promise<BaseRetriever> {
  const { k = 5, scoreThreshold } = options;

  return await vectorStore.asRetriever({
    k,
    searchType: "similarity",
    scoreThreshold,
  });
}
