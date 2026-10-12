import { createEnv, type Preset, z } from "@voidmix/shared/env";
import { runtimeEnv } from "@voidmix/shared/env/runtime";
import { loggerEnv } from "@voidmix/shared/logger/env";

export const webEnv = {
  id: "web",
  extends: [runtimeEnv, loggerEnv],
  client: {
    VITE_API_URL: z.url().optional(),
    VITE_POSTHOG_KEY: z.string().optional(),
    VITE_POSTHOG_HOST: z.url().optional(),
    VITE_SENTRY_DSN: z.url().optional(),
    VITE_SUPPORT_EMAIL: z.email().optional(),
    VITE_SITE_URL: z.url().optional(),
  },
} as const satisfies Preset;

export const env = createEnv(webEnv);
