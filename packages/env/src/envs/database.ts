import { z } from "zod/v4";

export const databaseEnv = {
  id: "database",
  server: {
    DATABASE_URL: z.string().min(1),
    DATABASE_MAX_CONNECTIONS: z
      .string()
      .optional()
      .transform((val) => (val ? Number.parseInt(val, 10) : undefined)),
    DATABASE_PREPARE: z
      .string()
      .optional()
      .transform((val) => val === "true" || val === "1"),
    VECTOR_URL: z
      .string()
      .optional()
      .transform((val) => {
        // If VECTOR_URL is not set or empty, fallback to DATABASE_URL
        // val can be string | undefined, so we need to handle both cases
        return val?.trim() || process.env.DATABASE_URL || "";
      }),
    DATABASE_PREFIX: z.string().min(1).optional(),
  },
  env: {
    DATABASE_URL: process.env.DATABASE_URL,
    DATABASE_MAX_CONNECTIONS: process.env.DATABASE_MAX_CONNECTIONS,
    DATABASE_PREPARE: process.env.DATABASE_PREPARE,
    VECTOR_URL: process.env.VECTOR_URL,
    DATABASE_PREFIX: process.env.DATABASE_PREFIX,
  },
} as const;
