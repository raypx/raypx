import { z } from "zod";

export const redisEnv = {
  id: "redis",
  server: {
    REDIS_URL: z.url().min(1),
  },
} as const;
