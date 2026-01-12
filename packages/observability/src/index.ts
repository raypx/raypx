// Sentry exports

// Analytics exports
export {
  getFeatureFlag,
  identify,
  initAnalytics,
  isFeatureEnabled,
  posthog,
  reset as resetAnalytics,
  setPersonProperties,
  track,
  trackPageView,
} from "./analytics";
export {
  captureError,
  captureMessage,
  clearUser as clearSentryUser,
  initSentry,
  Sentry,
  setUser as setSentryUser,
} from "./sentry";

// Combined initialization
export function initObservability() {
  // Dynamic imports to avoid issues with SSR
  if (typeof window !== "undefined") {
    import("./sentry").then(({ initSentry }) => initSentry());
    import("./analytics").then(({ initAnalytics }) => initAnalytics());
  }
}
