import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { DesktopRouteError, DesktopRoutePending } from "./features/shell/route-state";

export function getRouter() {
  return createRouter({
    routeTree,
    defaultPreload: "intent",
    defaultPendingComponent: DesktopRoutePending,
    defaultErrorComponent: DesktopRouteError,
    defaultPendingMs: 150,
    defaultPendingMinMs: 150,
    scrollRestoration: true,
  });
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
