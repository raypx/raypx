import { usePostHog } from "@posthog/react";
import { logger } from "@raypx/shared/logger";
import { envs } from "./envs";

export function useAnalytics() {
  const env = envs();
  const posthog = usePostHog();
  const isProd = import.meta.env.PROD;
  console.log("isProd", isProd);
  const isDisabled =
    env.VITE_PUBLIC_ANALYTICS_DISABLED || (!isProd && !env.VITE_PUBLIC_ANALYTICS_DEBUG);
  console.log("isDisabled", isDisabled);

  const track = (event: string, properties?: Record<string, unknown>) => {
    logger.info("track1", event, properties);
    logger.info(`VITE_PUBLIC_ANALYTICS_DISABLED: ${env.VITE_PUBLIC_ANALYTICS_DISABLED}`);
    logger.info(`NODE_ENV: ${import.meta.env.PROD}`);
    logger.info(`VITE_PUBLIC_ANALYTICS_DEBUG: ${env.VITE_PUBLIC_ANALYTICS_DEBUG}`);
    if (isDisabled) {
      return;
    }
    logger.info("track2", event, properties);

    if (env.VITE_PUBLIC_ANALYTICS_DEBUG) {
      console.debug("[Analytics] Track:", event, properties);
    }
    logger.info("track3", event, properties);

    // PostHog (safe call - won't error if not initialized)
    try {
      logger.info("track4", event, properties);
      console.log("posthog capture", posthog?.capture);
      if (posthog?.capture) {
        posthog.capture(event, properties);
      } else if (env.VITE_PUBLIC_ANALYTICS_DEBUG) {
        console.debug("[Analytics] PostHog not initialized, event not sent:", event);
      }
    } catch (error) {
      console.warn("[Analytics] PostHog track error:", error);
    }

    // Google Analytics (仅在启用时发送)
    if (
      env.VITE_PUBLIC_ENABLE_GA &&
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
    if (isDisabled) {
      return;
    }

    if (env.VITE_PUBLIC_ANALYTICS_DEBUG) {
      console.debug("[Analytics] Identify:", userId, properties);
    }

    // PostHog (safe call)
    try {
      if (posthog?.identify) {
        posthog.identify(userId, properties);
      }
    } catch (error) {
      console.warn("[Analytics] PostHog identify error:", error);
    }

    // Google Analytics (仅在启用时发送)
    if (
      env.VITE_PUBLIC_ENABLE_GA &&
      typeof window !== "undefined" &&
      typeof window.gtag === "function"
    ) {
      window.gtag("config", env.VITE_PUBLIC_GA_MEASUREMENT_ID, {
        user_id: userId,
        ...properties,
      });
    }
  };

  const reset = () => {
    if (isDisabled) {
      return;
    }

    if (env.VITE_PUBLIC_ANALYTICS_DEBUG) {
      console.debug("[Analytics] Reset");
    }

    // PostHog (safe call)
    try {
      if (posthog?.reset) {
        posthog.reset();
      }
    } catch (error) {
      console.warn("[Analytics] PostHog reset error:", error);
    }
  };

  const setPersonProperties = (properties: Record<string, unknown>) => {
    if (isDisabled) {
      return;
    }

    if (env.VITE_PUBLIC_ANALYTICS_DEBUG) {
      console.debug("[Analytics] Set person properties:", properties);
    }

    // PostHog (safe call)
    try {
      if (posthog?.setPersonProperties) {
        posthog.setPersonProperties(properties);
      }
    } catch (error) {
      console.warn("[Analytics] PostHog setPersonProperties error:", error);
    }

    // Google Analytics (仅在启用时发送)
    if (
      env.VITE_PUBLIC_ENABLE_GA &&
      typeof window !== "undefined" &&
      typeof window.gtag === "function"
    ) {
      window.gtag("config", env.VITE_PUBLIC_GA_MEASUREMENT_ID, {
        custom_map: properties,
      });
    }
  };

  const group = (groupType: string, groupKey: string, properties?: Record<string, unknown>) => {
    if (isDisabled) {
      return;
    }

    if (env.VITE_PUBLIC_ANALYTICS_DEBUG) {
      console.debug("[Analytics] Group:", groupType, groupKey, properties);
    }

    // PostHog (safe call)
    try {
      if (posthog?.group) {
        posthog.group(groupType, groupKey, properties);
      }
    } catch (error) {
      console.warn("[Analytics] PostHog group error:", error);
    }
  };

  const pageView = (url?: string, title?: string) => {
    if (isDisabled) {
      return;
    }

    if (env.VITE_PUBLIC_ANALYTICS_DEBUG) {
      console.debug("[Analytics] Page view:", url, title);
    }

    // PostHog (safe call)
    try {
      if (posthog?.capture) {
        posthog.capture("$pageview", {
          $current_url: url || window.location.href,
          title,
        });
      }
    } catch (error) {
      console.warn("[Analytics] PostHog pageView error:", error);
    }

    // Google Analytics (仅在启用时发送)
    if (
      env.VITE_PUBLIC_ENABLE_GA &&
      typeof window !== "undefined" &&
      typeof window.gtag === "function"
    ) {
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
    posthog: isProd || env.VITE_PUBLIC_ANALYTICS_DEBUG ? posthog : null,
    gtag:
      env.VITE_PUBLIC_ENABLE_GA && !isDisabled && typeof window !== "undefined"
        ? window.gtag
        : null,

    // Utility functions
    isEnabled: !env.VITE_PUBLIC_ANALYTICS_DISABLED && (isProd || env.VITE_PUBLIC_ANALYTICS_DEBUG),
    isDebug: env.VITE_PUBLIC_ANALYTICS_DEBUG,
  };
}
