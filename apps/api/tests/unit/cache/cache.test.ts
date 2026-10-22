import { expect, it, vi } from "vite-plus/test";
import { createCache } from "../../../server/cache/cache.js";
import { createMemoryStore } from "../../../server/cache/memory.js";
import { createTieredStore } from "../../../server/cache/tiered.js";
import type { CacheStore } from "../../../server/cache/types.js";

const asName = (value: unknown) => {
  if (typeof value !== "object" || value === null || !("name" in value)) throw new Error("invalid");
  return value as { name: string };
};

it("expires memory entries and evicts the least recently used beyond its bound", async () => {
  let time = 0;
  const store = createMemoryStore({ maxEntries: 2, now: () => time });
  await store.set("a", "1", 100);
  await store.set("b", "2", 100);
  await store.get("a");
  await store.set("c", "3", 100);
  expect(await store.get("b")).toBeNull();
  expect(await store.get("a")).toBe("1");
  time = 100;
  expect(await store.get("a")).toBeNull();
  await store.set("d", "4", 0);
  expect(await store.get("d")).toBeNull();
});

it("shares concurrent loads, returns copies and never stores failures", async () => {
  const cache = createCache(createMemoryStore());
  const load = vi.fn(async () => ({ name: "loaded" }));
  const [first, second] = await Promise.all([
    cache.getOrLoad("key", { ttlMs: 1000, parse: asName }, load),
    cache.getOrLoad("key", { ttlMs: 1000, parse: asName }, load),
  ]);
  expect(load).toHaveBeenCalledOnce();
  first.name = "mutated";
  expect(second.name).toBe("loaded");
  expect((await cache.get("key", asName))?.name).toBe("loaded");

  const failing = vi.fn(async (): Promise<{ name: string }> => {
    throw new Error("offline");
  });
  await expect(cache.getOrLoad("other", { ttlMs: 1000, parse: asName }, failing)).rejects.toThrow(
    "offline",
  );
  expect(await cache.get("other", asName)).toBeUndefined();
});

it("lets an explicit write supersede a load already in flight", async () => {
  const cache = createCache(createMemoryStore());
  let finish!: (value: { name: string }) => void;
  const pending = cache.getOrLoad(
    "key",
    { ttlMs: 1000, parse: asName },
    () => new Promise((resolve) => (finish = resolve)),
  );
  await cache.set("key", { name: "saved" }, 1000);
  finish({ name: "stale" });
  expect((await pending).name).toBe("stale");
  expect((await cache.get("key", asName))?.name).toBe("saved");
});

it("serves repeated reads from the near store and survives a far-store outage", async () => {
  let time = 0;
  const near = createMemoryStore({ now: () => time });
  const backing = createMemoryStore({ now: () => time });
  let down = false;
  const far: CacheStore = {
    get: vi.fn(async (key: string) => {
      if (down) throw new Error("down");
      return backing.get(key);
    }),
    set: vi.fn(async (key: string, value: string, ttlMs: number) => {
      if (down) throw new Error("down");
      await backing.set(key, value, ttlMs);
    }),
    delete: vi.fn(async (key: string) => backing.delete(key)),
  };
  const store = createTieredStore(near, far, { nearTtlMs: 100 });
  await backing.set("shared", "1", 1000);
  expect(await store.get("shared")).toBe("1");
  expect(await store.get("shared")).toBe("1");
  expect(far.get).toHaveBeenCalledOnce();

  // Writes reach both stores; the near copy never outlives its own bound.
  await store.set("written", "2", 1000);
  expect(await backing.get("written")).toBe("2");
  time = 100;
  expect(await near.get("written")).toBeNull();

  const cache = createCache(store);
  const load = vi.fn(async () => ({ name: "db" }));
  down = true;
  await cache.getOrLoad("key", { ttlMs: 1000, parse: asName }, load);
  await cache.getOrLoad("key", { ttlMs: 1000, parse: asName }, load);
  expect(load).toHaveBeenCalledOnce();

  await store.delete("shared");
  expect(await near.get("shared")).toBeNull();
  expect(await backing.get("shared")).toBeNull();
});

it("treats store failures and invalid values as misses", async () => {
  const broken: CacheStore = {
    get: async () => {
      throw new Error("down");
    },
    set: async () => {
      throw new Error("down");
    },
    delete: async () => {
      throw new Error("down");
    },
  };
  const cache = createCache(broken);
  expect(
    await cache.getOrLoad("key", { ttlMs: 1000, parse: asName }, async () => ({ name: "db" })),
  ).toEqual({ name: "db" });
  await expect(cache.delete("key")).resolves.toBeUndefined();

  const store = createMemoryStore();
  await store.set("cache:bad", '{"other":1}', 1000);
  await store.set("cache:torn", "{", 1000);
  const valid = createCache(store);
  expect(await valid.get("bad", asName)).toBeUndefined();
  expect(await valid.get("torn", asName)).toBeUndefined();
});
