import { createRouter as createTanStackRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { setupRouterSsrQueryIntegration } from "@tanstack/react-router-ssr-query";
import { createWebQueryClient } from "./lib/query-client";
import { createAccountResources } from "./lib/account-resources";

export function getRouter() {
  const queryClient = createWebQueryClient();
  const router = createTanStackRouter({
    routeTree,
    context: { queryClient, resources: createAccountResources() },
    scrollRestoration: true,
    defaultPreload: "intent",
    defaultPreloadStaleTime: 0,
  });
  setupRouterSsrQueryIntegration({ router, queryClient });

  return router;
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
