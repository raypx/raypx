/**
 * AI Configuration Management
 * Supports reading configuration from database (user-specific) or environment variables (fallback)
 */

import { getConfigWithFallback, getOrCreateNamespace } from "@raypx/database";
import type { LLMProvider } from "./types";

export interface AIConfig {
  provider?: LLMProvider;
  apiKey?: string;
  apiUrl?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

/**
 * AI configuration namespace name
 */
const AI_NAMESPACE_NAME = "ai";

/**
 * Configuration keys
 */
const CONFIG_KEYS = {
  PROVIDER: "llm_provider",
  API_KEY: "llm_api_key",
  API_URL: "llm_api_url",
  MODEL: "llm_model",
  TEMPERATURE: "llm_temperature",
  MAX_TOKENS: "llm_max_tokens",
} as const;

/**
 * Default API URLs for specific providers
 */
const DEFAULT_API_URLS: Record<string, string> = {
  deepseek: "https://api.deepseek.com/v1",
  aliyun: "https://dashscope.aliyuncs.com/compatible-mode/v1",
} as const;

/**
 * Get AI configuration from database for a specific user
 * Falls back to environment variables if not found in database
 */
export async function getAIConfig(userId: string): Promise<AIConfig> {
  // Define fallback configuration from environment variables
  const fallbackConfig: Record<string, unknown> = {
    [CONFIG_KEYS.PROVIDER]: process.env.LLM_PROVIDER || "aliyun",
    [CONFIG_KEYS.API_KEY]: process.env.LLM_API_KEY,
    [CONFIG_KEYS.API_URL]: process.env.LLM_API_URL,
    [CONFIG_KEYS.MODEL]: process.env.LLM_MODEL,
    [CONFIG_KEYS.TEMPERATURE]: process.env.LLM_TEMPERATURE
      ? Number(process.env.LLM_TEMPERATURE)
      : 0.7,
    [CONFIG_KEYS.MAX_TOKENS]: process.env.LLM_MAX_TOKENS
      ? Number(process.env.LLM_MAX_TOKENS)
      : 2000,
  };

  // Get config from database with fallback
  const config = await getConfigWithFallback(userId, AI_NAMESPACE_NAME, fallbackConfig);

  // Map database keys to config object properties
  const mappedConfig: AIConfig = {
    provider: (config[CONFIG_KEYS.PROVIDER] || fallbackConfig[CONFIG_KEYS.PROVIDER]) as LLMProvider,
    apiKey: (config[CONFIG_KEYS.API_KEY] || fallbackConfig[CONFIG_KEYS.API_KEY]) as
      | string
      | undefined,
    apiUrl: (config[CONFIG_KEYS.API_URL] || fallbackConfig[CONFIG_KEYS.API_URL]) as
      | string
      | undefined,
    model: (config[CONFIG_KEYS.MODEL] || fallbackConfig[CONFIG_KEYS.MODEL]) as string | undefined,
    temperature: (config[CONFIG_KEYS.TEMPERATURE] ?? fallbackConfig[CONFIG_KEYS.TEMPERATURE]) as
      | number
      | undefined,
    maxTokens: (config[CONFIG_KEYS.MAX_TOKENS] ?? fallbackConfig[CONFIG_KEYS.MAX_TOKENS]) as
      | number
      | undefined,
  };

  // Set default API URLs for specific providers
  if (mappedConfig.provider && !mappedConfig.apiUrl) {
    mappedConfig.apiUrl = DEFAULT_API_URLS[mappedConfig.provider];
  }

  return mappedConfig;
}

/**
 * Get AI namespace ID for a user (create if not exists)
 */
export async function getOrCreateAINamespace(userId: string): Promise<string> {
  return getOrCreateNamespace(userId, AI_NAMESPACE_NAME, {
    description: "AI/LLM configuration",
    icon: "brain",
  });
}
