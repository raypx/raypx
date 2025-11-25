// Re-export PostHog hooks
export { usePostHog } from "@posthog/react";

// Re-export Vercel Analytics component
export { Analytics } from "@vercel/analytics/react";

// Configuration
export type { AnalyticsConfig } from "./config";
export { createAnalyticsConfig, defaultAnalyticsConfig } from "./config";

// Environment variables
export { analyticsEnv, envs } from "./envs";

// Hooks
export * from "./hooks";

// PostHog utilities
export { getPostHog, initPostHog } from "./posthog/init";

// Providers
export {
  AnalyticsConfigProvider,
  AnalyticsProvider,
  PostHogProvider,
  useAnalyticsConfig,
} from "./providers";

// Types
export type * from "./types";

// Utilities
export { logger } from "./utils";
