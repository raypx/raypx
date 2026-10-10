import { prefixStorage } from "unstorage";
import type { Storage } from "unstorage";
import { createLogger } from "@raypx/logger";
import { createStorageInstance, type StorageConfig } from "./instance.js";

const logger = createLogger({ name: "storage" });

/**
 * Global storage instance
 */
let storage: Storage | null = null;

/**
 * Get or create storage instance
 *
 * Compatibility singleton: memory wins when requested or NODE_ENV=test, then
 * explicit Redis or REDIS_URL, then explicit filesystem or ./data/cache.
 * The first configuration remains active until closeStorage(). Prefer
 * createStorageInstance() for explicit configuration and independent ownership.
 *
 * @param config - Storage configuration
 * @returns Storage instance
 *
 * @example
 * ```typescript
 * import { getStorage } from '@raypx/storage';
 *
 * const storage = getStorage();
 * await storage.setItem('key', { data: 'value' });
 * const value = await storage.getItem('key');
 * ```
 */
export function getStorage(config?: StorageConfig) {
  if (storage) return storage;
  const redis = config?.redis || process.env.REDIS_URL;
  storage = createStorageInstance({
    ...(redis ? { redis } : {}),
    memory: config?.memory || process.env.NODE_ENV === "test",
    fsBase: config?.fsBase || "./data/cache",
  });
  return storage;
}

/**
 * Create a namespaced storage instance
 *
 * All keys will be prefixed with the namespace
 *
 * @param namespace - Namespace prefix
 * @returns Namespaced storage
 *
 * @example
 * ```typescript
 * import { createNamespacedStorage } from '@raypx/storage';
 *
 * const userCache = createNamespacedStorage('users');
 * await userCache.setItem('123', userData); // Stored as "users:123"
 * ```
 */
export function createNamespacedStorage(namespace: string) {
  const base = getStorage();
  return prefixStorage(base, namespace);
}

/**
 * Cache decorator with automatic expiration
 *
 * @param key - Cache key
 * @param ttl - Time to live in seconds
 * @param fn - Function to execute if cache miss
 * @returns Cached or fresh value
 *
 * @example
 * ```typescript
 * import { cache } from '@raypx/storage';
 *
 * const user = await cache('user:123', 3600, async () => {
 *   return await db.select().from(users).where(eq(users.id, 123));
 * });
 * ```
 */
export async function cache<T>(key: string, ttl: number, fn: () => Promise<T>): Promise<T> {
  const storage = getStorage();

  // Check cache
  const cached = await storage.getItem(key);
  if (
    cached !== null &&
    typeof cached === "object" &&
    "expires" in cached &&
    typeof cached.expires === "number" &&
    cached.expires > Date.now()
  ) {
    logger.debug("Cache hit", { key });
    // This envelope is written by cache<T>; undefined values are omitted by JSON serialization.
    return ("value" in cached ? cached.value : undefined) as T;
  }

  // Cache miss - execute function
  logger.debug("Cache miss", { key });
  const value = await fn();

  // Store with expiration
  await storage.setItem(key, {
    value,
    expires: Date.now() + ttl * 1000,
  });

  return value;
}

/**
 * Invalidate cache by key or pattern
 *
 * @param pattern - Key or glob pattern
 *
 * @example
 * ```typescript
 * import { invalidate } from '@raypx/storage';
 *
 * await invalidate('user:123');           // Single key
 * await invalidate('users:*');            // All users
 * ```
 */
export async function invalidate(pattern: string) {
  const storage = getStorage();

  if (pattern.includes("*")) {
    // Pattern matching
    const prefix = pattern.slice(0, pattern.indexOf("*"));
    const matcher = new RegExp(
      `^${pattern
        .split("*")
        .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
        .join(".*")}$`,
    );
    const keys = (await storage.getKeys(prefix)).filter((key) => matcher.test(key));
    logger.info("Invalidating cache", { pattern, count: keys.length });
    await Promise.all(keys.map((key) => storage.removeItem(key)));
  } else {
    // Single key
    logger.debug("Invalidating cache", { key: pattern });
    await storage.removeItem(pattern);
  }
}

/**
 * Clear all cached data
 *
 * @example
 * ```typescript
 * import { clearAll } from '@raypx/storage';
 *
 * await clearAll();
 * ```
 */
export async function clearAll() {
  const storage = getStorage();
  logger.warn("Clearing all cache");
  await storage.clear();
}

// Re-export unstorage types
export type { Storage } from "unstorage";
export { createStorageInstance, type StorageConfig } from "./instance.js";
export { createCache, type CacheOptions, type CacheStore, type CacheResult } from "./cache.js";

/** Disposes the active storage driver once and allows a later explicit initialization. */
export async function closeStorage(): Promise<void> {
  const current = storage;
  storage = null;
  await current?.dispose();
}
