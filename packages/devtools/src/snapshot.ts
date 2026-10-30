import type { Query, QueryClient } from "@tanstack/react-query";
import type { AnyRouter } from "@tanstack/react-router";

export interface PagePreferences {
  locale: string;
  localePreference: string;
  theme: string;
  resolvedTheme: string;
}
export interface PageDiagnosticsSnapshot {
  schemaVersion: 1;
  capturedAt: string;
  surface: "web" | "desktop";
  route: {
    status: string;
    loading: boolean;
    matches: { template: string; status: string; parameterNames: string[] }[];
    searchNames: string[];
  };
  preferences: PagePreferences;
  queries: {
    id: string;
    label: string;
    status: string;
    fetchStatus: string;
    stale: boolean;
    observers: number;
    updatedAt: string | null;
  }[];
}
export interface DiagnosticsSource {
  surface: PageDiagnosticsSnapshot["surface"];
  router: AnyRouter;
  queryClient: QueryClient;
  preferences(): PagePreferences;
}

const labels = new Set([
  "account",
  "configuration",
  "local-onboarding",
  "desktop-project-navigation",
  "terminal-request-notice",
  "tasks",
]);
const taskLabels = new Set(["workspace", "task", "approvals", "pending", "observed", "devices"]);
const identities = new WeakMap<QueryClient, { ids: WeakMap<Query, string>; sequence: number }>();
function queryLabel(key: readonly unknown[], fallback: string): string {
  const first = key[0];
  if (typeof first !== "string" || !labels.has(first)) return fallback;
  if (first === "tasks" && typeof key[2] === "string" && taskLabels.has(key[2]))
    return `${first}/${key[2]}`;
  return first;
}
const names = (value: object) =>
  Object.keys(value)
    .filter((key) => /^[\w-]{1,64}$/.test(key))
    .sort();

/** Read only metadata. In particular queryHash itself contains the complete key. */
export function createSnapshotReader(source: DiagnosticsSource): () => PageDiagnosticsSnapshot {
  let identity = identities.get(source.queryClient);
  if (!identity) {
    identity = { ids: new WeakMap(), sequence: 0 };
    identities.set(source.queryClient, identity);
  }
  const aliases = identity;
  return () => {
    const state = source.router.state;
    return {
      schemaVersion: 1,
      capturedAt: new Date().toISOString(),
      surface: source.surface,
      route: {
        status: state.status,
        loading: state.isLoading,
        matches: state.matches.map((match) => ({
          template: match.routeId,
          status: match.status,
          parameterNames: names(match.params),
        })),
        searchNames: names(state.location.search),
      },
      preferences: { ...source.preferences() },
      queries: source.queryClient
        .getQueryCache()
        .getAll()
        .map((query) => {
          let id = aliases.ids.get(query);
          if (!id) aliases.ids.set(query, (id = `query-${++aliases.sequence}`));
          return {
            id,
            label: queryLabel(query.queryKey, id),
            status: query.state.status,
            fetchStatus: query.state.fetchStatus,
            stale: query.state.isInvalidated || query.isStale(),
            observers: query.getObserversCount(),
            updatedAt: query.state.dataUpdatedAt
              ? new Date(query.state.dataUpdatedAt).toISOString()
              : null,
          };
        }),
    };
  };
}
