import { createHashHistory, createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export function getRouter() {
  return createRouter({
    routeTree,
    // Packaged views have no server rewrites, so deep links live in the hash.
    ...(typeof window !== "undefined" && window.location.protocol === "views:"
      ? { history: createHashHistory() }
      : {}),
    defaultPreload: "intent",
    scrollRestoration: true,
  });
}
declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
