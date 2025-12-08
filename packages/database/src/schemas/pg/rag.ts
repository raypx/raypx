import { index, integer, jsonb, text, unique, uuid, varchar, vector } from "drizzle-orm/pg-core";
import { pgTable, timestamptz } from "../../utils";
import { user } from "./auth";

export const datasets = pgTable(
  "datasets",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: varchar("name", { length: 255 }).notNull(),
    description: text("description"),
    status: varchar("status", { length: 50 }).notNull().default("active"),
    settings: jsonb("settings"),
    userId: uuid("user_id")
      .references(() => user.id, {
        onDelete: "cascade",
      })
      .notNull(),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    updatedAt: timestamptz("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("idx_datasets_user_id").on(table.userId),
    index("idx_datasets_status").on(table.status),
  ],
);

export const documents = pgTable(
  "documents",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: varchar("name", { length: 255 }).notNull(),
    originalName: varchar("original_name", { length: 255 }).notNull(),
    mimeType: varchar("mime_type", { length: 100 }).notNull(),
    size: integer("size").notNull(),
    status: varchar("status", { length: 50 }).notNull().default("processing"),
    metadata: jsonb("metadata"),
    datasetId: uuid("dataset_id")
      .references(() => datasets.id, {
        onDelete: "cascade",
      })
      .notNull(),
    userId: uuid("user_id")
      .references(() => user.id, {
        onDelete: "cascade",
      })
      .notNull(),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    updatedAt: timestamptz("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("idx_documents_dataset_id").on(table.datasetId),
    index("idx_documents_user_id").on(table.userId),
    index("idx_documents_status").on(table.status),
  ],
);

export const chunks = pgTable(
  "chunks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    text: text("text"),
    abstract: text("abstract"),
    metadata: jsonb("metadata"),
    index: integer("index"),
    type: varchar("type"),
    clientId: text("client_id"),
    documentId: uuid("document_id").references(() => documents.id, {
      onDelete: "cascade",
    }),
    datasetId: uuid("dataset_id").references(() => datasets.id, {
      onDelete: "cascade",
    }),
    userId: uuid("user_id").references(() => user.id, {
      onDelete: "cascade",
    }),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    updatedAt: timestamptz("updated_at").notNull().defaultNow(),
    accessedAt: timestamptz("accessed_at").notNull().defaultNow(),
  },
  (t) => [
    unique("chunks_client_id_user_id_unique").on(t.clientId, t.userId),
    index("idx_chunks_document_id").on(t.documentId),
    index("idx_chunks_dataset_id").on(t.datasetId),
    index("idx_chunks_user_id").on(t.userId),
    index("idx_chunks_dataset_id_user_id").on(t.datasetId, t.userId),
  ],
);

export const embeddings = pgTable(
  "embeddings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    chunkId: uuid("chunk_id")
      .references(() => chunks.id, {
        onDelete: "cascade",
      })
      .unique(),
    embeddings: vector("embeddings", {
      dimensions: 1024,
    }),
    model: text("model"),
    clientId: text("client_id"),
    userId: uuid("user_id").references(() => user.id, {
      onDelete: "cascade",
    }),
  },
  (t) => [
    unique("embeddings_client_id_user_id_unique").on(t.clientId, t.userId),
    index("idx_embeddings_chunk_id").on(t.chunkId),
    index("idx_embeddings_user_id").on(t.userId),
  ],
);

/**
 * Conversations table - stores chat sessions
 */
export const conversations = pgTable(
  "conversations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    title: varchar("title", { length: 255 }),
    documentId: uuid("document_id").references(() => documents.id, {
      onDelete: "cascade",
    }),
    datasetId: uuid("dataset_id").references(() => datasets.id, {
      onDelete: "cascade",
    }),
    userId: uuid("user_id")
      .references(() => user.id, {
        onDelete: "cascade",
      })
      .notNull(),
    summary: text("summary"), // Summary of conversation for memory compression
    metadata: jsonb("metadata"), // Additional metadata (memory type, settings, etc.)
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    updatedAt: timestamptz("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("idx_conversations_user_id").on(table.userId),
    index("idx_conversations_document_id").on(table.documentId),
    index("idx_conversations_dataset_id").on(table.datasetId),
    index("idx_conversations_user_id_updated_at").on(table.userId, table.updatedAt),
  ],
);

/**
 * Conversation messages table - stores individual messages in conversations
 */
export const conversationMessages = pgTable(
  "conversation_messages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    conversationId: uuid("conversation_id")
      .references(() => conversations.id, {
        onDelete: "cascade",
      })
      .notNull(),
    role: varchar("role", { length: 20 }).notNull(), // "user" | "assistant" | "system"
    content: text("content").notNull(),
    thinking: text("thinking"), // Thinking/reasoning content from models
    sources: jsonb("sources"), // Array of source chunks used
    metadata: jsonb("metadata"), // Additional metadata
    createdAt: timestamptz("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("idx_conversation_messages_conversation_id").on(table.conversationId),
    index("idx_conversation_messages_conversation_id_created_at").on(
      table.conversationId,
      table.createdAt,
    ),
  ],
);
