import { createEnv, z } from "@raypx/shared";

export const envs = () =>
  createEnv({
    clientPrefix: "VITE_",
    client: {},
    server: {
      REDIS_URL: z.url().min(1),
    },
    runtimeEnv: {
      REDIS_URL: import.meta.env.REDIS_URL,
    },
  });
