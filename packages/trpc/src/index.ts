import type { inferRouterInputs, inferRouterOutputs } from "@trpc/server"

import type { AppRouter } from "./routes/root"
import { appRouter } from "./routes/root"
import { createTRPCContext } from "./trpc"

/**
 * Inference helpers for input types
 * @example
 * type PostByIdInput = RouterInputs['post']['byId']
 *      ^? { id: number }
 **/
type RouterInputs = inferRouterInputs<AppRouter>

/**
 * Inference helpers for output types
 * @example
 * type AllPostsOutput = RouterOutputs['post']['all']
 *      ^? Post[]
 **/
type RouterOutputs = inferRouterOutputs<AppRouter>

export { createTRPCContext, appRouter }
export type { AppRouter, RouterInputs, RouterOutputs }
export { fetchRequestHandler } from "@trpc/server/adapters/fetch"
