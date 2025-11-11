/**
 * @raypx/trpc - tRPC server package
 *
 * This package contains the server-side tRPC configuration and routers.
 * For client-side usage, import from "@raypx/trpc/client"
 */

// Error handling exports
export {
  AppErrorCode,
  createAppError,
  type ErrorMeta,
  Errors,
  isAppError,
} from "./errors";
export {
  type ErrorLogEntry,
  errorLoggingMiddleware,
  LogLevel,
  performanceLoggingMiddleware,
} from "./middlewares/error-logger";
export { type AppRouter, trpcRouter } from "./router";
export { usersRouter } from "./routers/users";
export {
  createTRPCContext,
  middleware,
  protectedProcedure,
  publicProcedure,
  type TRPCContext,
} from "./trpc";

export {
  assertCondition,
  assertExists,
  assertOwnership,
  assertPermission,
  handleDatabaseError,
  retryWithBackoff,
  safeJsonParse,
  validateNonEmpty,
  withErrorHandling,
} from "./utils/error-handler";
