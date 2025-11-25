import { envs } from "../envs";

/**
 * Get Sentry DSN from environment
 */
function getSentryDsn() {
  const env = envs();
  return env.VITE_SENTRY_DSN;
}

/**
 * Get Sentry enable dev flag from environment
 */
function getSentryEnableDev() {
  const env = envs();
  return env.VITE_SENTRY_ENABLE_DEV || false;
}

/**
 * Get shared Sentry configuration
 */
export function getSentryConfig() {
  const env = envs();
  const dsn = getSentryDsn();
  const nodeEnv = env.NODE_ENV || process.env.NODE_ENV || "development";

  return {
    dsn,
    nodeEnv,
    environment: nodeEnv,
    sendDefaultPii: true,
    tracesSampleRate: nodeEnv === "production" ? 0.1 : 1.0,
    beforeSend(event: any) {
      // Don't send errors in development unless explicitly enabled
      if (nodeEnv === "development" && !getSentryEnableDev()) {
        return null;
      }
      return event;
    },
  };
}
