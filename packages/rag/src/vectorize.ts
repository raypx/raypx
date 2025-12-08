/**
 * Main vectorization service that orchestrates parsing, chunking, and embedding
 *
 * Supports both separate vector database and co-located database scenarios
 */

import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { and, db, eq, vectorDb } from "@raypx/database";
import { chunks as Chunks, documents as Documents } from "@raypx/database/schemas";
import { vectorEmbeddings as VectorEmbeddings } from "@raypx/database/vectorSchemas";
import { getFromR2 } from "@raypx/storage";
import { getRAGConfig } from "./config";
import { generateEmbeddings, getEmbeddingsInstance } from "./embedding";
import { loadDocuments } from "./loaders";
import { logger } from "./utils";

/**
 * Default chunking configuration
 */
const DEFAULT_CHUNK_SIZE = 1000;
const DEFAULT_CHUNK_OVERLAP = 200;

export interface VectorizeOptions {
  chunkSize?: number;
  chunkOverlap?: number;
  embeddingProvider?: "openai" | "huggingface" | "cohere" | "deepseek" | "aliyun";
  embeddingModel?: string;
  embeddingDimensions?: number;
  embeddingApiKey?: string;
  embeddingApiUrl?: string;
}

export interface VectorizeResult {
  documentId: string;
  chunksCreated: number;
  embeddingsCreated: number;
}

/**
 * Vectorize a document: parse, chunk, and generate embeddings
 */
export async function vectorizeDocument(
  documentId: string,
  userId: string,
  options: VectorizeOptions = {},
): Promise<VectorizeResult> {
  // Get document from database
  const document = await db.query.documents.findFirst({
    where: and(eq(Documents.id, documentId), eq(Documents.userId, userId)),
  });

  if (!document) {
    throw new Error(`Document ${documentId} not found`);
  }

  // Get RAG configuration from database (with fallback to environment variables)
  const ragConfig = await getRAGConfig(userId);
  logger.debug("RAG configuration", { ragConfig });

  // Update status to processing
  // await db.update(Documents).set({ status: "processing" }).where(eq(Documents.id, documentId));

  try {
    // Get file from storage
    const storageKey = (document.metadata as { storageKey?: string })?.storageKey;
    logger.debug("Storage key", { storageKey });
    if (!storageKey) {
      logger.error(`Document ${documentId} has no storage key`);
      throw new Error(`Document ${documentId} has no storage key`);
    }

    const fileBuffer = await getFromR2(storageKey);
    if (!fileBuffer) {
      logger.error(`Failed to retrieve file from storage: ${storageKey}`);
      throw new Error(`Failed to retrieve file from storage: ${storageKey}`);
    }

    // Chunk size and overlap configuration
    const chunkSize =
      options.chunkSize ||
      ragConfig.chunkSize ||
      (process.env.CHUNK_SIZE ? Number(process.env.CHUNK_SIZE) : DEFAULT_CHUNK_SIZE);
    const chunkOverlap =
      options.chunkOverlap ||
      ragConfig.chunkOverlap ||
      (process.env.CHUNK_OVERLAP ? Number(process.env.CHUNK_OVERLAP) : DEFAULT_CHUNK_OVERLAP);
    logger.debug("Chunk size", { chunkSize });
    logger.debug("Chunk overlap", { chunkOverlap });

    // Use LangChain loaders + RecursiveCharacterTextSplitter for all file types
    // This follows LangChain.js standard workflow: Load → Split → Embed → Store
    logger.debug("Loading documents", {
      mimeType: document.mimeType,
      filename: document.originalName || document.name,
    });

    let langchainDocs: Array<{ pageContent: string; metadata: Record<string, unknown> }>;
    let parseMetadata: Record<string, unknown> | undefined;

    try {
      // Load documents using appropriate loader based on MIME type
      const loadedDocs = await loadDocuments(
        fileBuffer,
        document.mimeType,
        document.originalName || document.name,
      );

      if (loadedDocs.length === 0) {
        logger.warn("No documents loaded", {
          mimeType: document.mimeType,
          filename: document.originalName || document.name,
        });
        return {
          documentId,
          chunksCreated: 0,
          embeddingsCreated: 0,
        };
      }

      logger.debug("Documents loaded", { count: loadedDocs.length });

      // Extract metadata from first document if available
      if (loadedDocs.length > 0 && loadedDocs[0]?.metadata) {
        parseMetadata = loadedDocs[0].metadata as Record<string, unknown>;
      }

      // Use RecursiveCharacterTextSplitter to chunk the documents
      const splitter = new RecursiveCharacterTextSplitter({
        chunkSize,
        chunkOverlap,
        separators: ["\n\n", "\n", " ", ""], // Priority: paragraph > line > word > character
      });

      // Convert to LangChain Document format for splitting
      const { Document } = await import("@langchain/core/documents");
      const langchainDocuments = loadedDocs.map(
        (doc) =>
          new Document({
            pageContent: doc.pageContent,
            metadata: doc.metadata,
          }),
      );

      // Split documents into chunks
      langchainDocs = await splitter.splitDocuments(langchainDocuments);
      logger.debug("Documents split into chunks", { chunksCount: langchainDocs.length });
    } catch (error) {
      logger.error("Failed to load or process documents", {
        error: error instanceof Error ? error.message : String(error),
        errorType: error instanceof Error ? error.constructor.name : typeof error,
        errorStack: error instanceof Error ? error.stack : undefined,
        mimeType: document.mimeType,
        filename: document.originalName || document.name,
      });
      throw error;
    }

    logger.debug("LangChain documents prepared", {
      count: langchainDocs.length,
      hasMetadata: !!parseMetadata,
    });

    // Generate embeddings in batch - use options first, then database config
    const chunkTexts = langchainDocs.map((doc) => doc.pageContent);
    logger.debug("Chunk texts", { chunkTextsCount: chunkTexts.length });
    const embeddingModel = options.embeddingModel || ragConfig.model;
    logger.debug("Embedding model", { embeddingModel });
    const embeddingProvider = options.embeddingProvider || ragConfig.provider;
    logger.debug("Embedding provider", { embeddingProvider });
    const embeddings = await generateEmbeddings(chunkTexts, {
      provider: embeddingProvider as
        | "openai"
        | "huggingface"
        | "cohere"
        | "deepseek"
        | "aliyun"
        | undefined,
      model: embeddingModel,
      dimensions: options.embeddingDimensions || ragConfig.dimensions,
      apiKey: options.embeddingApiKey || ragConfig.apiKey,
      apiUrl: options.embeddingApiUrl || ragConfig.apiUrl,
    }).catch((embeddingError: unknown) => {
      logger.error("Failed to generate embeddings", {
        error: embeddingError instanceof Error ? embeddingError.message : String(embeddingError),
        errorType:
          embeddingError instanceof Error ? embeddingError.constructor.name : typeof embeddingError,
        errorStack: embeddingError instanceof Error ? embeddingError.stack : undefined,
        chunksCount: chunkTexts.length,
        provider: embeddingProvider,
        model: embeddingModel,
      });
      throw embeddingError;
    });
    logger.debug("Embeddings generated", {
      count: embeddings.length,
      dimensions: embeddings[0]?.length || 0,
    });

    // Get the actual model name for storage
    // Priority: explicit config > environment variable > instance property > default
    let modelName = embeddingModel || process.env.EMBEDDING_MODEL;
    logger.debug("Model name", { modelName });
    if (!modelName) {
      try {
        const instance = getEmbeddingsInstance();
        modelName =
          (instance as { modelName?: string }).modelName ||
          (instance as { model?: string }).model ||
          "unknown";
      } catch {
        modelName = "unknown";
      }
    }
    logger.debug("Model name", { modelName });
    // Store chunks and embeddings in database using batch inserts for better performance
    // Prepare all chunk data first
    const chunksToInsert = langchainDocs
      .map((doc, i) => {
        const embedding = embeddings[i];
        if (!doc || !embedding) {
          return null;
        }

        const docMetadata = (doc.metadata || {}) as Record<string, unknown>;
        const startIndex = (docMetadata.startIndex as number) ?? 0;
        const endIndex = (docMetadata.endIndex as number) ?? doc.pageContent.length;

        return {
          text: doc.pageContent,
          index: i,
          documentId: document.id,
          datasetId: document.datasetId,
          userId,
          metadata: {
            ...parseMetadata,
            ...docMetadata,
            startIndex,
            endIndex,
          },
          embedding,
          embeddingMetadata: {
            userId,
            documentId: document.id,
            datasetId: document.datasetId,
            chunkIndex: i,
            startIndex,
            endIndex,
            ...parseMetadata,
            ...docMetadata,
          },
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);

    logger.debug("Prepared chunks for batch insert", { count: chunksToInsert.length });

    // Batch insert all chunks at once
    const createdChunks = await db
      .insert(Chunks)
      .values(
        chunksToInsert.map(({ embedding: _, embeddingMetadata: __, ...chunkData }) => chunkData),
      )
      .returning();

    logger.debug("Chunks inserted", { count: createdChunks.length });

    // Batch insert all embeddings at once
    if (createdChunks.length > 0) {
      await vectorDb.insert(VectorEmbeddings).values(
        createdChunks.map((chunk, i) => {
          const chunkData = chunksToInsert[i];
          if (!chunkData) {
            throw new Error(`Missing chunk data at index ${i}`);
          }
          return {
            chunkId: chunk.id,
            embedding: chunkData.embedding as any,
            content: chunkData.text,
            model: modelName,
            userId,
            metadata: {
              ...chunkData.embeddingMetadata,
              chunkId: chunk.id,
            },
          };
        }),
      );
      logger.debug("Embeddings inserted", { count: createdChunks.length });
    }

    const chunksCreated = createdChunks.length;
    const embeddingsCreated = createdChunks.length;

    // Update document status to completed
    await db.update(Documents).set({ status: "completed" }).where(eq(Documents.id, documentId));

    return {
      documentId,
      chunksCreated,
      embeddingsCreated,
    };
  } catch (error) {
    // Ensure document status is updated to failed on any error
    // This handles cases where errors occur after status is set to processing
    try {
      await db.update(Documents).set({ status: "failed" }).where(eq(Documents.id, documentId));
    } catch (updateError) {
      // Log but don't throw - we want to preserve the original error
      logger.error("Failed to update document status", { updateError });
    }

    // Re-throw the original error
    throw error;
  }
}
