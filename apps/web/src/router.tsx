import { analytics } from "./features/analytics/client";
import { createQueryFailureReporter } from "@raypx/analytics/browser";
import { createRouter } from "@tanstack/react-router";
import { QueryCache, QueryClient } from "@tanstack/react-query";
import { setupRouterSsrQueryIntegration } from "@tanstack/react-router-ssr-query";
import type { ShellPage } from "@raypx/blocks/shell";
import { routeTree } from "./routeTree.gen";

export function getRouter() {
  // One QueryClient per router: per request on the server, once in the browser.
  // Remote calls are POST and never retried (see @raypx/client).
  const reportQueryFailure = createQueryFailureReporter(analytics);
  const queryClient = new QueryClient({
    queryCache: new QueryCache({
      onError: (error, query) => reportQueryFailure(error, query.queryKey),
    }),
    defaultOptions: { queries: { retry: false, staleTime: 30_000 }, mutations: { retry: false } },
  });
  const router = createRouter({
    routeTree,
    defaultOnCatch: (error) => analytics.captureException(error),
    context: { queryClient },
    defaultPreload: "intent",
    scrollRestoration: true,
    scrollToTopSelectors: ["#main"],
  });
  setupRouterSsrQueryIntegration({ router, queryClient });
  return router;
}
/** Message keys that title shell pages; each translates without values. */
type PageTitle =
  | "common.account"
  | "common.adminSettings"
  | "common.approvals"
  | "common.home"
  | "common.jobs"
  | "common.settings"
  | "common.tasks"
  | "memory.title";

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
  interface StaticDataRouteOption {
    /** Shell title and page template; the deepest matched route that declares one wins. */
    page?: ShellPage<PageTitle>;
  }
}
