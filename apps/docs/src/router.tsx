import { createRouterRewrite } from "@raypx/i18n/router";
import { createRouter as createTanstackRouter } from "@tanstack/react-router";
import { DefaultCatchBoundary } from "./components/default-catch-boundary";
import { NotFound } from "./components/not-found";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const router = createTanstackRouter({
    routeTree,
    defaultPreload: "intent",
    defaultPreloadStaleTime: 0,
    defaultErrorComponent: DefaultCatchBoundary,
    defaultNotFoundComponent: () => <NotFound />,
    scrollRestoration: true,
    /**
     * URL rewrite for i18n routing
     *
     * createRouterRewrite() provides optimized i18n URL handling:
     * - Strips locale prefix from URLs for route matching (/en/about → /about)
     * - Adds locale prefix back to generated URLs (/about → /en/about)
     * - Built-in LRU caching (100 URLs) for performance
     *
     * The server middleware (server.ts) handles initial locale detection and redirection.
     * This rewrite handles client-side navigation and URL generation.
     */
    rewrite: createRouterRewrite(),
  });

  return router;
};
