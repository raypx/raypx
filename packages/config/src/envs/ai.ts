import { z } from "zod";

export const aiEnv = {
  id: "ai",
  server: {
    // OpenAI
    OPENAI_API_KEY: z.string().startsWith("sk-").optional(),

    // Anthropic
    ANTHROPIC_API_KEY: z.string().startsWith("sk-ant-").optional(),

    // AI Configuration
    AI_DEFAULT_PROVIDER: z.enum(["openai", "anthropic"]).default("openai"),
    AI_DEFAULT_MODEL: z.string().default("gpt-4o"),

    // Cache Configuration
    AI_CACHE_TTL: z.coerce.number().default(3600), // 1 hour

    // Rate Limiting
    AI_RATE_LIMIT_REQUESTS: z.coerce.number().default(60), // per minute
    AI_RATE_LIMIT_TOKENS: z.coerce.number().default(100000), // per day

    // Token Limits
    AI_MAX_TOKENS: z.coerce.number().default(4096),
    AI_TEMPERATURE: z.coerce.number().min(0).max(2).default(0.7).optional(),
  },
} as const;
