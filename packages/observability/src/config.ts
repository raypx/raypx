import { envs } from "./envs";

/**
 * Observability configuration interface (system monitoring only)
 */
export interface ObservabilityConfig {
  // Global settings
  enabled: boolean;
  debug: boolean;
  environment: "development" | "production";

  // Sentry settings
  sentry: {
    enabled: boolean;
    dsn?: string;
    enableInDev: boolean;
  };
}

/**
 * Create observability configuration from environment variables
 */
export function createObservabilityConfig(): ObservabilityConfig {
  const env = envs();
  const isProduction = env.NODE_ENV === "production";
  const debugMode = false; // Observability doesn't use analytics debug flag

  return {
    // Global settings
    enabled: true, // Observability is always enabled if configured
    debug: debugMode,
    environment: env.NODE_ENV,

    // Sentry configuration
    sentry: {
      enabled: !!env.VITE_SENTRY_DSN && (isProduction || env.VITE_SENTRY_ENABLE_DEV),
      dsn: env.VITE_SENTRY_DSN,
      enableInDev: env.VITE_SENTRY_ENABLE_DEV,
    },
  };
}

/**
 * Default observability configuration
 */
export const defaultObservabilityConfig: ObservabilityConfig = {
  enabled: false,
  debug: false,
  environment: "development",
  sentry: {
    enabled: false,
    enableInDev: false,
  },
};
