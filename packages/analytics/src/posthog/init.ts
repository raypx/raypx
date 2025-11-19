import posthog from "posthog-js";
import { envs } from "../envs";

/**
 * Initialize PostHog client
 * @returns PostHog instance or null if not configured
 */
export function initPostHog() {
  // Skip if running on server
  if (typeof window === "undefined") {
    return null;
  }

  const env = envs();

  // Skip if no API key configured
  if (!env.VITE_PUBLIC_POSTHOG_KEY) {
    console.warn("[PostHog] API key not configured, skipping initialization");
    return null;
  }

  // Skip if already initialized
  if (posthog.__loaded) {
    return posthog;
  }

  try {
    posthog.init(env.VITE_PUBLIC_POSTHOG_KEY, {
      api_host: env.VITE_PUBLIC_POSTHOG_HOST || "https://app.posthog.com",
      ui_host: env.VITE_PUBLIC_POSTHOG_HOST || "https://app.posthog.com",

      // Enable in production or debug mode
      loaded: (posthog) => {
        console.log("posthog loaded", posthog);
        if (env.VITE_PUBLIC_ANALYTICS_DEBUG) {
          console.log("[PostHog] Initialized successfully");
        }
      },

      // Privacy settings
      autocapture: true, // Disable automatic event capture for better control
      capture_pageview: true, // We'll handle pageviews manually
      capture_pageleave: true,

      // Session recording (optional)
      disable_session_recording: false,
      session_recording: {
        maskAllInputs: true,
        maskTextSelector: "[data-private]",
      },

      // Performance
      disable_compression: true,

      // Custom ingestion URL if provided
      ...(env.VITE_PUBLIC_POSTHOG_INGESTION_URL && {
        api_host: env.VITE_PUBLIC_POSTHOG_INGESTION_URL,
      }),
    });

    return posthog;
  } catch (error) {
    console.error("[PostHog] Failed to initialize:", error);
    return null;
  }
}

/**
 * Get PostHog instance
 */
export function getPostHog() {
  if (typeof window === "undefined") {
    return null;
  }
  return posthog.__loaded ? posthog : null;
}
