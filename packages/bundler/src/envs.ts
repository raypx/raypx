import { createEnv, z } from "@raypx/env";

export const envs = () =>
  createEnv({
    client: {},
    shared: {
      NODE_ENV: z.enum(["development", "production"]).default("development"),
    },
    server: {},
  });
