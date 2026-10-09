import { createStorage, prefixStorage } from 'unstorage';
import redisDriver from 'unstorage/drivers/redis';
import fsDriver from 'unstorage/drivers/fs';
import memoryDriver from 'unstorage/drivers/memory';
import { createLogger } from '@raypx/logger';

const logger = createLogger({ name: 'storage' });

/**
 * Storage configuration options
 */
export interface StorageConfig {
  /**
   * Redis connection URL
   * @example "redis://localhost:6379"
   */
  redis?: string;

  /**
   * Filesystem base path (fallback)
   * @default "./data/cache"
   */
  fsBase?: string;

  /**
   * Use memory storage (for testing)
   * @default false
   */
  memory?: boolean;
}

/**
 * Global storage instance
 */
let storage: ReturnType<typeof createStorage> | null = null;

/**
 * Get or create storage instance
 *
 * Automatically selects the best driver:
 * - Redis if REDIS_URL is set
 * - Filesystem as fallback
 * - Memory for testing
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

  const redisUrl = config?.redis || process.env.REDIS_URL;
  const useMemory = config?.memory || process.env.NODE_ENV === 'test';
  const fsBase = config?.fsBase || './data/cache';

  // Memory driver (testing)
  if (useMemory) {
    logger.info('Using memory storage');
    storage = createStorage({
      driver: memoryDriver(),
    });
    return storage;
  }

  // Redis driver (production)
  if (redisUrl) {
    logger.info('Using Redis storage', { url: redisUrl.replace(/:[^:]*@/, ':***@') });
    storage = createStorage({
      driver: redisDriver({
        url: redisUrl,
        lazyConnect: true,
      }),
    });
    return storage;
  }

  // Filesystem driver (fallback)
  logger.info('Using filesystem storage', { base: fsBase });
  storage = createStorage({
    driver: fsDriver({
      base: fsBase,
    }),
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
export async function cache<T>(
  key: string,
  ttl: number,
  fn: () => Promise<T>
): Promise<T> {
  const storage = getStorage();

  // Check cache
  const cached = await storage.getItem<{ value: T; expires: number }>(key);
  if (cached && cached.expires > Date.now()) {
    logger.debug('Cache hit', { key });
    return cached.value;
  }

  // Cache miss - execute function
  logger.debug('Cache miss', { key });
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

  if (pattern.includes('*')) {
    // Pattern matching
    const keys = await storage.getKeys(pattern);
    logger.info('Invalidating cache', { pattern, count: keys.length });
    await Promise.all(keys.map(key => storage.removeItem(key)));
  } else {
    // Single key
    logger.debug('Invalidating cache', { key: pattern });
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
  logger.warn('Clearing all cache');
  await storage.clear();
}

// Re-export unstorage types
export type { Storage } from 'unstorage';
