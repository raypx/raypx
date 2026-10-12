import { QueryClient, defaultShouldDehydrateQuery } from "@tanstack/react-query";
import type { createAccountResources } from "./account-resources";

/** A router owns one cache. Start calls the router factory once per SSR request. */
export function createWebQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        retry: (count, error) =>
          count < 1 &&
          !(
            error &&
            typeof error === "object" &&
            "code" in error &&
            ["UNAUTHORIZED", "FORBIDDEN", "CLOUD_ACCESS_DENIED", "CLOUD_NOT_FOUND"].includes(
              String(error.code),
            )
          ),
      },
      dehydrate: {
        shouldDehydrateQuery: (query) =>
          query.meta?.privateContent !== true && defaultShouldDehydrateQuery(query),
      },
    },
  });
}

export interface WebRouterContext {
  queryClient: QueryClient;
  resources: ReturnType<typeof createAccountResources>;
}
