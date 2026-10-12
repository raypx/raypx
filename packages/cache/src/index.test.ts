import { describe, expect, it, vi } from "vite-plus/test";

import { RedisCache, createRedisSecondaryStorage, type RedisClientLike } from "./index.js";

class FakeRedis implements RedisClientLike {
  readonly values = new Map<string, string>();
  readonly expirations = new Map<string, number>();
  ping = vi.fn(async () => "PONG");
  quit = vi.fn(async () => "OK");

  async get(key: string): Promise<string | null> {
    return this.values.get(key) ?? null;
  }

  async set(key: string, value: string, ...args: Array<string | number>): Promise<string | null> {
    this.values.set(key, value);
    const exIndex = args.indexOf("EX");
    if (exIndex >= 0) this.expirations.set(key, Number(args[exIndex + 1]));
    return "OK";
  }

  async del(...keys: string[]): Promise<number> {
    let count = 0;
    for (const key of keys) {
      if (this.values.delete(key)) count += 1;
      this.expirations.delete(key);
    }
    return count;
  }

  async incrby(key: string, amount: number): Promise<number> {
    const value = Number(this.values.get(key) ?? "0") + amount;
    this.values.set(key, String(value));
    return value;
  }

  async eval(
    script: string,
    _numberOfKeys: number,
    ...args: Array<string | number>
  ): Promise<unknown> {
    const key = String(args[0]);
    if (script.includes('redis.call("GET", KEYS[1])')) {
      const value = this.values.get(key) ?? null;
      if (value === null) return script.includes("return nil") ? null : false;
      await this.del(key);
      return value;
    }
    const amount = Number(args[1]);
    const ttl = Number(args[2]);
    const existed = this.values.has(key);
    const value = await this.incrby(key, amount);
    if (!existed) this.expirations.set(key, ttl);
    return value;
  }
}

describe("RedisCache", () => {
  it("serializes cached values with a TTL", async () => {
    const redis = new FakeRedis();
    const cache = new RedisCache(redis, "voidmix:cache");

    await expect(cache.remember("user", 60, () => ({ id: "1" }))).resolves.toEqual({ id: "1" });
    await expect(cache.remember("user", 60, () => null)).resolves.toEqual({ id: "1" });
    expect(redis.expirations.get("voidmix:cache:user")).toBe(60);
  });

  it("restores nested JSON-compatible objects, arrays, and null values", async () => {
    const redis = new FakeRedis();
    const cache = new RedisCache(redis, "voidmix:cache");
    const value = {
      profile: { name: "Ada", roles: ["owner", "admin"] },
      flags: [true, false, null],
      count: 3,
    };

    await cache.remember("nested", 60, () => value);
    await cache.remember("null", 60, () => null);

    await expect(cache.remember("nested", 60, () => null)).resolves.toEqual(value);
    await expect(cache.remember("null", 60, () => null)).resolves.toBeNull();
    expect(redis.values.get("voidmix:cache:nested")).toBe(JSON.stringify(value));
    expect(redis.values.get("voidmix:cache:null")).toBe("null");
  });

  it("rejects values that JSON cannot represent", async () => {
    const redis = new FakeRedis();
    const cache = new RedisCache(redis, "voidmix:cache");

    await expect(cache.remember("undefined", 60, () => undefined)).rejects.toThrow(
      "JSON-serializable",
    );
    await expect(cache.remember("bigint", 60, () => BigInt(1))).rejects.toThrow(
      "JSON-serializable",
    );
    const circular: { self?: unknown } = {};
    circular.self = circular;
    await expect(cache.remember("circular", 60, () => circular)).rejects.toThrow(
      "JSON-serializable",
    );
  });

  it("caches remember results", async () => {
    const redis = new FakeRedis();
    const cache = new RedisCache(redis, "voidmix:cache");
    const resolver = vi.fn(async () => "computed");

    await expect(cache.remember("remember", 30, resolver)).resolves.toBe("computed");
    await expect(cache.remember("remember", 30, resolver)).resolves.toBe("computed");
    expect(resolver).toHaveBeenCalledOnce();
  });

  it("implements Better Auth raw-string secondary storage semantics", async () => {
    const redis = new FakeRedis();
    const storage = createRedisSecondaryStorage(redis, "voidmix:better-auth");

    await storage.set("token", "raw", 90);
    await expect(storage.get("token")).resolves.toBe("raw");
    await expect(storage.getAndDelete("token")).resolves.toBe("raw");
    await expect(storage.getAndDelete("token")).resolves.toBeNull();
    await expect(storage.get("token")).resolves.toBeNull();
    await expect(storage.increment("rate", 45)).resolves.toBe(1);
    await expect(storage.increment("rate", 45)).resolves.toBe(2);
    expect(redis.expirations.get("voidmix:better-auth:rate")).toBe(45);
  });

  it("propagates Redis failures", async () => {
    const redis = new FakeRedis();
    redis.get = vi.fn(async () => {
      throw new Error("redis unavailable");
    });
    const cache = new RedisCache(redis, "voidmix:cache");

    await expect(cache.remember("key", 60, () => "unused")).rejects.toThrow("redis unavailable");
  });

  it("rejects unexpected native RESP3 script replies", async () => {
    const redis = new FakeRedis();
    redis.eval = vi.fn(async () => false);
    const storage = createRedisSecondaryStorage(redis, "voidmix:better-auth");

    await expect(storage.getAndDelete("key")).rejects.toThrow("unexpected string reply shape");
    await expect(storage.increment("key", 30)).rejects.toThrow("unexpected number reply shape");
  });
});
