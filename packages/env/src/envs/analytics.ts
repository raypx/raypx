import { z } from "zod";

export const analyticsEnv = {
  id: "analytics",
  client: {
    // PostHog (recommended)
    NEXT_PUBLIC_POSTHOG_KEY: z.string().startsWith("phc_").optional(),
    NEXT_PUBLIC_POSTHOG_HOST: z.url().optional(),
    NEXT_PUBLIC_POSTHOG_INGESTION_URL: z.url().optional(),

    // Google Analytics (disabled by default, enable when needed)
    NEXT_PUBLIC_ENABLE_GA: z.coerce.boolean().optional().default(false),
    NEXT_PUBLIC_GA_MEASUREMENT_ID: z.string().startsWith("G-").optional(),

    // Global controls
    NEXT_PUBLIC_ANALYTICS_DISABLED: z.coerce.boolean().optional(),
    NEXT_PUBLIC_ANALYTICS_DEBUG: z.coerce.boolean().optional(),
  },
  shared: {
    NODE_ENV: z.enum(["development", "production"]).default("development"),
  },
} as const;
