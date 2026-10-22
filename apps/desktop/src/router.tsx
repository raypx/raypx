import { analytics } from "./features/analytics/client";
import { createQueryFailureReporter } from "@raypx/analytics/browser";
import { createHashHistory, createRouter } from "@tanstack/react-router";
import { QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { routeTree } from "./routeTree.gen";

export function getRouter() {
  // Remote calls are POST and never retried (see @raypx/client).
  const reportQueryFailure = createQueryFailureReporter(analytics);
  const queryClient = new QueryClient({
    queryCache: new QueryCache({
      onError: (error, query) => reportQueryFailure(error, query.queryKey),
    }),
    defaultOptions: { queries: { retry: false, staleTime: 30_000 }, mutations: { retry: false } },
  });
  return createRouter({
    routeTree,
    defaultOnCatch: (error) => analytics.captureException(error),
    // Packaged views have no server rewrites, so deep links live in the hash.
    ...(typeof window !== "undefined" && window.location.protocol === "views:"
      ? { history: createHashHistory() }
      : {}),
    defaultPreload: "intent",
    scrollRestoration: true,
    Wrap: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
  });
}
declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
