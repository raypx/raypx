import { createEnv, z } from "@raypx/shared"

export const envs = () =>
  createEnv({
    server: {
      REDIS_URL: z.string().min(1).url(),
    },
    runtimeEnv: {
      REDIS_URL: process.env.REDIS_URL,
    },
  })
