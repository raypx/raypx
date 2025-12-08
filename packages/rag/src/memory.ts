/**
 * Memory configuration for RAG conversations
 * Note: We use database-backed conversation history instead of LangChain Memory
 * This file provides memory type definitions and utilities
 *
 * LangChain Memory classes are not available in browser environments,
 * so we implement memory functionality through our database conversation system.
 */

export type MemoryType = "buffer" | "summary";

export interface MemoryConfig {
  type?: MemoryType;
  maxTokenLimit?: number; // For summary memory, compress when exceeding this limit
  returnMessages?: boolean;
}

/**
 * Memory configuration helper
 * Actual memory management is handled by the conversation.ts module
 * which stores conversation history in the database
 */
export function getMemoryConfig(config: MemoryConfig = {}): MemoryConfig {
  return {
    type: config.type || "buffer",
    maxTokenLimit: config.maxTokenLimit || 2000,
    returnMessages: config.returnMessages ?? true,
  };
}

/**
 * Load conversation history from database and convert to LangChain messages
 */
export function loadConversationHistory(
  messages: Array<{
    role: string;
    content: string;
    thinking?: string | null;
    sources?: unknown;
  }>,
): Array<{ role: string; content: string }> {
  return messages.map((msg) => ({
    role: msg.role,
    content: msg.content,
  }));
}
