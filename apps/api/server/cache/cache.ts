import type { Cache, CacheParser, CacheStore } from "./types.js";

export interface CacheOptions {
  /** Prepended to every key so features never collide in a shared store. */
  namespace?: string;
}

/**
 * JSON cache over a raw store. Values are serialized, so callers always receive copies.
 * Store failures degrade to misses and best-effort writes: a cache outage never fails
 * a request that its loader can still answer.
 */
export function createCache(store: CacheStore, { namespace = "cache:" }: CacheOptions = {}): Cache {
  const loads = new Map<string, Promise<unknown>>();
  // Bumped by explicit writes so loads that started earlier never store their result.
  const versions = new Map<string, number>();
  const supersede = (key: string) => {
    loads.delete(key);
    versions.set(key, (versions.get(key) ?? 0) + 1);
  };
  async function get<T>(key: string, parse: CacheParser<T>) {
    try {
      const raw = await store.get(namespace + key);
      return raw === null ? undefined : parse(JSON.parse(raw));
    } catch {
      return undefined;
    }
  }
  async function write(key: string, value: unknown, ttlMs: number) {
    await store.set(namespace + key, JSON.stringify(value), ttlMs).catch(() => {});
  }
  async function getOrLoad<T>(
    key: string,
    { ttlMs, parse }: { ttlMs: number; parse: CacheParser<T> },
    load: () => Promise<T>,
  ) {
    const version = versions.get(key);
    const cached = await get(key, parse);
    if (cached !== undefined) return cached;
    let pending = loads.get(key) as Promise<T> | undefined;
    if (!pending) {
      const current: Promise<T> = load().then(async (value) => {
        if (versions.get(key) === version) await write(key, value, ttlMs);
        return value;
      });
      pending = current;
      loads.set(key, current);
      void current
        .finally(() => {
          if (loads.get(key) === current) loads.delete(key);
        })
        .catch(() => {});
    }
    // Concurrent callers share one load, never one mutable object.
    return structuredClone(await pending);
  }
  return {
    get,
    getOrLoad,
    async set(key, value, ttlMs) {
      supersede(key);
      await write(key, value, ttlMs);
    },
    async delete(key) {
      supersede(key);
      await store.delete(namespace + key).catch(() => {});
    },
  };
}
