import { envs } from "./envs";
import type { PostHogInstance } from "./types";

export function useAnalytics() {
  const env = envs();
  let posthog: PostHogInstance | null = null;

  // Try to get PostHog instance if available
  if (typeof window !== "undefined" && env.VITE_PUBLIC_POSTHOG_KEY) {
    try {
      // If PostHog is loaded globally, use it
      if (window.posthog) {
        posthog = window.posthog;
      }
    } catch (_error) {
      // Silent fail
    }
  }

  const track = (event: string, properties?: Record<string, unknown>) => {
    if (
      env.VITE_PUBLIC_ANALYTICS_DISABLED ||
      (import.meta.env.NODE_ENV !== "production" && !env.VITE_PUBLIC_ANALYTICS_DEBUG)
    ) {
      return;
    }

    if (env.VITE_PUBLIC_ANALYTICS_DEBUG) {
      console.debug("[Analytics] Track:", event, properties);
    }

    // PostHog
    if (posthog?.capture) {
      posthog.capture(event, properties);
    }

    // Google Analytics
    if (
      typeof window !== "undefined" &&
      typeof window.gtag === "function" &&
      env.VITE_PUBLIC_GA_MEASUREMENT_ID
    ) {
      window.gtag("event", event, {
        ...properties,
        send_to: env.VITE_PUBLIC_GA_MEASUREMENT_ID,
      });
    }
  };

  const identify = (userId: string, properties?: Record<string, unknown>) => {
    if (import.meta.env.NODE_ENV !== "production") {
      return;
    }

    // PostHog
    if (posthog?.identify) {
      posthog.identify(userId, properties);
    }

    // Google Analytics
    if (typeof window !== "undefined" && typeof window.gtag === "function") {
      window.gtag("config", env.VITE_PUBLIC_GA_MEASUREMENT_ID, {
        user_id: userId,
        ...properties,
      });
    }
  };

  const reset = () => {
    if (import.meta.env.NODE_ENV !== "production") {
      return;
    }

    // PostHog
    if (posthog?.reset) {
      posthog.reset();
    }
  };

  const setPersonProperties = (properties: Record<string, unknown>) => {
    if (import.meta.env.NODE_ENV !== "production") {
      return;
    }

    // PostHog
    if (posthog?.setPersonProperties) {
      posthog.setPersonProperties(properties);
    }

    // Google Analytics - set custom parameters
    if (typeof window !== "undefined" && typeof window.gtag === "function") {
      window.gtag("config", env.VITE_PUBLIC_GA_MEASUREMENT_ID, {
        custom_map: properties,
      });
    }
  };

  const group = (groupType: string, groupKey: string, properties?: Record<string, unknown>) => {
    if (import.meta.env.NODE_ENV !== "production") {
      return;
    }

    // PostHog
    if (posthog?.group) {
      posthog.group(groupType, groupKey, properties);
    }
  };

  const pageView = (url?: string, title?: string) => {
    if (import.meta.env.NODE_ENV !== "production") {
      return;
    }

    // PostHog
    if (posthog?.capture) {
      posthog.capture("$pageview", {
        $current_url: url || window.location.href,
        title,
      });
    }

    // Google Analytics
    if (typeof window !== "undefined" && typeof window.gtag === "function") {
      window.gtag("config", env.VITE_PUBLIC_GA_MEASUREMENT_ID, {
        page_path: url || window.location.pathname,
        page_title: title,
      });
    }
  };

  // AI-specific tracking helpers
  const trackAIInteraction = (
    action: string,
    metadata?: {
      model?: string;
      tokens?: number;
      latency?: number;
      success?: boolean;
      error?: string;
    },
  ) => {
    track("ai_interaction", {
      action,
      ...metadata,
    });
  };

  const trackFeatureUsage = (feature: string, properties?: Record<string, unknown>) => {
    track("feature_usage", {
      feature,
      ...properties,
    });
  };

  const trackUserAction = (
    action: string,
    context?: string,
    properties?: Record<string, unknown>,
  ) => {
    track("user_action", {
      action,
      context,
      ...properties,
    });
  };

  return {
    // Core analytics functions
    track,
    identify,
    reset,
    setPersonProperties,
    group,
    pageView,

    // AI-specific helpers
    trackAIInteraction,
    trackFeatureUsage,
    trackUserAction,

    // Raw instances for advanced usage
    posthog:
      import.meta.env.NODE_ENV === "production" || env.VITE_PUBLIC_ANALYTICS_DEBUG ? posthog : null,
    gtag:
      (import.meta.env.NODE_ENV === "production" || env.VITE_PUBLIC_ANALYTICS_DEBUG) &&
      typeof window !== "undefined"
        ? window.gtag
        : null,

    // Utility functions
    isEnabled:
      !env.VITE_PUBLIC_ANALYTICS_DISABLED &&
      (import.meta.env.NODE_ENV === "production" || env.VITE_PUBLIC_ANALYTICS_DEBUG),
    isDebug: env.VITE_PUBLIC_ANALYTICS_DEBUG,
  };
}
