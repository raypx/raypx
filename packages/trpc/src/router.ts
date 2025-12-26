import { apiKeysRouter } from "./routers/api-keys";
import { billingRouter } from "./routers/billing";
import { configsRouter } from "./routers/configs";
import { storageRouter } from "./routers/storage";
import { usersRouter } from "./routers/users";
import { createTRPCRouter } from "./trpc";

/**
 * Root tRPC router
 * Add your sub-routers here as the application grows
 */
export const trpcRouter = createTRPCRouter({
  users: usersRouter,
  apiKeys: apiKeysRouter,
  configs: configsRouter,
  billing: billingRouter,
  storage: storageRouter,
});

/**
 * Export the router type for client-side type inference
 * This type is used by the client to provide full type safety
 */
export type AppRouter = typeof trpcRouter;
