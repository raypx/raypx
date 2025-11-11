import { createEnv, z } from "@raypx/env";

export const redisEnv = {
  id: "redis",
  server: {
    REDIS_URL: z.url().min(1),
  },
} as const;

export const envs = () => createEnv(redisEnv);
