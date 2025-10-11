import { initTRPC } from "@trpc/server";
import superjson from "superjson";

/**
 * Initialize tRPC instance with configuration
 */
const t = initTRPC.create({
  transformer: superjson,
});

/**
 * Export tRPC router factory
 */
export const createTRPCRouter = t.router;

/**
 * Export public procedure (no authentication required)
 */
export const publicProcedure = t.procedure;

/**
 * Export middleware factory for future use
 */
export const middleware = t.middleware;
