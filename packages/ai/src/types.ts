/**
 * AI Framework Types
 * Core type definitions for the AI framework
 */

import type { BaseMessage } from "@langchain/core/messages";

/**
 * Supported LLM providers
 */
export type LLMProvider = "aliyun" | "openai" | "deepseek" | "anthropic" | "custom";

/**
 * Chat message role
 */
export type MessageRole = "user" | "assistant" | "system";

/**
 * Chat message interface
 */
export interface ChatMessage {
  role: MessageRole;
  content: string;
}

/**
 * LLM provider configuration
 */
export interface LLMProviderConfig {
  /**
   * Provider name/identifier
   */
  provider: LLMProvider;
  /**
   * API key for the provider
   */
  apiKey: string;
  /**
   * Base URL for the API (optional, some providers have defaults)
   */
  apiUrl?: string;
  /**
   * Model name/identifier
   */
  model: string;
  /**
   * Temperature for response generation (0-2)
   * @default 0.7
   */
  temperature?: number;
  /**
   * Maximum tokens in response
   * @default 2000
   */
  maxTokens?: number;
  /**
   * Additional provider-specific options
   */
  [key: string]: unknown;
}

/**
 * Chat completion options
 */
export interface ChatCompletionOptions {
  /**
   * Messages to send to the LLM
   */
  messages: ChatMessage[] | BaseMessage[];
  /**
   * Temperature for response generation (0-2)
   * @default 0.7
   */
  temperature?: number;
  /**
   * Maximum tokens in response
   * @default 2000
   */
  maxTokens?: number;
  /**
   * Additional provider-specific options
   */
  [key: string]: unknown;
}

/**
 * Chat completion response
 */
export interface ChatCompletionResponse {
  /**
   * Generated response content
   */
  content: string;
  /**
   * Thinking/reasoning content (for models like o1, o3)
   */
  thinking?: string;
  /**
   * Additional metadata from the provider
   */
  metadata?: Record<string, unknown>;
}

/**
 * Stream chunk types
 */
export type StreamChunkType = "chunk" | "thinking" | "sources" | "error" | "done";

/**
 * Stream chunk data
 */
export interface StreamChunk {
  type: StreamChunkType;
  content?: string;
  sources?: unknown[];
  error?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Stream callback function type
 */
export type StreamCallback = (chunk: StreamChunk) => void | Promise<void>;
