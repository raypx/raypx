import { createEnv, z } from "@raypx/env";

export const analyticsEnv = {
  id: "analytics",
  client: {
    // PostHog (推荐使用)
    VITE_PUBLIC_POSTHOG_KEY: z.string().startsWith("phc_").optional(),
    VITE_PUBLIC_POSTHOG_HOST: z.url().optional(),
    VITE_PUBLIC_POSTHOG_INGESTION_URL: z.url().optional(),

    // Google Analytics (默认关闭，需要时启用)
    VITE_PUBLIC_ENABLE_GA: z.coerce.boolean().optional().default(false),
    VITE_PUBLIC_GA_MEASUREMENT_ID: z.string().startsWith("G-").optional(),

    // 全局控制
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
