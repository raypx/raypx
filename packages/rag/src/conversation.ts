/**
 * Conversation history management
 * Handles saving and loading conversation history from database
 */

import { and, db, desc, eq, type InferSelectModel } from "@raypx/database";
import { conversationMessages, conversations } from "@raypx/database/schemas";
import { logger } from "./utils";

export interface ConversationMessage {
  role: "user" | "assistant" | "system";
  content: string;
  thinking?: string | null;
  sources?: unknown;
}

export type Conversation = InferSelectModel<typeof conversations>;

/**
 * Create a new conversation
 */
export async function createConversation(
  userId: string,
  options: {
    documentId?: string;
    datasetId?: string;
    title?: string;
    metadata?: unknown;
  } = {},
): Promise<string> {
  const [conversation] = await db
    .insert(conversations)
    .values({
      userId,
      documentId: options.documentId || null,
      datasetId: options.datasetId || null,
      title: options.title || null,
      metadata: options.metadata || null,
    })
    .returning({ id: conversations.id });

  if (!conversation) {
    throw new Error("Failed to create conversation");
  }

  logger.debug("Created conversation", { conversationId: conversation.id, userId });
  return conversation.id;
}

/**
 * Save a message to conversation
 */
export async function saveMessage(
  conversationId: string,
  message: ConversationMessage,
): Promise<void> {
  await db.insert(conversationMessages).values({
    conversationId,
    role: message.role,
    content: message.content,
    thinking: message.thinking || null,
    sources: message.sources || null,
    metadata: null,
  });

  // Update conversation updatedAt timestamp
  await db
    .update(conversations)
    .set({ updatedAt: new Date() })
    .where(eq(conversations.id, conversationId));

  logger.debug("Saved message to conversation", { conversationId, role: message.role });
}

/**
 * Load conversation messages
 */
export async function loadConversationMessages(
  conversationId: string,
  limit?: number,
): Promise<ConversationMessage[]> {
  let query = db
    .select({
      role: conversationMessages.role,
      content: conversationMessages.content,
      thinking: conversationMessages.thinking,
      sources: conversationMessages.sources,
    })
    .from(conversationMessages)
    .where(eq(conversationMessages.conversationId, conversationId))
    .orderBy(conversationMessages.createdAt);

  if (limit) {
    query = query.limit(limit) as typeof query;
  }

  const messages = await query;

  return messages.map((msg) => ({
    role: msg.role as "user" | "assistant" | "system",
    content: msg.content,
    thinking: msg.thinking,
    sources: msg.sources as unknown,
  }));
}

/**
 * Get user's conversations for a document or dataset
 */
export async function getUserConversations(
  userId: string,
  options: {
    documentId?: string;
    datasetId?: string;
    limit?: number;
  } = {},
): Promise<Conversation[]> {
  const conditions = [eq(conversations.userId, userId)];

  if (options.documentId) {
    conditions.push(eq(conversations.documentId, options.documentId));
  }

  if (options.datasetId) {
    conditions.push(eq(conversations.datasetId, options.datasetId));
  }

  let query = db
    .select()
    .from(conversations)
    .where(and(...conditions))
    .orderBy(desc(conversations.updatedAt));

  if (options.limit) {
    query = query.limit(options.limit) as typeof query;
  }

  const results = await query;

  return results.map((conv) => ({
    id: conv.id,
    title: conv.title,
    documentId: conv.documentId,
    datasetId: conv.datasetId,
    userId: conv.userId,
    summary: conv.summary,
    metadata: conv.metadata,
    createdAt: conv.createdAt,
    updatedAt: conv.updatedAt,
  }));
}

/**
 * Update conversation summary
 */
export async function updateConversationSummary(
  conversationId: string,
  summary: string,
): Promise<void> {
  await db
    .update(conversations)
    .set({ summary, updatedAt: new Date() })
    .where(eq(conversations.id, conversationId));

  logger.debug("Updated conversation summary", { conversationId });
}

/**
 * Clear all messages from a conversation (keeps the conversation itself)
 */
export async function clearConversationMessages(
  conversationId: string,
  userId: string,
): Promise<void> {
  // Verify ownership
  const [conversation] = await db
    .select()
    .from(conversations)
    .where(and(eq(conversations.id, conversationId), eq(conversations.userId, userId)))
    .limit(1);

  if (!conversation) {
    throw new Error("Conversation not found or access denied");
  }

  // Delete all messages
  await db
    .delete(conversationMessages)
    .where(eq(conversationMessages.conversationId, conversationId));

  // Update conversation updatedAt timestamp
  await db
    .update(conversations)
    .set({ updatedAt: new Date() })
    .where(eq(conversations.id, conversationId));

  logger.debug("Cleared conversation messages", { conversationId, userId });
}

/**
 * Delete a conversation
 */
export async function deleteConversation(conversationId: string, userId: string): Promise<void> {
  // Verify ownership
  const [conversation] = await db
    .select()
    .from(conversations)
    .where(and(eq(conversations.id, conversationId), eq(conversations.userId, userId)))
    .limit(1);

  if (!conversation) {
    throw new Error("Conversation not found or access denied");
  }

  // Cascade delete will handle messages
  await db.delete(conversations).where(eq(conversations.id, conversationId));

  logger.debug("Deleted conversation", { conversationId, userId });
}
