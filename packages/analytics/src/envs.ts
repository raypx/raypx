import { createEnv, z } from "@raypx/env";

export const envs = createEnv({
  client: {
    VITE_PUBLIC_POSTHOG_KEY: z.string().startsWith("phc_").optional(),
    VITE_PUBLIC_POSTHOG_HOST: z.url().optional(),
    VITE_PUBLIC_POSTHOG_INGESTION_URL: z.url().optional(),
    VITE_PUBLIC_GA_MEASUREMENT_ID: z.string().startsWith("G-").optional(),
    VITE_PUBLIC_UMAMI_HOST: z.url().optional(),
    VITE_PUBLIC_UMAMI_WEBSITE_ID: z.string().optional(),
    VITE_PUBLIC_ANALYTICS_DISABLED: z.coerce.boolean().optional(),
    VITE_PUBLIC_ANALYTICS_DEBUG: z.coerce.boolean().optional(),
  },
  shared: {
    NODE_ENV: z.enum(["development", "production"]).default("development"),
  },
});
