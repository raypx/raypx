import type { Storage } from "unstorage";
import { createLogger } from "@raypx/logger";

export interface CacheOptions<T> {
  storage: Storage;
  /** A namespace owned by this feature; clearing never deletes other features' data. */
  namespace: string;
  /** Validates both freshly loaded and persisted values. */
  schema: { parse(value: unknown): T };
  now?: () => number;
  maxInFlight?: number;
}
export type CacheResult<T> = { hit: true; value: T } | { hit: false };
export interface CacheStore<T> {
  get(key: string): Promise<CacheResult<T>>;
  getOrSet(key: string, ttlSeconds: number, load: () => T | Promise<T>): Promise<T>;
  invalidate(key: string): Promise<void>;
  clear(): Promise<void>;
}

/**
 * Creates a schema-validated cache with TTL, process-local request coalescing and
 * isolated invalidation. Cache-driver failures become misses; loader failures
 * propagate. Invalidation prevents pending work from repopulating stale values.
 */
export function createCache<T>(options: CacheOptions<T>): CacheStore<T> {
  if (!/^[a-zA-Z0-9._-]{1,128}$/.test(options.namespace))
    throw new Error("Invalid cache namespace");
  const maxInFlight = options.maxInFlight ?? 1000;
  if (!Number.isSafeInteger(maxInFlight) || maxInFlight < 1)
    throw new Error("Invalid cache capacity");
  const logger = createLogger({ name: "cache" });
  const now = options.now ?? Date.now;
  const prefix = `${options.namespace}:`;
  // A failed invalidation cannot permit future reads of potentially stale data.
  // Bypass this instance until it is recreated, keeping recovery state bounded.
  let bypass = false;
  type Pending = { promise: Promise<T>; invalidated: boolean; write?: Promise<void> };
  const pending = new Map<string, Pending>();
  function storageKey(key: string): string {
    if (!/^[a-zA-Z0-9._:-]{1,256}$/.test(key)) throw new Error("Invalid cache key");
    return `${prefix}${key}`;
  }
  function clock(): number {
    const time = now();
    if (!Number.isFinite(time) || time < 0) throw new Error("Invalid cache clock");
    return time;
  }
  async function remove(key: string): Promise<void> {
    try {
      await options.storage.removeItem(key);
    } catch {
      bypass = true;
      logger.warn("Cache invalidation failed; bypassing cache instance");
    }
  }
  async function get(key: string): Promise<CacheResult<T>> {
    const fullKey = storageKey(key);
    const time = clock();
    if (bypass) return { hit: false };
    let envelope: unknown;
    try {
      envelope = await options.storage.getItem(fullKey);
    } catch {
      logger.warn("Cache read failed");
      return { hit: false };
    }
    if (bypass) return { hit: false };
    if (envelope === null) return { hit: false };
    if (
      typeof envelope === "object" &&
      envelope !== null &&
      "version" in envelope &&
      envelope.version === 1 &&
      "expiresAt" in envelope &&
      typeof envelope.expiresAt === "number" &&
      Number.isFinite(envelope.expiresAt) &&
      envelope.expiresAt > time &&
      "value" in envelope
    ) {
      try {
        return { hit: true, value: options.schema.parse(envelope.value) };
      } catch {
        /* Invalid persisted values must not enter business logic. */
      }
    }
    await remove(fullKey);
    return { hit: false };
  }
  return {
    get,
    async getOrSet(key, ttlSeconds, load) {
      const fullKey = storageKey(key);
      if (!Number.isFinite(ttlSeconds) || ttlSeconds <= 0 || ttlSeconds > 31_536_000)
        throw new Error("Cache TTL must be positive and at most one year");
      const current = pending.get(key);
      if (current && !current.invalidated) return current.promise;
      if (pending.size >= maxInFlight && !current) return options.schema.parse(await load());
      const entry: Pending = {
        invalidated: false,
        promise: Promise.resolve()
          .then(async () => {
            const cached = await get(key);
            if (cached.hit) return cached.value;
            const value = options.schema.parse(await load());
            if (!entry.invalidated && !bypass) {
              try {
                entry.write = options.storage.setItem(fullKey, {
                  version: 1,
                  value,
                  expiresAt: clock() + ttlSeconds * 1000,
                });
                await entry.write;
              } catch {
                logger.warn("Cache write failed");
              }
            }
            return value;
          })
          .finally(() => {
            if (pending.get(key) === entry) pending.delete(key);
          }),
      };
      pending.set(key, entry);
      return entry.promise;
    },
    async invalidate(key) {
      const fullKey = storageKey(key);
      const current = pending.get(key);
      if (current) {
        current.invalidated = true;
        await current.write?.catch(() => undefined);
      }
      await remove(fullKey);
    },
    async clear() {
      const active = [...pending.values()];
      for (const entry of active) entry.invalidated = true;
      await Promise.all(
        active.flatMap((entry) => (entry.write ? [entry.write.catch(() => undefined)] : [])),
      );
      try {
        const keys = await options.storage.getKeys(prefix);
        await Promise.all(keys.filter((key) => key.startsWith(prefix)).map(remove));
      } catch {
        bypass = true;
        logger.warn("Cache clear failed; bypassing cache instance");
      }
    },
  };
}
