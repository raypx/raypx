import { createTRPCContext, trpcRouter } from "@raypx/trpc";
import { createFileRoute } from "@tanstack/react-router";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";

/**
 * tRPC API route handler
 * Handles all tRPC requests at /api/trpc/*
 */
async function handler({ request }: { request: Request }) {
  return fetchRequestHandler({
    req: request,
    router: trpcRouter,
    endpoint: "/api/trpc",
    /**
     * Create context for each tRPC request
     * Provides authentication, session, and database access
     */
    createContext: async () => {
      return createTRPCContext({
        headers: request.headers,
      });
    },
  });
}

export const Route = createFileRoute("/api/trpc/$")({
  server: {
    handlers: {
      GET: handler,
      POST: handler,
    },
  },
});
