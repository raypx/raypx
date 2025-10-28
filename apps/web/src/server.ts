import { paraglideMiddleware } from "@raypx/i18n/server";
import handler from "@tanstack/react-start/server-entry";
import type { Promisable } from "type-fest";

/**
 * Paths that should bypass i18n middleware
 * These paths don't need URL-based locale redirection (e.g., /en/api, /zh/api)
 * API routes can still use cookie/header-based i18n without the middleware
 */
const SKIP_I18N_PATHS = ["/api", "/.well-known", "/_"];

/**
 * Static asset extensions that should bypass i18n middleware
 */
const STATIC_ASSET_PATTERN = /\.(js|css|png|jpg|jpeg|gif|svg|ico|woff2?|ttf|eot|webp|avif)$/i;

/**
 * Check if a request should skip i18n processing
 * Optimized for performance with traditional for loop and null safety
 */
function shouldSkipI18n(pathname: string): boolean {
  // Check skip paths using traditional for loop with null safety
  for (let i = 0; i < SKIP_I18N_PATHS.length; i++) {
    const i18nPath = SKIP_I18N_PATHS[i];
    if (i18nPath && pathname.startsWith(i18nPath)) return true;
  }

  // Check static assets pattern last (least common case)
  return STATIC_ASSET_PATTERN.test(pathname);
}

export default {
  fetch(req: Request): Promisable<Response> {
    const { pathname } = new URL(req.url);

    // Skip i18n for:
    // - Framework internal routes (/_)
    // - Static assets (.js, .css, images, fonts)
    // - Non-GET requests
    if (req.method !== "GET" || shouldSkipI18n(pathname)) {
      return handler.fetch(req);
    }

    // Apply i18n middleware for all GET requests
    return paraglideMiddleware(req, ({ request }) => handler.fetch(request));
  },
};
