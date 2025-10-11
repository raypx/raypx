import { createTRPCRouter } from "./init";
import { todosRouter } from "./routers/todos";

/**
 * Root tRPC router
 * Add your sub-routers here as the application grows
 */
export const trpcRouter = createTRPCRouter({
  todos: todosRouter,
});

/**
 * Export the router type for client-side type inference
 */
export type TRPCRouter = typeof trpcRouter;
