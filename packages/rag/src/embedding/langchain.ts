/**
 * LangChain-based embedding provider
 * Supports multiple embedding providers through LangChain's unified interface
 */

import { CohereEmbeddings } from "@langchain/cohere";
import { HuggingFaceInferenceEmbeddings } from "@langchain/community/embeddings/hf";
import type { Embeddings } from "@langchain/core/embeddings";
import { OpenAIEmbeddings } from "@langchain/openai";

export type LangChainProviderType = "openai" | "huggingface" | "cohere" | "deepseek" | "aliyun";

export interface LangChainEmbeddingConfig {
  provider: LangChainProviderType;
  apiKey?: string;
  model?: string;
  dimensions?: number;
  apiUrl?: string;
}

/**
 * Create LangChain embeddings instance based on provider
 */
export function createLangChainEmbeddings(config: LangChainEmbeddingConfig): Embeddings {
  switch (config.provider) {
    case "openai": {
      if (!config.apiKey) {
        throw new Error("OpenAI API key is required");
      }
      return new OpenAIEmbeddings({
        openAIApiKey: config.apiKey,
        modelName: config.model || "text-embedding-3-small",
        dimensions: config.dimensions,
      });
    }

    case "huggingface": {
      const options: any = {
        apiKey: config.apiKey,
        model: config.model || "sentence-transformers/all-MiniLM-L6-v2",
      };
      if (config.apiUrl) {
        options.endpoint = config.apiUrl;
      }
      return new HuggingFaceInferenceEmbeddings(options);
    }

    case "cohere": {
      if (!config.apiKey) {
        throw new Error("Cohere API key is required");
      }
      // CohereEmbeddings doesn't support model parameter in constructor
      return new CohereEmbeddings({
        apiKey: config.apiKey,
      }) as Embeddings;
    }

    case "deepseek": {
      if (!config.apiKey) {
        throw new Error("DeepSeek API key is required");
      }
      // ⚠️ WARNING: DeepSeek may not support embeddings API
      // DeepSeek primarily provides chat models (deepseek-chat), not embedding models
      // If you encounter MODEL_NOT_FOUND (404) errors, DeepSeek likely doesn't support embeddings
      //
      // Recommended alternatives:
      // - Use OpenAI for embeddings (EMBEDDING_PROVIDER=openai)
      // - Use Hugging Face for embeddings (EMBEDDING_PROVIDER=huggingface)
      // - Use Cohere for embeddings (EMBEDDING_PROVIDER=cohere)
      //
      // If you must use DeepSeek, ensure:
      // 1. DeepSeek actually supports embeddings API (check official documentation)
      // 2. Use the correct model name via EMBEDDING_MODEL environment variable
      // 3. Verify the API endpoint is correct
      const baseURL = config.apiUrl || "https://api.deepseek.com/v1";
      const modelName = config.model || "text-embedding-3-small";

      const embeddings = new OpenAIEmbeddings({
        openAIApiKey: config.apiKey,
        modelName,
        configuration: {
          baseURL,
        },
        dimensions: config.dimensions,
      });

      // Wrap to provide better error messages
      return new Proxy(embeddings, {
        get(target, prop) {
          const value = target[prop as keyof typeof target];
          if (typeof value === "function") {
            return async (...args: unknown[]) => {
              try {
                return await (value as (...args: unknown[]) => Promise<unknown>).apply(
                  target,
                  args,
                );
              } catch (error: unknown) {
                if (
                  error &&
                  typeof error === "object" &&
                  "status" in error &&
                  error.status === 404
                ) {
                  throw new Error(
                    `DeepSeek embedding model not found (404). ` +
                      `DeepSeek may not support embeddings API. ` +
                      `Please use a different provider (OpenAI, Hugging Face, or Cohere) ` +
                      `or check DeepSeek documentation for embedding support. ` +
                      `Original error: ${error instanceof Error ? error.message : String(error)}`,
                  );
                }
                throw error;
              }
            };
          }
          return value;
        },
      }) as Embeddings;
    }

    case "aliyun": {
      if (!config.apiKey) {
        throw new Error("Alibaba Cloud API key is required");
      }
      // Alibaba Cloud (阿里云) provides embedding services through DashScope (通义千问)
      // DashScope uses OpenAI-compatible API format
      // API endpoint: https://dashscope.aliyuncs.com/compatible-mode/v1
      const baseURL = config.apiUrl || "https://dashscope.aliyuncs.com/compatible-mode/v1";
      // Alibaba Cloud embedding models: text-embedding-v1, text-embedding-v2, etc.
      const modelName = config.model || "text-embedding-v3";

      return new OpenAIEmbeddings({
        openAIApiKey: config.apiKey,
        modelName,
        configuration: {
          baseURL,
        },
        dimensions: config.dimensions,
      });
    }

    default:
      throw new Error(`Unsupported provider: ${config.provider}`);
  }
}

/**
 * Create LangChain embeddings from environment variables
 */
export function createLangChainEmbeddingsFromEnv(): Embeddings {
  const provider = (process.env.EMBEDDING_PROVIDER || "openai") as LangChainProviderType;

  // Use unified EMBEDDING_API_KEY for all providers
  const apiKey = process.env.EMBEDDING_API_KEY;

  // For DeepSeek and Aliyun, use hardcoded API URL (can be overridden via EMBEDDING_API_URL)
  let apiUrl = process.env.EMBEDDING_API_URL;
  if (provider === "deepseek" && !apiUrl) {
    apiUrl = "https://api.deepseek.com/v1";
  }
  if (provider === "aliyun" && !apiUrl) {
    apiUrl = "https://dashscope.aliyuncs.com/compatible-mode/v1";
  }

  return createLangChainEmbeddings({
    provider,
    apiKey,
    model: process.env.EMBEDDING_MODEL,
    dimensions: process.env.EMBEDDING_DIMENSIONS
      ? Number(process.env.EMBEDDING_DIMENSIONS)
      : undefined,
    apiUrl,
  });
}
