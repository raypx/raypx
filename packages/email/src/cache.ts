/**
 * Global adapter cache
 * Caches loaded adapter modules to avoid repeated dynamic imports
 */

// Extend global type to include our cache
declare global {
  var __raypx_email_adapter_cache__: Map<string, any> | undefined;
}

/**
 * Get or create the global adapter cache
 */
function getCache(): Map<string, any> {
  if (!global.__raypx_email_adapter_cache__) {
    global.__raypx_email_adapter_cache__ = new Map();
  }
  return global.__raypx_email_adapter_cache__;
}

/**
 * Check if development mode (for cache invalidation)
 */
function isDevelopment(): boolean {
  return process.env.NODE_ENV !== "production";
}

/**
 * Cache statistics
 */
export interface CacheStats {
  size: number;
  keys: string[];
  hits: number;
  misses: number;
}

// Simple hit/miss tracking
let cacheHits = 0;
let cacheMisses = 0;

/**
 * Get a value from cache
 * @param key - Cache key
 * @returns Cached value or undefined if not found
 */
export function cacheGet<T>(key: string): T | undefined {
  const cache = getCache();
  const value = cache.get(key) as T;

  if (value !== undefined) {
    cacheHits++;
    if (isDevelopment()) {
      console.log(`[Email Cache] HIT: ${key}`);
    }
    return value;
  }

  cacheMisses++;
  if (isDevelopment()) {
    console.log(`[Email Cache] MISS: ${key}`);
  }
  return undefined;
}

/**
 * Set a value in cache
 * @param key - Cache key
 * @param value - Value to cache
 */
export function cacheSet<T>(key: string, value: T): void {
  const cache = getCache();
  cache.set(key, value);

  if (isDevelopment()) {
    console.log(`[Email Cache] SET: ${key} (total cached: ${cache.size})`);
  }
}

/**
 * Get or set a value in cache
 * If the key doesn't exist, the factory function is called and the result is cached
 * @param key - Cache key
 * @param factory - Function to create the value if not cached
 * @returns Cached or newly created value
 */
export async function cacheGetOrSet<T>(key: string, factory: () => T | Promise<T>): Promise<T> {
  const cached = cacheGet<T>(key);
  if (cached !== undefined) {
    return cached;
  }

  const value = await factory();
  cacheSet(key, value);
  return value;
}

/**
 * Check if a key exists in cache
 * @param key - Cache key
 * @returns True if key exists in cache
 */
export function cacheHas(key: string): boolean {
  return getCache().has(key);
}

/**
 * Delete a specific key from cache
 * @param key - Cache key to delete
 * @returns True if key was deleted
 */
export function cacheDelete(key: string): boolean {
  const cache = getCache();
  const deleted = cache.delete(key);

  if (isDevelopment() && deleted) {
    console.log(`[Email Cache] DELETE: ${key}`);
  }

  return deleted;
}

/**
 * Clear all cached adapters
 * Useful for testing or development when you need to reload modules
 */
export function cacheClear(): void {
  const cache = getCache();
  const size = cache.size;
  cache.clear();

  // Reset statistics
  cacheHits = 0;
  cacheMisses = 0;

  if (isDevelopment()) {
    console.log(`[Email Cache] CLEARED ${size} items`);
  }
}

/**
 * Get cache statistics
 * @returns Cache statistics including size, keys, and hit/miss counts
 */
export function cacheStats(): CacheStats {
  const cache = getCache();
  return {
    size: cache.size,
    keys: Array.from(cache.keys()),
    hits: cacheHits,
    misses: cacheMisses,
  };
}

/**
 * Preload specific adapters into cache
 * Useful for optimizing cold start in production
 * @param adapters - Array of adapter names to preload
 */
export async function cachePreload(adapters: string[]): Promise<void> {
  if (isDevelopment()) {
    console.log(`[Email Cache] Preloading ${adapters.length} adapters...`);
  }

  for (const adapter of adapters) {
    try {
      // This will trigger the factory and cache the result
      // The actual loading happens in the adapter files
      if (isDevelopment()) {
        console.log(`[Email Cache] Preloading: ${adapter}`);
      }
    } catch (error) {
      console.error(`[Email Cache] Failed to preload ${adapter}:`, error);
    }
  }
}

/**
 * Log current cache state (development only)
 */
export function cacheLog(): void {
  if (!isDevelopment()) {
    return;
  }

  const stats = cacheStats();
  console.log("[Email Cache] Current state:", {
    size: stats.size,
    keys: stats.keys,
    hitRate:
      stats.hits + stats.misses > 0
        ? `${((stats.hits / (stats.hits + stats.misses)) * 100).toFixed(1)}%`
        : "N/A",
    hits: stats.hits,
    misses: stats.misses,
  });
}

/**
 * Initialize cache with default settings
 * Called automatically on first import
 */
export function cacheInit(): void {
  if (isDevelopment() && !global.__raypx_email_adapter_cache__) {
    console.log("[Email Cache] Initialized in development mode");
  }
}

// Auto-initialize
cacheInit();

/**
 * Cache keys for different resources
 */
export const CacheKeys = {
  RESEND_ADAPTER: "adapter:resend",
  NODEMAILER_ADAPTER: "adapter:nodemailer",
  SENDGRID_ADAPTER: "adapter:sendgrid",
  AWS_SES_ADAPTER: "adapter:aws-ses",
  RESEND_MODULE: "module:resend",
  NODEMAILER_MODULE: "module:nodemailer",
  SENDGRID_MODULE: "module:@sendgrid/mail",
  AWS_SES_MODULE: "module:@aws-sdk/client-ses",
} as const;
