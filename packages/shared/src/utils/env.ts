/**
 * Environment detection utilities
 * Provides simple constants to detect runtime environment
 *
 * ## Usage with TanStack Start
 *
 * For TanStack Start projects, use these constants for basic environment checks:
 *
 * ```ts
 * import { isClient, isServer, isProd } from '@raypx/shared';
 *
 * // ✅ Simple environment checks
 * if (isClient) {
 *   // Access browser APIs
 * }
 *
 * if (isProd) {
 *   // Production-specific logic
 * }
 * ```
 *
 * **For code splitting and server-only logic, use TanStack Start's built-in functions:**
 *
 * ```ts
 * import { createServerOnlyFn, createClientOnlyFn, createServerFn } from '@tanstack/react-start';
 *
 * // ✅ Server-only code (tree-shaken from client)
 * const getEnv = createServerOnlyFn(() => process.env.NODE_ENV);
 *
 * // ✅ Client-only code (tree-shaken from server)
 * const getWidth = createClientOnlyFn(() => window.innerWidth);
 *
 * // ✅ Server RPC (secure, async)
 * const getSecret = createServerFn().handler(() => process.env.SECRET_KEY);
 * ```
 */

/**
 * Check if code is running on the client side (browser)
 */
export const isClient = typeof window !== "undefined";

/**
 * Check if code is running on the server side (Node.js)
 */
export const isServer = !isClient;

/**
 * Check if running in SSR mode
 * Note: import.meta.env.SSR is only available in Vite SSR builds
 */
export const isSSR = import.meta.env?.SSR ?? isServer;

/**
 * Check if running in production environment
 */
export const isProd = import.meta.env.PROD;

/**
 * Check if running in development environment
 */
export const isDev = import.meta.env.DEV;

/**
 * Check if running in browser environment
 * @alias isClient
 */
export const isBrowser = isClient;

/**
 * Check if running in Node.js environment
 */
export const isNode =
  typeof process !== "undefined" && process.versions != null && process.versions.node != null;
