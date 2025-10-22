import { usersRouter } from "./routers/users";
import { createTRPCRouter } from "./trpc";

/**
 * Root tRPC router
 * Add your sub-routers here as the application grows
 */
export const trpcRouter = createTRPCRouter({
  users: usersRouter,
});

/**
 * Export the router type for client-side type inference
 * This type is used by the client to provide full type safety
 */
export type AppRouter = typeof trpcRouter;
