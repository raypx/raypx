import { z } from "zod";

export const observabilityEnv = {
  id: "observability",
  shared: {
    NODE_ENV: z.enum(["development", "production"]).default("development"),
    VITE_SENTRY_DSN: z.url().optional(),
    VITE_SENTRY_ENABLE_DEV: z.coerce.boolean().optional().default(false),
  },
} as const;
