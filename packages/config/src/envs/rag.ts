import { z } from "@raypx/env";

export const ragEnv = {
  id: "rag",
  server: {
    // Provider selection
    EMBEDDING_PROVIDER: z.enum(["openai", "huggingface", "cohere", "deepseek", "aliyun"]).default("openai"),
    EMBEDDING_API_KEY: z.string().min(1).optional(), // Unified API key for all providers
    EMBEDDING_API_URL: z.string().url().optional(), // For self-hosted models (DeepSeek endpoint is hardcoded, but can be overridden here)

    // Model configuration
    EMBEDDING_MODEL: z.string().optional(), // Provider-specific model name
    EMBEDDING_DIMENSIONS: z.coerce.number().optional(), // Will use provider default if not set

    // Chunking configuration
    CHUNK_SIZE: z.coerce.number().default(1000),
    CHUNK_OVERLAP: z.coerce.number().default(200),
  },
} as const;
