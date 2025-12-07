/**
 * Factory for creating embedding providers based on configuration
 */

import type { EmbeddingProvider } from "./providers/base";
import { CohereProvider } from "./providers/cohere";
import { HuggingFaceProvider } from "./providers/huggingface";
import { OpenAIProvider } from "./providers/openai";

export type EmbeddingProviderType = "openai" | "huggingface" | "cohere";

export interface EmbeddingConfig {
  provider: EmbeddingProviderType;
  apiKey?: string;
  model?: string;
  dimensions?: number;
  apiUrl?: string; // For self-hosted models
}

/**
 * Create an embedding provider based on configuration
 */
export function createEmbeddingProvider(config: EmbeddingConfig): EmbeddingProvider {
  switch (config.provider) {
    case "openai":
      if (!config.apiKey) {
        throw new Error("OpenAI API key is required");
      }
      return new OpenAIProvider({
        apiKey: config.apiKey,
        model: config.model,
        dimensions: config.dimensions,
      });

    case "huggingface":
      return new HuggingFaceProvider({
        apiKey: config.apiKey,
        model: config.model,
        apiUrl: config.apiUrl,
      });

    case "cohere":
      if (!config.apiKey) {
        throw new Error("Cohere API key is required");
      }
      return new CohereProvider({
        apiKey: config.apiKey,
        model: config.model,
      });

    default:
      throw new Error(`Unsupported embedding provider: ${config.provider}`);
  }
}

/**
 * Create embedding provider from environment variables
 */
export function createEmbeddingProviderFromEnv(): EmbeddingProvider {
  const provider = (process.env.EMBEDDING_PROVIDER || "openai") as EmbeddingProviderType;

  // Use unified EMBEDDING_API_KEY for all providers
  const apiKey = process.env.EMBEDDING_API_KEY;

  const config: EmbeddingConfig = {
    provider,
    apiKey,
    model: process.env.EMBEDDING_MODEL,
    dimensions: process.env.EMBEDDING_DIMENSIONS
      ? Number(process.env.EMBEDDING_DIMENSIONS)
      : undefined,
    apiUrl: process.env.EMBEDDING_API_URL,
  };

  return createEmbeddingProvider(config);
}
