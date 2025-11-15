import type { QueryClient } from "@tanstack/react-query";
import type { TRPCClient } from "@trpc/client";
import type { TRPCOptionsProxy } from "@trpc/tanstack-react-query";
import { createTRPCContext } from "@trpc/tanstack-react-query";
import type { ComponentType, ReactNode } from "react";
import type { AppRouter } from "./router";

/**
 * Create tRPC context with React Query hooks
 * This provides TRPCProvider, useTRPC, and useTRPCClient hooks with full type safety
 */
const trpcContext = createTRPCContext<AppRouter>();

/**
 * tRPC Provider component
 * Wrap your app with this provider to enable tRPC hooks
 */
export const TRPCProvider: ComponentType<{
  children: ReactNode;
  queryClient: QueryClient;
  trpcClient: TRPCClient<AppRouter>;
}> = trpcContext.TRPCProvider;

/**
 * Hook to access the tRPC client with full type safety
 * Returns a proxy object with all your tRPC procedures
 */
export const useTRPC: () => TRPCOptionsProxy<AppRouter> = trpcContext.useTRPC;

/**
 * Hook to access the raw tRPC client
 * Useful for advanced use cases
 */
export const useTRPCClient: () => TRPCClient<AppRouter> = trpcContext.useTRPCClient;
