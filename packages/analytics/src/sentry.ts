import * as Sentry from "@sentry/tanstackstart-react";
import type { ArrayElement } from "type-fest";

export type SentryConfig = Parameters<typeof Sentry.init>[0];

// Extract Integration type from Sentry config
// Use getDefaultIntegrations return type as the source of truth
type DefaultIntegrations = ReturnType<typeof Sentry.getDefaultIntegrations>;
export type Integration = ArrayElement<DefaultIntegrations>;

// Re-export client and server initialization functions
export {
  initSentryClient as initSentry,
  tanstackRouterBrowserTracingIntegration,
} from "./sentry/client";
export { createSentry, initSentryServer } from "./sentry/server";

// Re-export Sentry instance and common functions for advanced usage
export { Sentry };
export const captureException = Sentry.captureException;
export const captureMessage = Sentry.captureMessage;
