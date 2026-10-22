import type { CacheStore } from "./types.js";

export interface TieredStoreOptions {
  /** Upper bound on how long a value stays in the near store; keep it below feature TTLs. */
  nearTtlMs: number;
}

/**
 * Serves hot keys from a near (memory) store before a shared far store such as Redis,
 * so repeated reads skip the network and a far-store outage costs at most one failed
 * read per key per `nearTtlMs`. Writes in this process reach both; other processes
 * observe them once their near copy expires.
 */
export function createTieredStore(
  near: CacheStore,
  far: CacheStore,
  { nearTtlMs }: TieredStoreOptions,
): CacheStore {
  return {
    async get(key) {
      const local = await near.get(key);
      if (local !== null) return local;
      const shared = await far.get(key);
      if (shared !== null) await near.set(key, shared, nearTtlMs);
      return shared;
    },
    async set(key, value, ttlMs) {
      await near.set(key, value, Math.min(ttlMs, nearTtlMs));
      await far.set(key, value, ttlMs);
    },
    async delete(key) {
      await near.delete(key);
      await far.delete(key);
    },
  };
}
