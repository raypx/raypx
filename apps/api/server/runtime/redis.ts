import { Redis } from "ioredis";
import type { AuthSecondaryStorage } from "@raypx/auth/server";
import type { RateLimiter } from "../rate-limit.js";

export interface RedisResources {
  secondaryStorage: AuthSecondaryStorage;
  rateLimit: RateLimiter;
  close(): Promise<void>;
}

/**
 * Optional Node cache for Better Auth sessions and rate limits. Workers never import
 * this module: they keep PostgreSQL as the shared store.
 */
export function connectRedis(url: string, prefix = "raypx:"): RedisResources {
  // Fail requests quickly instead of queueing them while the server is unreachable.
  const client = new Redis(url, { maxRetriesPerRequest: 1, keyPrefix: prefix });
  // ioredis reconnects on its own; without a listener an outage would crash the process.
  client.on("error", () => {});
  // MULTI keeps INCR and the first expiry atomic; EXPIRE NX needs Redis 7+ or Valkey.
  const increment = async (key: string, ttl: number) => {
    const results = await client
      .multi()
      .incr(key)
      .expire(key, Math.max(1, Math.ceil(ttl)), "NX")
      .exec();
    if (!results) throw new Error("Redis transaction aborted");
    // A failed EXPIRE would leave a counter that never resets, so it fails the check too.
    for (const [error] of results) if (error) throw error;
    return Number(results[0]?.[1]);
  };
  return {
    secondaryStorage: {
      get: (key) => client.get(key),
      getAndDelete: (key) => client.getdel(key),
      increment,
      set: async (key, value, ttl) => {
        if (ttl && ttl > 0) await client.set(key, value, "EX", Math.ceil(ttl));
        else await client.set(key, value);
      },
      delete: async (key) => {
        await client.del(key);
      },
    },
    // Fixed windows: the first request of a window sets the expiry.
    rateLimit: async (key, rule) => (await increment(`rate:${key}`, rule.window)) <= rule.max,
    close: async () => {
      await client.quit().catch(() => client.disconnect());
    },
  };
}
