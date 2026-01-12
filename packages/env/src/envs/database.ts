import { z } from "zod";

export const databaseEnv = {
  id: "database",
  server: {
    DATABASE_URL: z.string().min(1),
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
} as const;
