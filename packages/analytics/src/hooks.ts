import { usePostHog } from "@posthog/react";
import { isClient } from "@raypx/shared";
import { useAnalyticsConfig } from "./context";
import { logger } from "./utils";

export function useAnalytics() {
  const config = useAnalyticsConfig();
  const posthog = usePostHog();

  const track = (event: string, properties?: Record<string, unknown>) => {
    // Check if analytics is globally disabled
    if (!config.enabled) {
      if (config.debug) {
        logger.debug("[Analytics] Tracking disabled globally");
      }
      return;
    }

    if (config.debug) {
      logger.debug("[Analytics] Track:", event, properties);
    }

    // PostHog tracking
    if (config.posthog.enabled) {
      try {
        if (posthog?.capture) {
          posthog.capture(event, properties);
        } else if (config.debug) {
          logger.debug("[Analytics] PostHog not initialized, event not sent:", event);
        }
      } catch (error) {
        logger.warn("[Analytics] PostHog track error:", error);
      }
    }

    // Google Analytics tracking
    if (config.ga.enabled) {
      try {
        if (isClient && typeof window.gtag === "function") {
          window.gtag("event", event, {
            ...properties,
            send_to: config.ga.measurementId,
          });
        }
      } catch (error) {
        logger.warn("[Analytics] GA track error:", error);
      }
    }
  };

  const identify = (userId: string, properties?: Record<string, unknown>) => {
    if (!config.enabled) {
      return;
    }

    if (config.debug) {
      logger.debug("[Analytics] Identify:", userId, properties);
    }

    // PostHog identify
    if (config.posthog.enabled) {
      try {
        if (posthog?.identify) {
          posthog.identify(userId, properties);
        }
      } catch (error) {
        logger.warn("[Analytics] PostHog identify error:", error);
      }
    }

    // Google Analytics identify
    if (config.ga.enabled) {
      try {
        if (isClient && typeof window.gtag === "function") {
          window.gtag("config", config.ga.measurementId, {
            user_id: userId,
            ...properties,
          });
        }
      } catch (error) {
        logger.warn("[Analytics] GA identify error:", error);
      }
    }
  };

  const reset = () => {
    if (!config.enabled) {
      return;
    }

    if (config.debug) {
      logger.debug("[Analytics] Reset");
    }

    // PostHog reset
    if (config.posthog.enabled) {
      try {
        if (posthog?.reset) {
          posthog.reset();
        }
      } catch (error) {
        logger.warn("[Analytics] PostHog reset error:", error);
      }
    }
  };

  const setPersonProperties = (properties: Record<string, unknown>) => {
    if (!config.enabled) {
      return;
    }

    if (config.debug) {
      logger.debug("[Analytics] Set person properties:", properties);
    }

    // PostHog set properties
    if (config.posthog.enabled) {
      try {
        if (posthog?.setPersonProperties) {
          posthog.setPersonProperties(properties);
        }
      } catch (error) {
        logger.warn("[Analytics] PostHog setPersonProperties error:", error);
      }
    }

    // Google Analytics set properties
    if (config.ga.enabled) {
      try {
        if (isClient && typeof window.gtag === "function") {
          window.gtag("config", config.ga.measurementId, {
            custom_map: properties,
          });
        }
      } catch (error) {
        logger.warn("[Analytics] GA setPersonProperties error:", error);
      }
    }
  };

  const group = (groupType: string, groupKey: string, properties?: Record<string, unknown>) => {
    if (!config.enabled) {
      return;
    }

    if (config.debug) {
      logger.debug("[Analytics] Group:", groupType, groupKey, properties);
    }

    // PostHog group (only PostHog supports this)
    if (config.posthog.enabled) {
      try {
        if (posthog?.group) {
          posthog.group(groupType, groupKey, properties);
        }
      } catch (error) {
        logger.warn("[Analytics] PostHog group error:", error);
      }
    }
  };

  const pageView = (url?: string, title?: string) => {
    if (!config.enabled) {
      return;
    }

    if (config.debug) {
      logger.debug("[Analytics] Page view:", url, title);
    }

    // PostHog page view
    if (config.posthog.enabled) {
      try {
        if (posthog?.capture) {
          posthog.capture("$pageview", {
            $current_url: url || window.location.href,
            title,
          });
        }
      } catch (error) {
        logger.warn("[Analytics] PostHog pageView error:", error);
      }
    }

    // Google Analytics page view
    if (config.ga.enabled) {
      try {
        if (isClient && typeof window.gtag === "function") {
          window.gtag("config", config.ga.measurementId, {
            page_path: url || window.location.pathname,
            page_title: title,
          });
        }
      } catch (error) {
        logger.warn("[Analytics] GA pageView error:", error);
      }
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
    posthog: config.posthog.enabled ? posthog : null,
    gtag: config.ga.enabled && isClient ? window.gtag : null,

    // Utility functions
    isEnabled: config.enabled,
    isDebug: config.debug,
    config,
  };
}
