import { Redis } from "ioredis";
import type { AuthSecondaryStorage } from "@raypx/auth/server";
import type { RateLimiter } from "../rate-limit/types.js";
import { configurationScopes, type ConfigurationNotifications } from "../configuration/reads.js";

export interface RedisResources {
  secondaryStorage: AuthSecondaryStorage;
  rateLimit: RateLimiter;
  configurationNotifications: ConfigurationNotifications;
  ping(): Promise<unknown>;
  close(): Promise<void>;
}

/**
 * Optional Redis adapters for Better Auth sessions, rate limits and configuration
 * notifications. Workers keep PostgreSQL as the shared store.
 */
export function connectRedis(url: string, prefix = "raypx:"): RedisResources {
  // Bound connection and command waits, including configuration Pub/Sub.
  const client = new Redis(url, {
    connectTimeout: 3_000,
    commandTimeout: 3_000,
    maxRetriesPerRequest: 1,
    keyPrefix: prefix,
  });
  // Pub/Sub ignores keyPrefix and Redis logical databases.
  const configurationChannel = `${prefix}db:${client.options.db}:configuration`;
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
    configurationNotifications: {
      publish({ scope, revision }) {
        if (client.status === "ready")
          void client.publish(configurationChannel, `${scope}:${revision}`).catch(() => {});
      },
      subscribe(receive, resubscribed) {
        const subscriber = client.duplicate({
          lazyConnect: true,
          autoResubscribe: false,
          enableOfflineQueue: false,
          connectionName: configurationChannel,
        });
        subscriber.on("error", () => {});
        subscriber.on("ready", () => {
          // Invalidate after acknowledgement to cover saves made while disconnected.
          void subscriber.subscribe(configurationChannel).then(resubscribed, () => {});
        });
        subscriber.on("message", (channel, value) => {
          if (channel !== configurationChannel || value.length > 24) return;
          const [name, revision, extra] = value.split(":");
          const scope = configurationScopes.find((candidate) => candidate === name);
          if (scope && revision && extra === undefined && /^[1-9]\d{0,9}$/.test(revision))
            receive({ scope, revision: Number(revision) });
        });
        void subscriber.connect().catch(() => {});
        return () => subscriber.disconnect();
      },
    },
    ping: () => client.ping(),
    close: async () => {
      await client.quit().catch(() => client.disconnect());
    },
  };
}
