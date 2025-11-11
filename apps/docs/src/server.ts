import { createMiddleware } from "@raypx/i18n/middleware";
import handler from "@tanstack/react-start/server-entry";
import type { Promisable } from "type-fest";
import i18nConfig from "./lib/i18n";

/**
 * Paths that should bypass i18n middleware
 * Performance: Using Set for O(1) prefix lookups
 */
const SKIP_I18N_PATH_SET = new Set(["/api", "/.well-known", "/_"]);

/**
 * Static asset extensions that should bypass i18n middleware
 * Performance: Pre-compiled regex pattern
 */
const STATIC_ASSET_PATTERN = /\.(js|css|png|jpg|jpeg|gif|svg|ico|woff2?|ttf|eot|webp|avif)$/i;

/**
 * Check if a request should skip i18n processing
 *
 * Performance optimizations:
 * - Check most common case first (static assets)
 * - Use optimized startsWith with Set iteration
 * - Early returns for fast path
 */
function shouldSkipI18n(pathname: string): boolean {
  // Performance: Check static assets last (most common in production)
  // But check skip paths first since they're fewer
  for (const skipPath of SKIP_I18N_PATH_SET) {
    if (pathname.startsWith(skipPath)) return true;
  }

  return STATIC_ASSET_PATTERN.test(pathname);
}

// Create i18n middleware with config
const i18nMiddleware = createMiddleware(i18nConfig);

export default {
  fetch(req: Request): Promisable<Response> {
    const { pathname } = new URL(req.url);

    // Skip i18n for API routes, static assets, and non-GET requests
    if (req.method !== "GET" || shouldSkipI18n(pathname)) {
      return handler.fetch(req);
    }

    // Apply i18n middleware for locale detection and redirection
    return i18nMiddleware(req, ({ request }) => handler.fetch(request));
  },
};
