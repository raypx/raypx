import { PostHogProvider as PostHogReactProvider } from "@posthog/react";
import { isServer } from "@raypx/shared";
import type { FC, ReactNode } from "react";
import { useEffect, useState } from "react";
import { useAnalyticsConfig } from "../context";
import { logger } from "../utils";
import { initPostHog } from "./init";

export const PostHogProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const [client, setClient] = useState<ReturnType<typeof initPostHog>>(null);
  const config = useAnalyticsConfig();

  useEffect(() => {
    // Only initialize on client side
    if (isServer) {
      return;
    }

    // Check if PostHog is enabled
    if (!config.posthog.enabled) {
      if (config.debug) {
        logger.info("PostHog disabled by configuration");
      }
      return;
    }

    // Initialize PostHog
    const posthogInstance = initPostHog();
    if (config.debug && posthogInstance) {
      logger.info("PostHog instance initialized");
    }
    setClient(posthogInstance);

    // Cleanup on unmount
    return () => {
      if (posthogInstance) {
        // PostHog doesn't have a destroy method, but we can reset
        posthogInstance.reset();
      }
    };
  }, [config]);

  // If no client, just render children without provider
  if (!client) {
    return <>{children}</>;
  }

  return <PostHogReactProvider client={client}>{children}</PostHogReactProvider>;
};
