/** Raw TTL store. Adapters may evict early; a miss is always safe. */
export interface CacheStore {
  get(this: void, key: string): Promise<string | null>;
  set(this: void, key: string, value: string, ttlMs: number): Promise<void>;
  delete(this: void, key: string): Promise<void>;
}

/** Validates a stored value; throw to treat it as a miss. */
export type CacheParser<T> = (value: unknown) => T;

export interface Cache {
  get<T>(this: void, key: string, parse: CacheParser<T>): Promise<T | undefined>;
  set(this: void, key: string, value: unknown, ttlMs: number): Promise<void>;
  delete(this: void, key: string): Promise<void>;
  /**
   * Serves a fresh copy of the stored value or loads, stores and returns it. Concurrent
   * misses in one process share a load; failed loads are never stored.
   */
  getOrLoad<T>(
    this: void,
    key: string,
    options: { ttlMs: number; parse: CacheParser<T> },
    load: () => Promise<T>,
  ): Promise<T>;
}
