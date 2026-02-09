/**
 * Development & Debugging Tools
 *
 * This file provides internal tools for development and debugging.
 * These are not part of the public API and should only be used in development.
 *
 * @example
 * ```ts
 * // Only import this in development!
 * if (process.env.NODE_ENV !== "production") {
 *   const { cacheLog, cacheClear } = await import("./dev");
 *   cacheLog();  // View cache state
 *   cacheClear(); // Clear cache if needed
 * }
 * ```
 */

export {
  CacheKeys,
  type CacheStats,
  cacheClear,
  cacheDelete,
  cacheGet,
  cacheGetOrSet,
  cacheHas,
  cacheLog,
  cachePreload,
  cacheSet,
  cacheStats,
} from "./cache";
