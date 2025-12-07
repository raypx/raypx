/**
 * Embedding generation using LangChain
 * Provides unified interface for multiple embedding providers
 */

import type { Embeddings } from "@langchain/core/embeddings";
import { createLangChainEmbeddings, createLangChainEmbeddingsFromEnv } from "./embedding/langchain";

let embeddingsInstance: Embeddings | null = null;

export function getEmbeddingsInstance() {
  if (!embeddingsInstance) {
    embeddingsInstance = createLangChainEmbeddingsFromEnv();
  }
  return embeddingsInstance;
}

export interface EmbeddingOptions {
  provider?: "openai" | "huggingface" | "cohere" | "deepseek" | "aliyun";
  model?: string;
  dimensions?: number;
  apiKey?: string;
  apiUrl?: string;
}

/**
 * Generate embeddings for text
 */
export async function generateEmbedding(
  text: string,
  options: EmbeddingOptions = {},
): Promise<number[]> {
  const embeddings = options.provider
    ? createLangChainEmbeddings({
        provider: options.provider,
        apiKey: options.apiKey,
        model: options.model,
        dimensions: options.dimensions,
        apiUrl: options.apiUrl,
      })
    : getEmbeddingsInstance();

  const result = await embeddings.embedQuery(text);
  return result;
}

/**
 * Generate embeddings for multiple texts in batch
 */
export async function generateEmbeddings(
  texts: string[],
  options: EmbeddingOptions = {},
): Promise<number[][]> {
  try {
    const embeddings = options.provider
      ? createLangChainEmbeddings({
          provider: options.provider,
          apiKey: options.apiKey,
          model: options.model,
          dimensions: options.dimensions,
          apiUrl: options.apiUrl,
        })
      : getEmbeddingsInstance();

    // Get batch size limit for the provider
    const provider = options.provider || process.env.EMBEDDING_PROVIDER || "default";
    const batchSize = getBatchSizeLimit(provider);

    // If texts count is within limit, process directly
    if (texts.length <= batchSize) {
      const results = await embeddings.embedDocuments(texts);
      return results;
    }

    // Process in batches
    const results: number[][] = [];
    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);
      const batchResults = await embeddings.embedDocuments(batch);
      results.push(...batchResults);
    }

    return results;
  } catch (error) {
    // Wrap error with more context
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Failed to generate embeddings: ${errorMessage}. ` +
      `Provider: ${options.provider || process.env.EMBEDDING_PROVIDER || "default"}, ` +
      `Model: ${options.model || process.env.EMBEDDING_MODEL || "default"}, ` +
      `Texts count: ${texts.length}`,
      { cause: error },
    );
  }
}

/**
 * Get batch size limit for embedding provider
 * Some providers have strict limits on batch size
 */
function getBatchSizeLimit(provider: string): number {
  switch (provider) {
    case "aliyun":
      // Alibaba Cloud DashScope limits batch size to 10
      return 10;
    case "cohere":
      // Cohere typically allows larger batches, but be conservative
      return 96;
    case "openai":
      // OpenAI allows up to 2048 texts per request
      return 2048;
    case "huggingface":
      // Hugging Face allows larger batches
      return 100;
    case "deepseek":
      // DeepSeek uses OpenAI-compatible API
      return 2048;
    default:
      // Default to conservative batch size
      return 10;
  }
}
