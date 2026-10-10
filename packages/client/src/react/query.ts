import {
  QueryClient,
  queryOptions,
  type QueryClientConfig,
  type QueryKey,
} from "@tanstack/react-query";
import { checkHealth } from "../health.js";
import { getSession } from "../session.js";

/** Public session projections are updated together after authentication changes. */
export const sessionQueryPrefix = ["session"] as const;
/** Every account-private query must begin with this prefix and its account identity. */
export const accountQueryPrefix = ["account"] as const;

/**
 * Creates an independent cache. Create one per SSR request/router, never at module
 * scope, and retain that router's client through browser navigation. Applications
 * may override freshness and retry defaults for their own queries.
 */
export function createQueryClient(config: QueryClientConfig = {}): QueryClient {
  return new QueryClient({
    ...config,
    defaultOptions: {
      ...config.defaultOptions,
      queries: { staleTime: 30_000, retry: false, ...config.defaultOptions?.queries },
      mutations: { retry: false, ...config.defaultOptions?.mutations },
    },
  });
}

/** Private reads use ['account', accountId, ...resource]; keys must never contain credentials. */
export function accountQueryKey(accountId: string, ...resource: QueryKey) {
  return [...accountQueryPrefix, accountId, ...resource] as const;
}

/**
 * Co-locates identity and transport for a public session read. The default HTTP
 * function uses a browser-relative URL; SSR loaders must supply their own
 * request-aware queryFn when prefetching into their request's QueryClient.
 * A confirmed read updates existing public session scopes together. An aborted
 * read must never publish, even when a transport ignores its AbortSignal.
 */
export function sessionQueryOptions(scope: string | number = "current") {
  return queryOptions({
    queryKey: [...sessionQueryPrefix, scope] as const,
    queryFn: async ({ signal, client }) => {
      const session = await getSession({ signal });
      signal.throwIfAborted();
      client.setQueriesData<Awaited<ReturnType<typeof getSession>>>(
        { queryKey: sessionQueryPrefix },
        session,
      );
      return session;
    },
    staleTime: 30_000,
    retry: false,
  });
}

/** Shared health reads consume Query's signal so an unused pending request aborts. */
export function healthQueryOptions() {
  return queryOptions({
    queryKey: ["health"] as const,
    queryFn: ({ signal }) => checkHealth({ signal }),
    staleTime: 30_000,
    retry: false,
  });
}
