/**
 * Main vectorization service that orchestrates parsing, chunking, and embedding
 */

import { and, db, eq } from "@raypx/database";
import {
  chunks as Chunks,
  documents as Documents,
  embeddings as Embeddings,
} from "@raypx/database/schemas";
import { getFromR2 } from "@raypx/storage";
import { chunkText } from "./chunking";
import { generateEmbeddings, getEmbeddingsInstance } from "./embedding";
import { parseDocument } from "./parsers/registry";

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

  // Update status to processing
  await db
    .update(Documents)
    .set({ status: "processing" })
    .where(eq(Documents.id, documentId));

  // Get file from storage
  const storageKey = (document.metadata as { storageKey?: string })?.storageKey;
  if (!storageKey) {
    throw new Error(`Document ${documentId} has no storage key`);
  }

  const fileBuffer = await getFromR2(storageKey);
  if (!fileBuffer) {
    throw new Error(`Failed to retrieve file from storage: ${storageKey}`);
  }

  // Parse document
  // Use originalName or name as filename for MIME type inference
  const filename = document.originalName || document.name;
  const { text, metadata: parseMetadata } = await parseDocument(
    fileBuffer,
    document.mimeType,
    filename,
  );

  // Chunk text
  const chunkSize = options.chunkSize || Number(process.env.CHUNK_SIZE) || 1000;
  const chunkOverlap = options.chunkOverlap || Number(process.env.CHUNK_OVERLAP) || 200;

  const textChunks = chunkText(text, { chunkSize, chunkOverlap });

  // Generate embeddings in batch
  const chunkTexts = textChunks.map((chunk) => chunk.text);
  const embeddings = await generateEmbeddings(chunkTexts, {
    provider: options.embeddingProvider as any,
    model: options.embeddingModel,
    dimensions: options.embeddingDimensions,
    apiKey: options.embeddingApiKey,
    apiUrl: options.embeddingApiUrl,
  });

  // Get the actual model name from embeddings instance
  const embeddingsInstance = getEmbeddingsInstance();
  const modelName =
    options.embeddingModel ||
    process.env.EMBEDDING_MODEL ||
    (embeddingsInstance as any).modelName ||
    (embeddingsInstance as any).model ||
    "unknown";

  // Store chunks and embeddings in database
  let chunksCreated = 0;
  let embeddingsCreated = 0;

  for (let i = 0; i < textChunks.length; i++) {
    const chunk = textChunks[i];
    const embedding = embeddings[i];

    if (!chunk || !embedding) {
      continue; // Skip if chunk or embedding is missing
    }

    // Create chunk
    const [createdChunk] = await db
      .insert(Chunks)
      .values({
        text: chunk.text,
        index: chunk.index,
        documentId: document.id,
        datasetId: document.datasetId,
        userId,
        metadata: {
          ...parseMetadata,
          startIndex: chunk.startIndex,
          endIndex: chunk.endIndex,
        },
      })
      .returning();

    if (createdChunk) {
      chunksCreated += 1;

      // Create embedding
      // PostgreSQL pgvector format: Drizzle's vector type expects the array directly
      // The vector column type will handle the conversion to pgvector format
      await db.insert(Embeddings).values({
        chunkId: createdChunk.id,
        embeddings: embedding as any, // Pass array directly, Drizzle vector type handles conversion
        model: modelName,
        userId,
      });

      embeddingsCreated += 1;
    }
  }

  // Update document status to completed
  await db.update(Documents).set({ status: "completed" }).where(eq(Documents.id, documentId));

  return {
    documentId,
    chunksCreated,
    embeddingsCreated,
  };
}
