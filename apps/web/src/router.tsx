import { initSentryClient } from "@raypx/observability/sentry/client";
import type { AppRouter } from "@raypx/trpc";
import { TRPCProvider } from "@raypx/trpc/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRouter as createTanstackRouter } from "@tanstack/react-router";
import { setupRouterSsrQueryIntegration } from "@tanstack/react-router-ssr-query";
import { createTRPCClient, httpBatchStreamLink } from "@trpc/client";
import { createTRPCOptionsProxy } from "@trpc/tanstack-react-query";
import superjson from "superjson";
import { NotFound } from "~/components/not-found";
import { DefaultCatchBoundary } from "./components/default-catch-boundary";
import env from "./env";
import { routeTree } from "./routeTree.gen";

function getUrl() {
  const base = (() => {
    if (typeof window !== "undefined") return "";
    return `http://localhost:${env.PORT ?? 3000}`;
  })();
  return `${base}/api/trpc`;
}

const createQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      dehydrate: { serializeData: superjson.serialize },
      hydrate: { deserializeData: superjson.deserialize },
    },
  });

export const getRouter = () => {
  const queryClient = createQueryClient();

  const trpcClient = createTRPCClient<AppRouter>({
    links: [
      httpBatchStreamLink({
        transformer: superjson,
        url: getUrl(),
      }),
    ],
  });

  const serverHelpers = createTRPCOptionsProxy({
    client: trpcClient,
    queryClient,
  });

  const router = createTanstackRouter({
    context: { queryClient, trpc: serverHelpers },
    routeTree,
    defaultPreload: "intent",
    defaultPreloadStaleTime: 0,
    defaultErrorComponent: DefaultCatchBoundary,
    defaultNotFoundComponent: () => <NotFound />,
    scrollRestoration: true,
    Wrap: (props) => {
      return (
        <QueryClientProvider client={queryClient}>
          <TRPCProvider queryClient={queryClient} trpcClient={trpcClient}>
            {props.children}
          </TRPCProvider>
        </QueryClientProvider>
      );
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
