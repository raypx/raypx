import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export { routeTree };

const router = createRouter({
  routeTree,
  defaultPreload: "intent",
  scrollRestoration: true,
});

export function getRouter() {
  return router;
}
