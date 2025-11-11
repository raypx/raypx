import { deLocalizeUrl, localizeUrl } from "@raypx/i18n/runtime";

/**
 * Simple LRU cache for URL transformations
 * Performance: Avoids repeated URL parsing and transformation
 */
class URLCache {
  private cache = new Map<string, URL>();
  private maxSize: number;

  constructor(maxSize = 100) {
    this.maxSize = maxSize;
  }

  get(key: string): URL | undefined {
    const value = this.cache.get(key);
    if (value) {
      // Move to end (LRU)
      this.cache.delete(key);
      this.cache.set(key, value);
    }
    return value;
  }

  set(key: string, value: URL): void {
    // Remove oldest entry if cache is full
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        this.cache.delete(firstKey);
      }
    }
    this.cache.set(key, value);
  }

  clear(): void {
    this.cache.clear();
  }

  get size(): number {
    return this.cache.size;
  }
}

/**
 * Configuration options for router rewrite
 */
export interface RouterRewriteConfig {
  /**
   * Maximum number of URLs to cache (default: 100)
   * Higher values use more memory but improve cache hit rate
   */
  cacheSize?: number;

  /**
   * Enable cache (default: true)
   * Disable for debugging or testing
   */
  enableCache?: boolean;
}

/**
 * Creates TanStack Router rewrite configuration with optimized i18n support
 *
 * This function provides:
 * - Automatic locale prefix stripping for route matching (input)
 * - Automatic locale prefix adding for URL generation (output)
 * - Built-in LRU caching for performance (100 URLs by default)
 *
 * The rewrite configuration works with the server middleware to provide
 * seamless i18n routing:
 * - Server middleware handles initial locale detection and redirection
 * - Router rewrite handles client-side navigation and URL generation
 *
 * @example
 * ```typescript
 * import { createRouterRewrite } from "@raypx/i18n/router";
 * import { createRouter } from "@tanstack/react-router";
 *
 * export const getRouter = () => {
 *   const router = createRouter({
 *     routeTree,
 *     rewrite: createRouterRewrite(),
 *   });
 *   return router;
 * };
 * ```
 *
 * @example With custom cache size
 * ```typescript
 * rewrite: createRouterRewrite({ cacheSize: 200 })
 * ```
 *
 * @example Disable cache for debugging
 * ```typescript
 * rewrite: createRouterRewrite({ enableCache: false })
 * ```
 */
export function createRouterRewrite(config: RouterRewriteConfig = {}) {
  const { cacheSize = 100, enableCache = true } = config;

  // Initialize caches only if caching is enabled
  const deLocalizeCache = enableCache ? new URLCache(cacheSize) : null;
  const localizeCache = enableCache ? new URLCache(cacheSize) : null;

  return {
    /**
     * Input transform: Strips locale prefix from URL for route matching
     *
     * Example: /en/about → /about (matches route definition)
     *
     * This allows route definitions to be locale-agnostic while keeping URLs localized.
     */
    input: ({ url }: { url: URL }) => {
      if (!enableCache || !deLocalizeCache) {
        return deLocalizeUrl(url);
      }

      const key = url.href;
      const cached = deLocalizeCache.get(key);
      if (cached) return cached;

      const result = deLocalizeUrl(url);
      deLocalizeCache.set(key, result);
      return result;
    },

    /**
     * Output transform: Adds locale prefix back to generated URLs
     *
     * Example: /about → /en/about (maintains localized URLs)
     *
     * This ensures all generated URLs include the appropriate locale prefix.
     */
    output: ({ url }: { url: URL }) => {
      if (!enableCache || !localizeCache) {
        return localizeUrl(url);
      }

      const key = url.href;
      const cached = localizeCache.get(key);
      if (cached) return cached;

      const result = localizeUrl(url);
      localizeCache.set(key, result);
      return result;
    },
  };
}

/**
 * Get cache statistics (useful for debugging and monitoring)
 *
 * @example
 * ```typescript
 * import { getCacheStats } from "@raypx/i18n/router";
 *
 * const stats = getCacheStats();
 * console.log(`Delocalize cache: ${stats.deLocalizeSize} entries`);
 * console.log(`Localize cache: ${stats.localizeSize} entries`);
 * ```
 */
export function getCacheStats(rewrite: ReturnType<typeof createRouterRewrite>) {
  // This is a limitation - we can't access the caches from outside
  // without exposing them. Consider this for future enhancement.
  return {
    message: "Cache stats not available. Use enableCache: false for debugging.",
  };
}
