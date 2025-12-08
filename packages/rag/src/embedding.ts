/**
 * Embedding generation using LangChain
 * Provides unified interface for multiple embedding providers
 */

import type { Embeddings } from "@langchain/core/embeddings";
import { createLangChainEmbeddings, createLangChainEmbeddingsFromEnv } from "./embedding/langchain";
import { logger } from "./utils";

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
 * Get embeddings instance based on options
 * If provider is specified, create a new instance; otherwise use the default singleton
 */
function getEmbeddingsFromOptions(options: EmbeddingOptions = {}): Embeddings {
  if (options.provider) {
    return createLangChainEmbeddings({
      provider: options.provider,
      apiKey: options.apiKey,
      model: options.model,
      dimensions: options.dimensions,
      apiUrl: options.apiUrl,
    });
  }
  return getEmbeddingsInstance();
}

/**
 * Generate embeddings for text
 */
export async function generateEmbedding(
  text: string,
  options: EmbeddingOptions = {},
): Promise<number[]> {
  try {
    logger.debug("Generating embedding", {
      textLength: text.length,
      provider: options.provider,
      model: options.model,
    });
    const embeddings = getEmbeddingsFromOptions(options);
    const result = await embeddings.embedQuery(text).catch((error: unknown) => {
      logger.error("Failed to embed query", {
        error: error instanceof Error ? error.message : String(error),
        errorType: error instanceof Error ? error.constructor.name : typeof error,
        textLength: text.length,
      });
      throw error;
    });
    logger.debug("Embedding result", {
      dimensions: result.length,
    });
    return result;
  } catch (error) {
    logger.error("Failed to generate embedding", {
      error: error instanceof Error ? error.message : String(error),
      errorType: error instanceof Error ? error.constructor.name : typeof error,
      textLength: text.length,
    });
    throw error;
  }
}

/**
 * Generate embeddings for multiple texts in batch
 */
export async function generateEmbeddings(
  texts: string[],
  options: EmbeddingOptions = {},
): Promise<number[][]> {
  try {
    logger.debug("Generating embeddings", {
      textsCount: texts.length,
      provider: options.provider,
      model: options.model,
    });
    const embeddings = getEmbeddingsFromOptions(options);

    // Get batch size limit for the provider
    const provider = options.provider || process.env.EMBEDDING_PROVIDER || "default";
    logger.debug("Provider", { provider });
    const batchSize = getBatchSizeLimit(provider);
    logger.debug("Batch size", { batchSize });

    // If texts count is within limit, process directly
    if (texts.length <= batchSize) {
      logger.debug("Texts count is within limit, processing directly");
      const results = await embeddings.embedDocuments(texts).catch((error: unknown) => {
        logger.error("Failed to embed documents", {
          error: error instanceof Error ? error.message : String(error),
          errorType: error instanceof Error ? error.constructor.name : typeof error,
          errorStack: error instanceof Error ? error.stack : undefined,
          textsCount: texts.length,
        });
        throw error;
      });
      logger.debug("Embedding results", {
        count: results.length,
        dimensions: results[0]?.length || 0,
      });
      return results;
    }

    // Process in batches
    const results: number[][] = [];
    for (let i = 0; i < texts.length; i += batchSize) {
      logger.debug("Processing batch", {
        batchIndex: i,
        batchSize,
        batchTextsCount: Math.min(batchSize, texts.length - i),
      });
      const batch = texts.slice(i, i + batchSize);
      const batchResults = await embeddings.embedDocuments(batch).catch((error: unknown) => {
        logger.error("Failed to embed batch", {
          error: error instanceof Error ? error.message : String(error),
          errorType: error instanceof Error ? error.constructor.name : typeof error,
          batchIndex: i,
          batchSize: batch.length,
          totalTexts: texts.length,
        });
        throw error;
      });
      logger.debug("Batch embedding results", {
        batchIndex: i,
        count: batchResults.length,
        dimensions: batchResults[0]?.length || 0,
      });
      results.push(...batchResults);
    }

    return results;
  } catch (error) {
    logger.error("Failed to generate embeddings", { error });
    // Wrap error with more context
    const errorMessage = error instanceof Error ? error.message : String(error);
    const provider = options.provider || process.env.EMBEDDING_PROVIDER || "default";
    const model = options.model || process.env.EMBEDDING_MODEL || "default";
    logger.error("Failed to generate embeddings", {
      errorMessage,
      provider,
      model,
      textsCount: texts.length,
    });
    throw new Error(
      `Failed to generate embeddings: ${errorMessage}. Provider: ${provider}, Model: ${model}, Texts count: ${texts.length}`,
      { cause: error },
    );
  }
}

/**
 * Batch size limits for different embedding providers
 * Some providers have strict limits on batch size
 */
const BATCH_SIZE_LIMITS: Record<string, number> = {
  aliyun: 10, // Alibaba Cloud DashScope limits batch size to 10
  cohere: 96, // Cohere typically allows larger batches, but be conservative
  openai: 2048, // OpenAI allows up to 2048 texts per request
  huggingface: 100, // Hugging Face allows larger batches
  deepseek: 2048, // DeepSeek uses OpenAI-compatible API
} as const;

const DEFAULT_BATCH_SIZE = 10; // Conservative default batch size

/**
 * Get batch size limit for embedding provider
 */
function getBatchSizeLimit(provider: string): number {
  return BATCH_SIZE_LIMITS[provider] ?? DEFAULT_BATCH_SIZE;
}
