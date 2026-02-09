import { boolean, index, integer, jsonb, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { pgTable, uuidv7 } from "../../utils";
import { user } from "./auth";

// AI Conversations
export const aiConversations = pgTable(
  "ai_conversations",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    model: text("model").notNull(),
    provider: text("provider").notNull(),
    createdAt: timestamp("created_at")
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: timestamp("updated_at")
      .notNull()
      .$defaultFn(() => new Date())
      .$onUpdateFn(() => new Date()),
  },
  (table) => [
    index("idx_ai_conversations_user_id").on(table.userId),
    index("idx_ai_conversations_created_at").on(table.createdAt),
  ],
);

export const CreateAIConversationSchema = createInsertSchema(aiConversations);

// AI Messages
export const aiMessages = pgTable(
  "ai_messages",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => aiConversations.id, { onDelete: "cascade" }),
    role: text("role").notNull(), // 'user' | 'assistant' | 'system'
    content: text("content").notNull(),
    metadata: jsonb("metadata"),
    tokens: integer("tokens"),
    createdAt: timestamp("created_at")
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    index("idx_ai_messages_conversation_id").on(table.conversationId),
    index("idx_ai_messages_created_at").on(table.createdAt),
  ],
);

export const CreateAIMessageSchema = createInsertSchema(aiMessages);

// AI Generations
export const aiGenerations = pgTable(
  "ai_generations",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    type: text("type").notNull(), // 'content' | 'code' | 'image' | 'analysis'
    prompt: text("prompt").notNull(),
    result: text("result").notNull(),
    model: text("model").notNull(),
    provider: text("provider").notNull(),
    tokens: integer("tokens"),
    cached: boolean("cached").default(false),
    createdAt: timestamp("created_at")
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    index("idx_ai_generations_user_id").on(table.userId),
    index("idx_ai_generations_type").on(table.type),
    index("idx_ai_generations_created_at").on(table.createdAt),
  ],
);

export const CreateAIGenerationSchema = createInsertSchema(aiGenerations);

// AI Analyses
export const aiAnalyses = pgTable(
  "ai_analyses",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    dataType: text("data_type").notNull(), // 'csv' | 'json' | 'text'
    dataSource: text("data_source").notNull(),
    analysisType: text("analysis_type").notNull(), // 'trend' | 'summary' | 'prediction' | 'anomaly'
    results: jsonb("results").notNull(),
    model: text("model").notNull(),
    tokens: integer("tokens"),
    cached: boolean("cached").default(false),
    createdAt: timestamp("created_at")
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    index("idx_ai_analyses_user_id").on(table.userId),
    index("idx_ai_analyses_data_type").on(table.dataType),
    index("idx_ai_analyses_analysis_type").on(table.analysisType),
    index("idx_ai_analyses_created_at").on(table.createdAt),
  ],
);

export const CreateAIAnalysisSchema = createInsertSchema(aiAnalyses);
