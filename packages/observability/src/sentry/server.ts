import * as Sentry from "@sentry/tanstackstart-react";
import type { Integration } from "../sentry";
import { logger } from "../utils";
import { getSentryConfig } from "./shared";

/**
 * Initialize Sentry for server-side (Node.js)
 * @param options - Server-side Sentry initialization options
 */
export function initSentryServer({
  appendIntegrations = [],
}: {
  appendIntegrations?: Integration[];
} = {}) {
  const config = getSentryConfig();

  if (!config.dsn) {
    logger.warn("Sentry DSN not configured, skipping server initialization");
    return Sentry;
  }

  // Check Node.js environment
  if (typeof process === "undefined" || !process.versions?.node) {
    logger.warn("Sentry server-side initialization skipped: Not in Node.js environment");
    return Sentry;
  }

  // Only initialize if not already initialized
  if (Sentry.getClient()) {
    return Sentry;
  }

  // Build integrations array
  const integrations: Integration[] = [...appendIntegrations];

  // Server-side configuration
  const sentryConfig = {
    ...config,
    integrations,
  };

  try {
    Sentry.init(sentryConfig);
  } catch (error) {
    logger.warn("Sentry failed to initialize server:", error);
  }

  return Sentry;
}

/**
 * Create Sentry instance for server-side middleware
 * Returns an object with middleware handler for TanStack Start
 */
export function createSentry() {
  return initSentryServer();
}
