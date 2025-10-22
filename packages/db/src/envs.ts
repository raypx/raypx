import { createEnv, z } from "@raypx/shared";

export const envs = () =>
  createEnv({
    server: {
      DATABASE_URL: z.string().min(1),
      DATABASE_PREFIX: z.string().min(1).optional(),
      DATABASE_PROVIDER: z.enum(["postgres", "neon"]).default("postgres"),
    },
  });
