import { z } from "zod/v4";

export const observabilityEnv = {
  id: "observability",
  shared: {
    NEXT_PUBLIC_SENTRY_DSN: z.url().optional(),
    NEXT_PUBLIC_SENTRY_ENABLE_DEV: z.coerce.boolean().optional().default(false),
  },
  env: {
    NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
    NEXT_PUBLIC_SENTRY_ENABLE_DEV: process.env.NEXT_PUBLIC_SENTRY_ENABLE_DEV,
  },
} as const;
