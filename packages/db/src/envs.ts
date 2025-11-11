import { createEnv, z } from "@raypx/env";

export const databaseEnv = {
  id: "database",
  server: {
    DATABASE_URL: z.string().min(1),
    DATABASE_PREFIX: z.string().min(1).optional(),
    DATABASE_PROVIDER: z.enum(["postgres", "neon"]).default("postgres"),
  },
} as const;

export const envs = () => createEnv(databaseEnv);
