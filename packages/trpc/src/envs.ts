import { createEnv, z } from "@raypx/shared"

export const envs = () =>
  createEnv({
    client: {
      NEXT_PUBLIC_WEB_URL: z.string().url(),
    },
    shared: {},
    server: {},
    runtimeEnv: {
      NEXT_PUBLIC_WEB_URL: process.env.NEXT_PUBLIC_WEB_URL,
    },
  })
