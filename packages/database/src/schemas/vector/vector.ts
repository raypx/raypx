/**
 * Vector database schemas
 *
 * These schemas are used when VECTOR_URL is configured (separate vector database)
 * or can be used in the main database if VECTOR_URL is not set.
 *
 * Note: This uses a separate schema namespace to avoid conflicts with main database tables.
 */

import { index, jsonb, pgTableCreator, text, uuid, vector } from "drizzle-orm/pg-core";
import { timestamptz } from "../../utils";

// Use table creator with "vector_" prefix to avoid conflicts
const createTable = pgTableCreator((name) => `vector_${name}`);

/**
 * Vector embeddings table
 * Stores embeddings for vector similarity search
 *
 * This table is optimized for vector similarity search using pgvector extension.
 */
export const vectorEmbeddings = createTable(
  "embeddings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    chunkId: uuid("chunk_id").notNull(), // Reference to chunk ID (may be in different database)
    embedding: vector("embedding", {
      dimensions: 1024, // Default dimension, can be adjusted per provider
    }),
    content: text("content"), // Cached content for faster retrieval
    metadata: jsonb("metadata"), // Additional metadata (document ID, etc.)
    model: text("model"), // Embedding model name
    userId: uuid("user_id").notNull(), // User ID for access control
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    updatedAt: timestamptz("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("idx_vector_embeddings_chunk_id").on(table.chunkId),
    index("idx_vector_embeddings_user_id").on(table.userId),
    index("idx_vector_embeddings_user_id_chunk_id").on(table.userId, table.chunkId),
    // Vector similarity index (using HNSW for better performance)
    // Note: This index is created manually via migration SQL, not via Drizzle
    // CREATE INDEX ON vector_embeddings USING hnsw (embedding vector_cosine_ops);
  ],
);

/**
 * Vector chunks table (optional, for standalone vector database)
 * Stores text chunks with their embeddings
 *
 * If using separate vector database, chunks can be stored here.
 */
export const vectorChunks = createTable(
  "chunks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    text: text("text").notNull(),
    index: text("index").notNull(), // Chunk index
    userId: uuid("user_id").notNull(),
    metadata: jsonb("metadata"), // Chunk metadata (startIndex, endIndex, etc.)
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    updatedAt: timestamptz("updated_at").notNull().defaultNow(),
  },
  (table) => [index("idx_vector_chunks_user_id").on(table.userId)],
);
