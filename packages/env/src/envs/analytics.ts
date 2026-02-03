import { z } from "zod/v4";

export const analyticsEnv = {
  id: "analytics",
  client: {
    NEXT_PUBLIC_POSTHOG_KEY: z.string().startsWith("phc_").optional(),
    NEXT_PUBLIC_POSTHOG_HOST: z.url().optional(),
    NEXT_PUBLIC_POSTHOG_INGESTION_URL: z.url().optional(),
    NEXT_PUBLIC_ENABLE_GA: z.coerce.boolean().optional().default(false),
    NEXT_PUBLIC_GA_MEASUREMENT_ID: z.string().startsWith("G-").optional(),
    NEXT_PUBLIC_ANALYTICS_DISABLED: z.coerce.boolean().optional(),
    NEXT_PUBLIC_ANALYTICS_DEBUG: z.coerce.boolean().optional(),
  },
  env: {
    NEXT_PUBLIC_POSTHOG_KEY: process.env.NEXT_PUBLIC_POSTHOG_KEY,
    NEXT_PUBLIC_POSTHOG_HOST: process.env.NEXT_PUBLIC_POSTHOG_HOST,
    NEXT_PUBLIC_POSTHOG_INGESTION_URL: process.env.NEXT_PUBLIC_POSTHOG_INGESTION_URL,
    NEXT_PUBLIC_ENABLE_GA: process.env.NEXT_PUBLIC_ENABLE_GA,
    NEXT_PUBLIC_GA_MEASUREMENT_ID: process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID,
    NEXT_PUBLIC_ANALYTICS_DISABLED: process.env.NEXT_PUBLIC_ANALYTICS_DISABLED,
    NEXT_PUBLIC_ANALYTICS_DEBUG: process.env.NEXT_PUBLIC_ANALYTICS_DEBUG,
  },
} as const;
