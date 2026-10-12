import { Redis } from "ioredis";

export interface Cache {
  /** Resolve and store a missing JSON value; TTL is in seconds, without resolver locking. */
  remember<T>(key: string, ttlSeconds: number, resolver: () => T | Promise<T>): Promise<T>;
}

export interface SecondaryStorage {
  get(key: string): Promise<string | null>;
  getAndDelete(key: string): Promise<string | null>;
  increment(key: string, ttl: number): Promise<number>;
  set(key: string, value: string, ttl?: number): Promise<void>;
  delete(key: string): Promise<void>;
}

export interface RedisClientLike {
  connect?(): Promise<void>;
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ...args: Array<string | number>): Promise<string | null>;
  del(...keys: string[]): Promise<number>;

  eval(script: string, numberOfKeys: number, ...args: Array<string | number>): Promise<unknown>;

  ping(): Promise<string>;
  quit(): Promise<string>;
}

export interface RedisCacheOptions {
  url?: string;
  prefix?: string;
  connectTimeoutMs?: number;
  operationTimeoutMs?: number;
  maxRetriesPerRequest?: number;
  client?: RedisClientLike;
}

export interface RedisCacheConnection {
  cache: Cache;
  secondaryStorage: SecondaryStorage;
  close(): Promise<void>;
}

const GET_AND_DELETE_SCRIPT = `
-- Verification tokens must be consumed exactly once.
local value = redis.call("GET", KEYS[1])
-- Redis Lua represents a missing GET as false. Under native RESP3 mapping,
-- returning that value would become a JavaScript boolean instead of null.
if not value then return nil end
redis.call("DEL", KEYS[1])
return value
`;

const INCREMENT_WITH_TTL_SCRIPT = `
-- Better Auth rate limits use a fixed window: later increments do not renew TTL.
local existed = redis.call("EXISTS", KEYS[1])
local value = redis.call("INCRBY", KEYS[1], ARGV[1])
if existed == 0 then redis.call("EXPIRE", KEYS[1], ARGV[2]) end
return value
`;

function assertTtl(ttlSeconds: number): void {
  if (!Number.isInteger(ttlSeconds) || ttlSeconds < 0) {
    throw new RangeError("Cache TTL must be a non-negative integer number of seconds.");
  }
}

function serialize(value: unknown): string {
  let encoded: string | undefined;
  try {
    encoded = JSON.stringify(value);
  } catch {
    throw new TypeError("Cache values must be JSON-serializable.");
  }
  if (encoded === undefined) throw new TypeError("Cache values must be JSON-serializable.");
  return encoded;
}

function nullableStringReply(value: unknown): string | null {
  if (value === null || typeof value === "string") return value;
  throw new TypeError("Redis returned an unexpected string reply shape.");
}

function numberReply(value: unknown): number {
  if (typeof value === "number") return value;
  throw new TypeError("Redis returned an unexpected number reply shape.");
}

export class RedisCache implements Cache {
  private readonly storage: SecondaryStorage;

  constructor(client: RedisClientLike, prefix: string) {
    this.storage = createRedisSecondaryStorage(client, prefix);
  }

  async remember<T>(key: string, ttlSeconds: number, resolver: () => T | Promise<T>): Promise<T> {
    assertTtl(ttlSeconds);
    const raw = await this.storage.get(key);
    const existing: T | null = raw === null ? null : JSON.parse(raw);
    if (existing !== null) return existing;
    const value = await resolver();
    if (ttlSeconds === 0) await this.storage.delete(key);
    else await this.storage.set(key, serialize(value), ttlSeconds);
    return value;
  }
}

export function createRedisSecondaryStorage(
  client: RedisClientLike,
  prefix = "voidmix:better-auth",
): SecondaryStorage {
  // Better Auth stores already-serialized strings, so this adapter must bypass
  // the generic JSON facade while sharing the same Redis connection.
  const fullKey = (key: string) => `${prefix}:${key}`;
  return {
    get: (key) => client.get(fullKey(key)),
    async getAndDelete(key) {
      return nullableStringReply(await client.eval(GET_AND_DELETE_SCRIPT, 1, fullKey(key)));
    },
    async increment(key, ttl) {
      assertTtl(ttl);
      const result = await client.eval(INCREMENT_WITH_TTL_SCRIPT, 1, fullKey(key), 1, ttl);
      return numberReply(result);
    },
    async set(key, value, ttl) {
      if (ttl !== undefined) {
        assertTtl(ttl);
        if (ttl === 0) {
          await client.del(fullKey(key));
          return;
        }
        await client.set(fullKey(key), value, "EX", ttl);
        return;
      }
      await client.set(fullKey(key), value);
    },
    async delete(key) {
      await client.del(fullKey(key));
    },
  };
}

export async function createRedisCache(options: RedisCacheOptions): Promise<RedisCacheConnection> {
  if (!options.client && !options.url) throw new Error("Redis URL is required.");
  const ownedClient = options.client
    ? undefined
    : new Redis<"resp3">(options.url!, {
        protocol: 3,
        replyMapping: "resp3",
        connectTimeout: options.connectTimeoutMs ?? 10_000,
        commandTimeout: options.operationTimeoutMs ?? 5_000,
        maxRetriesPerRequest: options.maxRetriesPerRequest ?? 1,
        enableOfflineQueue: false,
        lazyConnect: true,
      });
  // Command/connect promises carry errors to callers. Avoid ioredis emitting
  // arbitrary connection errors directly to stderr outside the host logger.
  ownedClient?.on("error", () => {});
  const client = options.client ?? (ownedClient as unknown as RedisClientLike);
  try {
    // lazyConnect lets factory creation fail deterministically at this point,
    // before the API starts accepting requests.
    if (ownedClient) await client.connect?.();
    await client.ping();
  } catch (error) {
    // QUIT can fail while disconnected and leave automatic retry timers alive.
    // There is no accepted connection to drain after factory initialization fails.
    ownedClient?.disconnect();
    throw error;
  }

  const prefix = options.prefix?.trim() || "voidmix";
  return {
    cache: new RedisCache(client, `${prefix}:cache`),
    secondaryStorage: createRedisSecondaryStorage(client, `${prefix}:better-auth`),
    async close() {
      if (ownedClient) {
        try {
          await ownedClient.quit();
        } finally {
          ownedClient.disconnect();
        }
      }
    },
  };
}

export type { RedisOptions } from "ioredis";
