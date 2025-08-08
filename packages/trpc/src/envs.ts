import { createEnv, z } from "@raypx/shared"

export const envs = () =>
  createEnv({
    client: {
      NEXT_PUBLIC_WEB_URL: z.url().min(1),
    },
    shared: {},
    server: {},
    runtimeEnv: {
      NEXT_PUBLIC_WEB_URL: process.env.NEXT_PUBLIC_WEB_URL,
    },
  })
