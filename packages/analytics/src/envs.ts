import { createEnv, z } from "@raypx/env";

export const analyticsEnv = {
  id: "analytics",
  client: {
    // PostHog (recommended)
    VITE_PUBLIC_POSTHOG_KEY: z.string().startsWith("phc_").optional(),
    VITE_PUBLIC_POSTHOG_HOST: z.url().optional(),
    VITE_PUBLIC_POSTHOG_INGESTION_URL: z.url().optional(),

    // Google Analytics (disabled by default, enable when needed)
    VITE_PUBLIC_ENABLE_GA: z.coerce.boolean().optional().default(false),
    VITE_PUBLIC_GA_MEASUREMENT_ID: z.string().startsWith("G-").optional(),

    // Global controls
    VITE_PUBLIC_ANALYTICS_DISABLED: z.coerce.boolean().optional(),
    VITE_PUBLIC_ANALYTICS_DEBUG: z.coerce.boolean().optional(),
  },
  shared: {
    NODE_ENV: z.enum(["development", "production"]).default("development"),
    VITE_SENTRY_DSN: z.url().optional(),
    VITE_SENTRY_ENABLE_DEV: z.coerce.boolean().optional().default(false),
  },
} as const;

export const envs = () => createEnv(analyticsEnv);
