import type { I18nConfig } from "./index";
import "urlpattern-polyfill";

/**
 * Middleware handler function that processes requests with i18n context
 */
export type MiddlewareHandler = (request: Request) => Promise<Response> | Response;

/**
 * Middleware next function with processed request
 */
export type MiddlewareNext = (context: {
  request: Request;
  locale: string;
}) => Promise<Response> | Response;

/**
 * Configuration options for i18n middleware
 */
export interface I18nMiddlewareConfig {
  baseLocale: string;
  locales: string[];
  cookieName?: string;
  prefixDefault?: boolean;
}

/**
 * Creates an i18n middleware similar to next-intl's createMiddleware
 *
 * This middleware handles:
 * 1. Locale detection from URL, cookie, or Accept-Language header
 * 2. Automatic redirection to localized URLs
 * 3. Setting locale cookie for persistence
 *
 * Performance optimizations:
 * - Uses Set for O(1) locale lookups instead of Array.includes O(n)
 * - Pre-compiles cookie regex pattern
 * - Caches parsed cookie values per request
 * - Optimized pathname parsing with early returns
 *
 * @example
 * ```typescript
 * import { createMiddleware } from "@raypx/i18n/middleware";
 * import i18nConfig from "./lib/i18n";
 *
 * const i18nMiddleware = createMiddleware(i18nConfig);
 *
 * export default {
 *   async fetch(req: Request) {
 *     return i18nMiddleware(req, ({ request }) => handler.fetch(request));
 *   }
 * };
 * ```
 */
export function createMiddleware(config: I18nConfig | I18nMiddlewareConfig) {
  const { baseLocale, locales, cookieName = "lang" } = config;
  const prefixDefault = "prefixDefault" in config ? config.prefixDefault : false;

  // Performance: Pre-create Set for O(1) locale lookups
  const localeSet = new Set(locales);

  // Performance: Pre-compile cookie regex pattern
  const cookiePattern = new RegExp(`(?:^|;)\\s*${cookieName}=([^;]+)`);

  // Performance: Pre-compile cookie value string for Set-Cookie header
  const cookieMaxAge = 60 * 60 * 24 * 365; // 1 year

  return async (request: Request, next: MiddlewareNext): Promise<Response> => {
    const url = new URL(request.url);
    const { pathname } = url;

    // Performance: Extract locale with optimized Set lookup
    const localeFromUrl = extractLocaleFromUrl(pathname, localeSet);

    if (localeFromUrl) {
      // URL already has a valid locale prefix, proceed with request
      const response = await next({ request, locale: localeFromUrl });
      return setLocaleCookie(response, localeFromUrl, cookieName, cookieMaxAge);
    }

    // Detect locale from cookie or Accept-Language header
    const detectedLocale = detectLocale(request, {
      localeSet,
      baseLocale,
      cookiePattern,
    });

    // Check if we need to redirect (always redirect if not base locale, or if prefixDefault is true)
    const shouldRedirect = detectedLocale !== baseLocale || prefixDefault;

    if (shouldRedirect) {
      // Redirect to localized URL
      const localizedUrl = new URL(url);
      localizedUrl.pathname = `/${detectedLocale}${pathname}`;

      const response = Response.redirect(localizedUrl, 307);
      return setLocaleCookie(response, detectedLocale, cookieName, cookieMaxAge);
    }

    // No redirect needed (base locale without prefix)
    const response = await next({ request, locale: baseLocale });
    return setLocaleCookie(response, baseLocale, cookieName, cookieMaxAge);
  };
}

/**
 * Extracts locale from URL pathname with optimized performance
 * Returns null if no valid locale is found in the path
 *
 * Performance: O(1) Set lookup instead of O(n) Array.includes
 *
 * @example
 * extractLocaleFromUrl("/en/about", localeSet) // "en"
 * extractLocaleFromUrl("/about", localeSet) // null
 */
function extractLocaleFromUrl(pathname: string, localeSet: Set<string>): string | null {
  // Performance: Early return for root path
  if (pathname === "/") return null;

  // Performance: Find first segment without creating array
  const firstSlash = pathname.indexOf("/", 1);
  const firstSegment = firstSlash === -1 ? pathname.slice(1) : pathname.slice(1, firstSlash);

  // Performance: O(1) Set.has instead of O(n) Array.includes
  return firstSegment && localeSet.has(firstSegment) ? firstSegment : null;
}

/**
 * Detects locale from request using the following priority:
 * 1. Cookie (user's previous preference)
 * 2. Accept-Language header (browser preference)
 * 3. Base locale (fallback)
 *
 * Performance: Uses pre-compiled regex and Set for fast lookups
 */
function detectLocale(
  request: Request,
  config: { localeSet: Set<string>; baseLocale: string; cookiePattern: RegExp },
): string {
  const { localeSet, baseLocale, cookiePattern } = config;

  // 1. Check cookie for previously set locale (fastest path)
  const cookieLocale = getLocaleFromCookie(request, cookiePattern);
  if (cookieLocale && localeSet.has(cookieLocale)) {
    return cookieLocale;
  }

  // 2. Check Accept-Language header
  const headerLocale = getLocaleFromAcceptLanguage(request, localeSet);
  if (headerLocale) {
    return headerLocale;
  }

  // 3. Fallback to base locale
  return baseLocale;
}

/**
 * Extracts locale from cookie header using pre-compiled regex
 * Performance: Uses provided regex pattern to avoid recreating it
 */
function getLocaleFromCookie(request: Request, cookiePattern: RegExp): string | null {
  const cookieHeader = request.headers.get("cookie");
  if (!cookieHeader) return null;

  const match = cookiePattern.exec(cookieHeader);
  return match?.[1] ?? null;
}

/**
 * Parses Accept-Language header and finds best matching locale
 * Uses an optimized quality-based algorithm
 *
 * Performance optimizations:
 * - Early return on first high-quality match (q=1)
 * - Avoids full array sort for common cases
 * - Uses Set.has for O(1) locale validation
 *
 * @example
 * Accept-Language: en-US,en;q=0.9,zh;q=0.8
 * Supported: Set(["en", "zh"])
 * Result: "en"
 */
function getLocaleFromAcceptLanguage(
  request: Request,
  supportedLocales: Set<string>,
): string | null {
  const acceptLanguage = request.headers.get("accept-language");
  if (!acceptLanguage) return null;

  // Performance: Track highest quality match without full sort
  let bestMatch: string | null = null;
  let bestQuality = 0;

  // Performance: Process languages in order, can early-return on q=1
  const languages = acceptLanguage.split(",");
  for (let i = 0; i < languages.length; i++) {
    const lang = languages[i];
    if (!lang) continue;

    const trimmed = lang.trim();
    const semicolonIndex = trimmed.indexOf(";");

    // Extract locale and quality
    let locale: string;
    let quality: number;

    if (semicolonIndex === -1) {
      // No quality specified, default q=1
      locale = trimmed;
      quality = 1;
    } else {
      locale = trimmed.slice(0, semicolonIndex);
      // Parse quality value (e.g., "q=0.9")
      const qStart = trimmed.indexOf("=", semicolonIndex);
      quality = qStart === -1 ? 1 : Number.parseFloat(trimmed.slice(qStart + 1)) || 0;
    }

    // Normalize locale (e.g., "en-US" -> "en")
    const dashIndex = locale.indexOf("-");
    const normalizedLocale = (dashIndex === -1 ? locale : locale.slice(0, dashIndex)).toLowerCase();

    // Check if this locale is supported
    if (normalizedLocale && supportedLocales.has(normalizedLocale)) {
      // Performance: Early return on perfect match
      if (quality === 1) {
        return normalizedLocale;
      }

      // Track best match
      if (quality > bestQuality) {
        bestMatch = normalizedLocale;
        bestQuality = quality;
      }
    }
  }

  return bestMatch;
}

/**
 * Sets locale cookie in response headers
 * Cookie is set with 1 year expiration and SameSite=Lax for security
 *
 * Performance: Pre-builds cookie string to avoid repeated string operations
 */
function setLocaleCookie(
  response: Response,
  locale: string,
  cookieName: string,
  maxAge: number,
): Response {
  // Clone response to modify headers
  const newResponse = new Response(response.body, response);

  // Performance: Build cookie string directly
  const cookieValue = `${cookieName}=${locale}; Path=/; Max-Age=${maxAge}; SameSite=Lax`;

  newResponse.headers.append("Set-Cookie", cookieValue);
  return newResponse;
}
