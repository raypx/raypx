import { createRouter } from "@tanstack/react-router";
import NotFound from "./components/not-found";
import { routeTree } from "./routeTree.gen";

export { routeTree };

const router = createRouter({
  routeTree,
  defaultPreload: "intent",
  scrollRestoration: true,
  trailingSlash: "preserve",
  defaultNotFoundComponent: () => <NotFound />,
});

export function getRouter() {
  return router;
}
