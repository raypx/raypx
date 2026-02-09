import { env } from "./envs";

/**
 * Analytics configuration interface (business analytics only)
 */
export interface AnalyticsConfig {
  // Global settings
  enabled: boolean;
  debug: boolean;
  environment: "development" | "production";

  // PostHog settings
  posthog: {
    enabled: boolean;
    apiKey?: string;
    host?: string;
    ingestionUrl?: string;
    autocapture: boolean;
    capturePageview: boolean;
    capturePageleave: boolean;
    sessionRecording: {
      enabled: boolean;
      maskAllInputs: boolean;
      maskTextSelector?: string;
    };
  };

  // Google Analytics settings
  ga: {
    enabled: boolean;
    measurementId?: string;
  };
}

/**
 * Create analytics configuration from environment variables
 */
export function createAnalyticsConfig(): AnalyticsConfig {
  const isProduction = env.NODE_ENV === "production";
  const debugMode = env.VITE_PUBLIC_ANALYTICS_DEBUG ?? false;

  // Global analytics enabled check
  // Only enable in production by default, or if debug mode is on
  const globalEnabled = !env.VITE_PUBLIC_ANALYTICS_DISABLED && (isProduction || debugMode === true);

  return {
    // Global settings
    enabled: globalEnabled,
    debug: debugMode,
    environment: env.NODE_ENV,

    // PostHog configuration
    posthog: {
      enabled: globalEnabled && !!env.VITE_PUBLIC_POSTHOG_KEY,
      apiKey: env.VITE_PUBLIC_POSTHOG_KEY,
      host: env.VITE_PUBLIC_POSTHOG_HOST,
      ingestionUrl: env.VITE_PUBLIC_POSTHOG_INGESTION_URL,
      autocapture: true,
      capturePageview: true,
      capturePageleave: true,
      sessionRecording: {
        enabled: true,
        maskAllInputs: true,
        maskTextSelector: "[data-private]",
      },
    },

    // Google Analytics configuration
    ga: {
      enabled:
        globalEnabled &&
        (env.VITE_PUBLIC_ENABLE_GA ?? false) &&
        !!env.VITE_PUBLIC_GA_MEASUREMENT_ID,
      measurementId: env.VITE_PUBLIC_GA_MEASUREMENT_ID,
    },
  };
}

/**
 * Default analytics configuration
 */
export const defaultAnalyticsConfig: AnalyticsConfig = {
  enabled: false,
  debug: false,
  environment: "development",
  posthog: {
    enabled: false,
    autocapture: true,
    capturePageview: true,
    capturePageleave: true,
    sessionRecording: {
      enabled: true,
      maskAllInputs: true,
    },
  },
  ga: {
    enabled: false,
  },
};
