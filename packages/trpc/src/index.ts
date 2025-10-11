/**
 * @raypx/trpc - tRPC server package
 *
 * This package contains the server-side tRPC configuration and routers.
 * For client-side usage, import from "@raypx/trpc/client"
 */

export { createTRPCRouter, middleware, publicProcedure } from "./init";
export { type TRPCRouter, trpcRouter } from "./router";

// Export individual routers for composition
export { todosRouter } from "./routers/todos";
