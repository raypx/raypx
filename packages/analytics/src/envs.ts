import { createEnv, z } from "@raypx/shared";

export const envs = createEnv({
  client: {
    VITE_PUBLIC_POSTHOG_KEY: z.string().startsWith("phc_").optional(),
    VITE_PUBLIC_POSTHOG_HOST: z.url().optional(),
    VITE_PUBLIC_POSTHOG_INGESTION_URL: z.url().optional(),
    VITE_PUBLIC_GA_MEASUREMENT_ID: z.string().startsWith("G-").optional(),
    VITE_PUBLIC_UMAMI_HOST: z.url().optional(),
    VITE_PUBLIC_UMAMI_WEBSITE_ID: z.string().optional(),
    VITE_PUBLIC_ANALYTICS_DISABLED: z
      .string()
      .transform((val) => val === "true")
      .optional(),
    VITE_PUBLIC_ANALYTICS_DEBUG: z
      .string()
      .transform((val) => val === "true")
      .optional(),
  },
  runtimeEnv: {
    VITE_PUBLIC_POSTHOG_KEY: import.meta.env.VITE_PUBLIC_POSTHOG_KEY,
    VITE_PUBLIC_POSTHOG_HOST: import.meta.env.VITE_PUBLIC_POSTHOG_HOST,
    VITE_PUBLIC_POSTHOG_INGESTION_URL: import.meta.env.VITE_PUBLIC_POSTHOG_INGESTION_URL,
    VITE_PUBLIC_GA_MEASUREMENT_ID: import.meta.env.VITE_PUBLIC_GA_MEASUREMENT_ID,
    VITE_PUBLIC_UMAMI_HOST: import.meta.env.VITE_PUBLIC_UMAMI_HOST,
    VITE_PUBLIC_UMAMI_WEBSITE_ID: import.meta.env.VITE_PUBLIC_UMAMI_WEBSITE_ID,
    VITE_PUBLIC_ANALYTICS_DISABLED: import.meta.env.VITE_PUBLIC_ANALYTICS_DISABLED,
    VITE_PUBLIC_ANALYTICS_DEBUG: import.meta.env.VITE_PUBLIC_ANALYTICS_DEBUG,
  },
});
