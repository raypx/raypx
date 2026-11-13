import { createBrowserAnalytics } from "@raypx-kit/analytics/browser";
import type { AnalyticsClient } from "@raypx-kit/analytics";
import {
  ANALYTICS_PREFERENCE_KEY,
  parseAnalyticsConsent,
  eventPolicy,
  analyticsCode,
  analyticsRequestId,
  type AnalyticsPreferenceStore,
} from "./index.js";
export interface RaypxAnalyticsOptions {
  token: string;
  host: string;
  environment: string;
  release: string;
  surface: "web" | "desktop";
}
export function createRaypxAnalytics(options: RaypxAnalyticsOptions): AnalyticsClient {
  return createBrowserAnalytics({
    ...options,
    properties: { surface: options.surface },
    assetOrigins:
      typeof window === "undefined" ? [] : [`${window.location.protocol}//${window.location.host}`],
    policy: (event, properties) => {
      const safe = eventPolicy(event, properties);
      return safe ? { ...safe, surface: options.surface } : null;
    },
  });
}
export function browserPreferenceStore(): AnalyticsPreferenceStore {
  return {
    read() {
      try {
        return parseAnalyticsConsent(
          JSON.parse(localStorage.getItem(ANALYTICS_PREFERENCE_KEY) ?? "null"),
        );
      } catch {
        return parseAnalyticsConsent(null);
      }
    },
    async write(value) {
      try {
        localStorage.setItem(ANALYTICS_PREFERENCE_KEY, JSON.stringify(value));
        return true;
      } catch {
        return false;
      }
    },
    subscribe(refresh) {
      const listener = (event: StorageEvent) => {
        if (event.key === ANALYTICS_PREFERENCE_KEY || event.key === null) refresh();
      };
      window.addEventListener("storage", listener);
      return () => window.removeEventListener("storage", listener);
    },
  };
}
/**
 * QueryCache `onError` handler. Polling and relay invalidations retry failed reads, so
 * each query reports at most once per minute; usage consent still gates delivery.
 */
export function createQueryFailureReporter(analytics: AnalyticsClient, intervalMs = 60_000) {
  const last = new Map<string, number>();
  return (error: unknown, queryKey: readonly unknown[]) => {
    const query = typeof queryKey[0] === "string" ? queryKey[0] : "other";
    const code = analyticsCode(error);
    const key = `${query}:${code}`;
    const now = Date.now();
    if (now - (last.get(key) ?? -Infinity) < intervalMs) return;
    last.set(key, now);
    const requestId = analyticsRequestId(error);
    try {
      analytics.capture("query_failed", { query, code, ...(requestId ? { requestId } : {}) });
    } catch {
      /* Analytics cannot change the read result. */
    }
  };
}
