/**
 * Vector similarity search for RAG
 * Uses PGVectorStore from LangChain for efficient similarity search in PostgreSQL
 *
 * Supports both separate vector database and co-located database scenarios
 */

import { db, inArray } from "@raypx/database";
import { chunks as Chunks, documents as Documents } from "@raypx/database/schemas";
import { getRAGConfig } from "./config";
import { getEmbeddingsInstance } from "./embedding";
import { createAdvancedRetriever } from "./retrievers";
import { logger } from "./utils";
import { createVectorStore } from "./vector-store";

export interface SearchOptions {
  limit?: number;
  threshold?: number; // Similarity threshold (0-1), higher means more similar. Set to 0 or negative to disable filtering
  documentId?: string; // Filter by specific document
  datasetId?: string; // Filter by dataset
  includeMetadata?: boolean; // Include chunk metadata in results
  minResults?: number; // Minimum number of results to return even if below threshold (default: 0)
  /**
   * Use MultiQueryRetriever to generate multiple query variants
   * This improves recall by searching with different query phrasings
   * Note: Requires LLM to be provided
   * Default: true
   */
  useMultiQuery?: boolean;
  /**
   * Use ContextualCompressionRetriever to compress retrieved documents
   * This reduces token usage by keeping only the most relevant parts
   * Note: Requires LLM to be provided
   * Default: true
   */
  useCompression?: boolean;
  /**
   * LLM for advanced retrievers (required if useMultiQuery or useCompression is true)
   */
  llm?: unknown; // BaseLanguageModel type from @langchain/core
}

export interface SearchResult {
  chunkId: string;
  text: string;
  similarity: number;
  documentId: string;
  documentName: string;
  chunkIndex: number;
  metadata?: Record<string, unknown>;
}

/**
 * Search for similar chunks using vector similarity
 * @param query - The search query text
 * @param userId - User ID for access control
 * @param options - Search options
 * @returns Array of search results sorted by similarity (highest first)
 */
export async function searchSimilarChunks(
  query: string,
  userId: string,
  options: SearchOptions = {},
): Promise<SearchResult[]> {
  const {
    limit = 5,
    threshold = 0.1, // Lower default threshold for better recall
    documentId,
    datasetId,
    includeMetadata = true,
    minResults = 0,
    useMultiQuery = true,
    useCompression = true,
    llm,
  } = options;

  // Preprocess query to improve search quality
  const processedQuery = query.trim().replace(/\s+/g, " ");

  logger.debug("Starting similarity search", {
    originalQuery: query,
    processedQuery,
    queryLength: processedQuery.length,
    limit,
    threshold,
    documentId,
    datasetId,
  });

  try {
    // Get RAG configuration
    const ragConfig = await getRAGConfig(userId);
    logger.debug("RAG config loaded", { provider: ragConfig.provider });

    // Create embeddings instance
    const embeddingsInstance = getEmbeddingsInstance();

    // Create vector store with access control
    const vectorStore = await createVectorStore(embeddingsInstance, {
      userId,
      documentId,
      datasetId,
      dimensions: ragConfig.dimensions,
    });

    // Use advanced retrievers if enabled and LLM is provided
    let langchainDocsWithScores: Array<[any, number]>;

    if ((useMultiQuery || useCompression) && llm) {
      try {
        // Create base retriever from vectorStore (for advanced retrievers)
        // Advanced retrievers need a standard BaseRetriever, not our custom wrapper
        const vectorStoreRetriever = await vectorStore.asRetriever({
          k: limit * 3,
          searchType: "similarity",
          ...(threshold > 0 && { scoreThreshold: threshold }),
        });

        // Create advanced retriever
        const advancedRetriever = await createAdvancedRetriever(vectorStoreRetriever, {
          useMultiQuery,
          useCompression,
          llm: llm as any, // Type assertion for BaseLanguageModel
        });

        // Use retriever to get relevant documents
        const docs = await advancedRetriever.invoke(processedQuery);

        // Apply access control filtering manually
        const filteredDocs = docs
          .filter((doc: any) => {
            const metadata = doc.metadata as Record<string, unknown>;
            const docUserId = metadata.userId as string | undefined;
            if (docUserId !== userId) return false;
            if (documentId && metadata.documentId !== documentId) return false;
            if (datasetId && metadata.datasetId !== datasetId) return false;
            return true;
          })
          .slice(0, limit * 3);

        // Convert to [Document, score] format
        // Advanced retrievers may not provide scores, so we use a default similarity
        langchainDocsWithScores = filteredDocs.map((doc: any) => {
          const score = doc.metadata.score as number | undefined;
          // Convert distance to similarity if score exists, otherwise use default
          const similarity = score !== undefined ? Math.max(0, Math.min(1, 1 - score)) : 0.5;
          return [doc, 1 - similarity] as [any, number]; // Store as distance for consistency
        });

        logger.debug("Used advanced retriever", {
          docsCount: langchainDocsWithScores.length,
          useMultiQuery,
          useCompression,
        });
      } catch (error) {
        logger.warn("Advanced retriever failed, falling back to base search", {
          error: error instanceof Error ? error.message : String(error),
        });
        // Fallback to base similarity search
        const maxResults = limit * 3;
        langchainDocsWithScores = await vectorStore.similaritySearchWithScore(
          processedQuery,
          maxResults,
        );
      }
    } else {
      // Use similaritySearchWithScore to get documents with similarity scores
      // PGVectorStore uses cosine distance: 0 = identical, 2 = opposite
      // We convert to similarity: 1 - distance (clamped to 0-1)
      // Request more results to account for filtering
      const maxResults = limit * 3; // Get more results to account for filtering
      langchainDocsWithScores = await vectorStore.similaritySearchWithScore(
        processedQuery,
        maxResults,
      );
    }

    logger.debug("Retrieved documents from PGVectorStore", {
      totalDocs: langchainDocsWithScores.length,
      userId,
      documentId,
      datasetId,
    });

    // Filter by user_id and optional documentId/datasetId
    // The metadata should contain userId, chunkId, documentId, datasetId
    const filteredDocs = langchainDocsWithScores.filter(([doc]) => {
      const metadata = doc.metadata as Record<string, unknown>;

      // Check user_id (stored in metadata as userId)
      const docUserId = metadata.userId as string | undefined;
      if (docUserId !== userId) {
        logger.debug("Filtered out document due to userId mismatch", {
          docUserId,
          expectedUserId: userId,
        });
        return false;
      }

      // Check documentId if specified
      if (documentId) {
        const docDocumentId = metadata.documentId as string | undefined;
        if (docDocumentId !== documentId) {
          logger.debug("Filtered out document due to documentId mismatch", {
            docDocumentId,
            expectedDocumentId: documentId,
          });
          return false;
        }
      }

      // Check datasetId if specified
      if (datasetId) {
        const docDatasetId = metadata.datasetId as string | undefined;
        if (docDatasetId !== datasetId) {
          logger.debug("Filtered out document due to datasetId mismatch", {
            docDatasetId,
            expectedDatasetId: datasetId,
          });
          return false;
        }
      }

      return true;
    });

    logger.debug("Filtered documents", {
      beforeFilter: langchainDocsWithScores.length,
      afterFilter: filteredDocs.length,
      userId,
      documentId,
      datasetId,
    });

    if (filteredDocs.length === 0) {
      logger.warn("No embeddings found after filtering", {
        documentId,
        datasetId,
        userId,
        totalRetrieved: langchainDocsWithScores.length,
        sampleMetadata: langchainDocsWithScores[0]?.[0]?.metadata,
      });
      return [];
    }

    // Extract documents and convert scores to similarities
    const langchainDocs = filteredDocs.map(([doc, distance]) => {
      // Convert cosine distance to similarity: 1 - distance (clamped to 0-1)
      // distance: 0 = identical, 2 = opposite
      // similarity: 1 = identical, 0 = opposite
      const similarity = Math.max(0, Math.min(1, 1 - distance));
      return {
        doc,
        similarity,
      };
    });

    if (langchainDocs.length === 0) {
      logger.warn("No embeddings found", { documentId, datasetId, userId });
      return [];
    }

    // Extract chunk IDs from LangChain documents
    // LangChain Document metadata contains chunkId
    const chunkIds = langchainDocs
      .map((item) => item.doc.metadata.chunkId as string | undefined)
      .filter((id): id is string => Boolean(id));

    if (chunkIds.length === 0) {
      logger.warn("No chunk IDs found in retrieved documents", {
        documentId,
        datasetId,
        userId,
        docsCount: langchainDocs.length,
      });
      return [];
    }

    // Fetch chunks and documents from main database
    const chunks = await db
      .select({
        id: Chunks.id,
        text: Chunks.text,
        documentId: Chunks.documentId,
        index: Chunks.index,
        metadata: Chunks.metadata,
      })
      .from(Chunks)
      .where(inArray(Chunks.id, chunkIds));

    const documentIds = [
      ...new Set(chunks.map((c) => c.documentId).filter((id): id is string => Boolean(id))),
    ];
    if (documentIds.length === 0) {
      logger.warn("No documents found for chunks", { chunkIds: chunkIds.length });
      return [];
    }
    logger.debug("Document IDs", { documentIds });
    const documents = await db
      .select({
        id: Documents.id,
        name: Documents.name,
      })
      .from(Documents)
      .where(inArray(Documents.id, documentIds));

    logger.debug("Documents", { documents });

    const documentMap = new Map(documents.map((d) => [d.id, d.name]));

    // Combine results from LangChain documents with database chunks
    // LangChain Document has pageContent (text) and metadata (with chunkId, etc.)
    const allResults = langchainDocs
      .map((item) => {
        const { doc, similarity } = item;
        const chunkId = doc.metadata.chunkId as string | undefined;
        if (!chunkId) return null;

        const chunk = chunks.find((c) => c.id === chunkId);
        if (!chunk) {
          // Use content from LangChain document if chunk not found
          return {
            chunkId,
            text: doc.pageContent,
            similarity,
            documentId: (doc.metadata.documentId as string) || "",
            documentName: (doc.metadata.documentName as string) || "",
            chunkIndex: (doc.metadata.chunkIndex as number) ?? 0,
            metadata: includeMetadata ? (doc.metadata as Record<string, unknown>) : undefined,
          };
        }

        return {
          chunkId: chunk.id,
          text: doc.pageContent || chunk.text || "",
          similarity,
          documentId: chunk.documentId || "",
          documentName: documentMap.get(chunk.documentId || "") || "",
          chunkIndex: chunk.index || 0,
          metadata: includeMetadata ? (chunk.metadata as Record<string, unknown>) : undefined,
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);

    // Log actual similarity scores for debugging
    if (allResults.length > 0) {
      const similarities = allResults.map((r) => Number(r.similarity));
      logger.debug("Similarity scores (before threshold filter)", {
        count: allResults.length,
        max: Math.max(...similarities),
        min: Math.min(...similarities),
        avg: similarities.reduce((a, b) => a + b, 0) / similarities.length,
        threshold,
        topSimilarities: similarities.slice(0, 5),
      });
    } else {
      logger.warn("No embeddings found for this document/user", {
        documentId,
        datasetId,
        userId,
      });
    }

    // Filter by threshold and limit results
    // If threshold is 0 or negative, skip threshold filtering (return top results by similarity)
    let results: typeof allResults;
    if (threshold <= 0) {
      // No threshold filtering - just return top results sorted by similarity
      results = allResults.slice(0, limit);
      logger.debug("Threshold filtering disabled, returning top results by similarity");
    } else {
      // Apply threshold filter
      const filteredResults = allResults.filter((result) => Number(result.similarity) >= threshold);

      // If we have fewer results than minResults, include top results even if below threshold
      if (minResults > 0 && filteredResults.length < minResults && allResults.length > 0) {
        const topResults = allResults.slice(0, minResults);
        results = topResults;
        logger.debug(
          `Threshold filter returned ${filteredResults.length} results, but minResults=${minResults}, so including top ${topResults.length} results`,
        );
      } else {
        results = filteredResults;
      }

      // Limit to requested limit
      results = results.slice(0, limit);
    }

    logger.info("Similarity search completed", {
      resultsCount: results.length,
      totalCandidates: allResults.length,
      queryLength: query.length,
      threshold: threshold <= 0 ? "disabled" : threshold,
      minResults,
    });

    return results.map((result) => ({
      chunkId: result.chunkId,
      text: result.text || "",
      similarity: Number(result.similarity),
      documentId: result.documentId || "",
      documentName: result.documentName || "",
      chunkIndex: result.chunkIndex || 0,
      metadata:
        includeMetadata && result.metadata
          ? (result.metadata as Record<string, unknown>)
          : undefined,
    }));
  } catch (error) {
    logger.error("Similarity search failed", {
      error: error instanceof Error ? error.message : String(error),
      errorType: error instanceof Error ? error.constructor.name : typeof error,
      errorStack: error instanceof Error ? error.stack : undefined,
      queryLength: query.length,
    });
    throw error;
  }
}

/**
 * Search for similar chunks within a specific document
 * Convenience function for document-specific search
 */
export async function searchDocument(
  query: string,
  documentId: string,
  userId: string,
  options: Omit<SearchOptions, "documentId"> = {},
): Promise<SearchResult[]> {
  return searchSimilarChunks(query, userId, {
    ...options,
    documentId,
  });
}
