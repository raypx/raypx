import { z } from "zod/v4";

export const redisEnv = {
  id: "redis",
  server: {
    REDIS_URL: z.url().min(1),
  },
  env: {
    REDIS_URL: process.env.REDIS_URL,
  },
} as const;
