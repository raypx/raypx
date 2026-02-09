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
