import { createTRPCContext } from "@trpc/tanstack-react-query";
import type { TRPCRouter } from "./router";

/**
 * Create tRPC React hooks and provider
 * This should be imported in the client-side application
 */
export const { TRPCProvider, useTRPC } = createTRPCContext<TRPCRouter>();
