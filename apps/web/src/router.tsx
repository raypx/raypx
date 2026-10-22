import { analytics } from "./features/analytics/client";
import { createRouter } from "@tanstack/react-router";
import { QueryClient } from "@tanstack/react-query";
import { setupRouterSsrQueryIntegration } from "@tanstack/react-router-ssr-query";
import { routeTree } from "./routeTree.gen";

export function getRouter() {
  // One QueryClient per router: per request on the server, once in the browser.
  // Remote calls are POST and never retried (see @raypx/client).
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 30_000 }, mutations: { retry: false } },
  });
  const router = createRouter({
    routeTree,
    defaultOnCatch: (error) => analytics.captureException(error),
    context: { queryClient },
    defaultPreload: "intent",
    scrollRestoration: true,
  });
  setupRouterSsrQueryIntegration({ router, queryClient });
  return router;
}
declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
