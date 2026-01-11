import posthog from "posthog-js";
import { env } from "./env";

let initialized = false;

export function initAnalytics() {
  if (initialized) return;
  if (env.NEXT_PUBLIC_ANALYTICS_DISABLED) return;
  if (!env.NEXT_PUBLIC_POSTHOG_KEY) return;

  posthog.init(env.NEXT_PUBLIC_POSTHOG_KEY, {
    api_host: env.NEXT_PUBLIC_POSTHOG_HOST || "https://app.posthog.com",
    ui_host: "https://app.posthog.com",
    capture_pageview: true,
    capture_pageleave: true,
    autocapture: true,
    persistence: "localStorage",
    loaded: (ph) => {
      if (env.NEXT_PUBLIC_ANALYTICS_DEBUG) {
        ph.debug();
      }
    },
  });

  initialized = true;
}

export function identify(userId: string, traits?: Record<string, unknown>) {
  if (!initialized) return;

  posthog.identify(userId, traits);
}

export function reset() {
  if (!initialized) return;

  posthog.reset();
}

export function track(event: string, properties?: Record<string, unknown>) {
  if (!initialized) return;

  posthog.capture(event, properties);
}

export function trackPageView(path?: string) {
  if (!initialized) return;

  posthog.capture("$pageview", {
    $current_url: path || window.location.href,
  });
}

export function setPersonProperties(properties: Record<string, unknown>) {
  if (!initialized) return;

  posthog.setPersonProperties(properties);
}

export function getFeatureFlag(flag: string): boolean | string | undefined {
  if (!initialized) return undefined;

  return posthog.getFeatureFlag(flag);
}

export function isFeatureEnabled(flag: string): boolean {
  if (!initialized) return false;

  return posthog.isFeatureEnabled(flag) ?? false;
}

export { posthog };
