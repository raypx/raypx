import type { CacheStore } from "./types.js";

export interface MemoryStoreOptions {
  /** Least recently used entries are evicted beyond this count. */
  maxEntries?: number;
  now?: () => number;
}

/** Process- or isolate-local store; works on Node and Workers without bindings. */
export function createMemoryStore({
  maxEntries = 1000,
  now = Date.now,
}: MemoryStoreOptions = {}): CacheStore {
  const entries = new Map<string, { value: string; expiresAt: number }>();
  return {
    async get(key) {
      const entry = entries.get(key);
      if (!entry) return null;
      entries.delete(key);
      if (entry.expiresAt <= now()) return null;
      // Reinsert so Map order tracks recency.
      entries.set(key, entry);
      return entry.value;
    },
    async set(key, value, ttlMs) {
      entries.delete(key);
      if (ttlMs <= 0) return;
      entries.set(key, { value, expiresAt: now() + ttlMs });
      for (const oldest of entries.keys()) {
        if (entries.size <= maxEntries) break;
        entries.delete(oldest);
      }
    },
    async delete(key) {
      entries.delete(key);
    },
  };
}
