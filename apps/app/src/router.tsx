import { orpc } from "@raypx/api/orpc";
import { initSentryClient } from "@raypx/observability/sentry/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { createRouter as createTanstackRouter } from "@tanstack/react-router";
import { setupRouterSsrQueryIntegration } from "@tanstack/react-router-ssr-query";
import { NotFound } from "~/components/not-found";
import { DefaultCatchBoundary } from "./components/default-catch-boundary";
import { routeTree } from "./routeTree.gen";
import { queryClient } from "./utils/orpc";

export const getRouter = () => {
  const router = createTanstackRouter({
    context: { queryClient, orpc },
    routeTree,
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
    defaultErrorComponent: DefaultCatchBoundary,
    defaultNotFoundComponent: () => <NotFound />,
    Wrap: (props) => {
      return <QueryClientProvider client={queryClient}>{props.children}</QueryClientProvider>;
    },
  });

  // Initialize Sentry (client-side only)
  if (!router.isServer) {
    initSentryClient({
      router,
    });
  }

  setupRouterSsrQueryIntegration({
    router,
    queryClient,
  });

  return router;
};
