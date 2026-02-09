import * as Sentry from "@sentry/react";
import type { Integration } from "../sentry";
import { logger } from "../utils";
import { getSentryConfig } from "./shared";

/**
 * Initialize Sentry for client-side (browser)
 * @param options - Client-side Sentry initialization options
 */
export function initSentryClient({
  appendIntegrations = [],
  router,
}: {
  appendIntegrations?: Integration[];
  router?: any;
} = {}) {
  const config = getSentryConfig();

  if (!config.dsn) {
    logger.warn("Sentry DSN not configured, skipping client initialization");
    return Sentry;
  }

  // Only initialize if not already initialized
  if (Sentry.getClient()) {
    return Sentry;
  }

  // Build integrations array
  const integrations: Integration[] = [...appendIntegrations];

  // Add router tracing integration if router is provided
  if (router && !router.isServer && Sentry.tanstackRouterBrowserTracingIntegration) {
    integrations.push(Sentry.tanstackRouterBrowserTracingIntegration(router));
  }

  // Client-side configuration
  const sentryConfig = {
    ...config,
    integrations,
    // Client-side only: Session Replay
    replaysSessionSampleRate: config.nodeEnv === "production" ? 0.1 : 1.0,
    replaysOnErrorSampleRate: 1.0,
  };

  try {
    Sentry.init(sentryConfig);
  } catch (error) {
    logger.warn("Sentry failed to initialize client:", error);
  }

  return Sentry;
}

/**
 * Export router tracing integration for external use
 */
export const tanstackRouterBrowserTracingIntegration =
  Sentry.tanstackRouterBrowserTracingIntegration;
