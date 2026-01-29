import { z } from "zod/v4";

export const redisEnv = {
  id: "redis",
  server: {
    REDIS_URL: z.url().min(1),
  },
} as const;
