/**
 * RAG configuration management
 * Supports reading configuration from database (user-specific) or environment variables (fallback)
 */

import { getConfigWithFallback, getOrCreateNamespace } from "@raypx/database";
import type { LangChainProviderType } from "./embedding/langchain";

export interface RAGConfig {
  provider?: LangChainProviderType;
  apiKey?: string;
  apiUrl?: string;
  model?: string;
  dimensions?: number;
  chunkSize?: number;
  chunkOverlap?: number;
}

/**
 * RAG configuration namespace name
 */
const RAG_NAMESPACE_NAME = "rag";

/**
 * Configuration keys
 */
const CONFIG_KEYS = {
  PROVIDER: "embedding_provider",
  API_KEY: "embedding_api_key",
  API_URL: "embedding_api_url",
  MODEL: "embedding_model",
  DIMENSIONS: "embedding_dimensions",
  CHUNK_SIZE: "chunk_size",
  CHUNK_OVERLAP: "chunk_overlap",
} as const;

/**
 * Default API URLs for specific providers
 */
const DEFAULT_API_URLS: Record<string, string> = {
  deepseek: "https://api.deepseek.com/v1",
  aliyun: "https://dashscope.aliyuncs.com/compatible-mode/v1",
} as const;

/**
 * Get RAG configuration from database for a specific user
 * Falls back to environment variables if not found in database
 */
export async function getRAGConfig(userId: string): Promise<RAGConfig> {
  // Define fallback configuration from environment variables
  const fallbackConfig: Record<string, unknown> = {
    [CONFIG_KEYS.PROVIDER]: process.env.EMBEDDING_PROVIDER || "openai",
    [CONFIG_KEYS.API_KEY]: process.env.EMBEDDING_API_KEY,
    [CONFIG_KEYS.API_URL]: process.env.EMBEDDING_API_URL,
    [CONFIG_KEYS.MODEL]: process.env.EMBEDDING_MODEL,
    [CONFIG_KEYS.DIMENSIONS]: process.env.EMBEDDING_DIMENSIONS
      ? Number(process.env.EMBEDDING_DIMENSIONS)
      : undefined,
    [CONFIG_KEYS.CHUNK_SIZE]: process.env.CHUNK_SIZE ? Number(process.env.CHUNK_SIZE) : 1000,
    [CONFIG_KEYS.CHUNK_OVERLAP]: process.env.CHUNK_OVERLAP
      ? Number(process.env.CHUNK_OVERLAP)
      : 200,
  };

  // Get config from database with fallback
  const config = await getConfigWithFallback(userId, RAG_NAMESPACE_NAME, fallbackConfig);

  // Map database keys to config object properties
  const mappedConfig: RAGConfig = {
    provider: (config[CONFIG_KEYS.PROVIDER] ||
      fallbackConfig[CONFIG_KEYS.PROVIDER]) as LangChainProviderType,
    apiKey: (config[CONFIG_KEYS.API_KEY] || fallbackConfig[CONFIG_KEYS.API_KEY]) as
      | string
      | undefined,
    apiUrl: (config[CONFIG_KEYS.API_URL] || fallbackConfig[CONFIG_KEYS.API_URL]) as
      | string
      | undefined,
    model: (config[CONFIG_KEYS.MODEL] || fallbackConfig[CONFIG_KEYS.MODEL]) as string | undefined,
    dimensions: (config[CONFIG_KEYS.DIMENSIONS] ?? fallbackConfig[CONFIG_KEYS.DIMENSIONS]) as
      | number
      | undefined,
    chunkSize: (config[CONFIG_KEYS.CHUNK_SIZE] || fallbackConfig[CONFIG_KEYS.CHUNK_SIZE]) as number,
    chunkOverlap: (config[CONFIG_KEYS.CHUNK_OVERLAP] ||
      fallbackConfig[CONFIG_KEYS.CHUNK_OVERLAP]) as number,
  };

  // Set default API URLs for specific providers
  if (mappedConfig.provider && !mappedConfig.apiUrl) {
    mappedConfig.apiUrl = DEFAULT_API_URLS[mappedConfig.provider];
  }

  return mappedConfig;
}

/**
 * Get RAG namespace ID for a user (create if not exists)
 */
export async function getOrCreateRAGNamespace(userId: string): Promise<string> {
  return getOrCreateNamespace(userId, RAG_NAMESPACE_NAME, {
    description: "RAG (Retrieval-Augmented Generation) configuration",
    icon: "brain",
  });
}
