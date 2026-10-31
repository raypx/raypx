import { createBrowserAnalytics } from "@raypx-kit/analytics/browser";
import type { AnalyticsClient, AnalyticsProperties } from "@raypx-kit/analytics";
import type { TaskClient } from "@raypx/client";
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
const sessions = new WeakMap<
  AnalyticsClient,
  { version: number; usage: boolean; id: string | null }
>();
export function createRaypxAnalytics(options: RaypxAnalyticsOptions): AnalyticsClient {
  const base = createBrowserAnalytics({
    ...options,
    properties: { surface: options.surface },
    assetOrigins:
      typeof window === "undefined" ? [] : [`${window.location.protocol}//${window.location.host}`],
    policy: (event, properties) => {
      const safe = eventPolicy(event, properties);
      return safe ? { ...safe, surface: options.surface } : null;
    },
  });
  const state = { version: 0, usage: false, id: null as string | null };
  const client: AnalyticsClient = {
    ...base,
    identify(id) {
      if (state.id !== id) {
        state.id = id;
        state.version++;
      }
      base.identify(id);
    },
    reset() {
      state.id = null;
      state.version++;
      base.reset();
    },
    setConsent(consent) {
      if (state.usage !== consent.usage) {
        state.version++;
        state.usage = consent.usage;
      }
      base.setConsent(consent);
    },
    dispose() {
      state.version++;
      state.usage = false;
      base.dispose();
    },
  };
  sessions.set(client, state);
  return client;
}
function reporter(client: AnalyticsClient) {
  const state = sessions.get(client),
    version = state?.version,
    enabled = state?.usage ?? true;
  return (event: string, properties: AnalyticsProperties) => {
    if (!enabled || (state && (state.version !== version || !state.usage))) return;
    try {
      client.capture(event, properties);
    } catch {
      /* Analytics cannot change the mutation result. */
    }
  };
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
type MutationClient = {
  tasks: Pick<TaskClient["tasks"], "create">;
  approvals: Pick<TaskClient["approvals"], "decide">;
};
/** Observe actual mutation attempts. Reads and relay invalidations never emit product results. */
export function instrumentTaskClient<T extends MutationClient>(
  client: T,
  analytics: AnalyticsClient,
  scope: "local" | "remote",
) {
  return {
    ...client,
    tasks: {
      ...client.tasks,
      create: async (...args: Parameters<MutationClient["tasks"]["create"]>) => {
        const report = reporter(analytics);
        try {
          const result = await client.tasks.create(...args);
          report("task_create_result", {
            scope,
            provider: args[0].provider,
            outcome: "accepted",
          });
          return result;
        } catch (error) {
          report("task_create_result", {
            scope,
            provider: args[0].provider,
            outcome: "failed",
            code: analyticsCode(error),
          });
          throw error;
        }
      },
    },
    approvals: {
      ...client.approvals,
      decide: async (...args: Parameters<MutationClient["approvals"]["decide"]>) => {
        const report = reporter(analytics);
        try {
          const result = await client.approvals.decide(...args);
          report("approval_submit_result", { scope, outcome: "accepted" });
          return result;
        } catch (error) {
          report("approval_submit_result", {
            scope,
            outcome: "failed",
            code: analyticsCode(error),
          });
          throw error;
        }
      },
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
