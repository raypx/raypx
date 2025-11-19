import { createConsola } from "@raypx/shared/logger";

/**
 * Check if code is running on the client side
 */
export const isClient = typeof window !== "undefined";

/**
 * Check if code is running on the server side
 */
export const isServer = !isClient;

/**
 * Check if running in SSR mode
 * Note: import.meta.env.SSR is only available in Vite SSR builds
 */
export const isSSR = import.meta.env?.SSR ?? isServer;

/**
 * Check if running in production
 */
export const isProd = import.meta.env.PROD;

/**
 * Check if running in development
 */
export const isDev = import.meta.env.DEV;

/**
 * Safe way to check if window is available and execute client-only code
 */
export function runOnClient<T>(fn: () => T, fallback?: T): T | undefined {
  if (isClient) {
    return fn();
  }
  return fallback;
}

/**
 * Safe way to check if server and execute server-only code
 */
export function runOnServer<T>(fn: () => T, fallback?: T): T | undefined {
  if (isServer) {
    return fn();
  }
  return fallback;
}

/**
 * Analytics-specific logger with [Analytics] tag
 * Uses createConsola for better debugging and filtering
 */
export const logger = createConsola({
  level: isProd ? 3 : 4, // info in prod, debug in dev
  formatOptions: {
    colors: true,
    date: false,
    compact: true,
  },
}).withTag("Analytics");
