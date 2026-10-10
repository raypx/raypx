import { createRootRouteWithContext } from "@tanstack/react-router";
import type { QueryClient } from "@raypx/client/react";

// Keep getRouter's real SSR/query wiring while omitting build-generated page modules.
export const routeTree = createRootRouteWithContext<{ queryClient: QueryClient }>()({});
