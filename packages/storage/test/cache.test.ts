import { afterEach, expect, test, vi } from "vite-plus/test";
import { createCache } from "../src/cache.js";
import { getStorage, closeStorage, invalidate } from "../src/index.js";

const schema = {
  parse(value: unknown): string {
    if (typeof value !== "string") throw new Error("Expected a string");
    return value;
  },
};
afterEach(async () => {
  await closeStorage();
});
function setup(now = () => Date.now(), namespace = "users") {
  const storage = getStorage({ memory: true });
  return { storage, cache: createCache({ storage, namespace, schema, now }) };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

test("coalesces concurrent misses and validates persisted data", async () => {
  const { storage, cache } = setup();
  const value = deferred<string>();
  const load = vi.fn<() => Promise<string>>(() => value.promise);
  const results = Array.from({ length: 20 }, () => cache.getOrSet("42", 60, load));
  await vi.waitFor(() => expect(load).toHaveBeenCalledOnce());
  value.resolve("Alice");
  expect(await Promise.all(results)).toEqual(Array.from({ length: 20 }, () => "Alice"));
  expect(await cache.get("42")).toEqual({ hit: true, value: "Alice" });
  await storage.setItem("users:42", { version: 1, value: 123, expiresAt: Date.now() + 60_000 });
  expect(await cache.get("42")).toEqual({ hit: false });
});

test("TTL expires at the exact boundary and failed loaders can retry", async () => {
  let now = 100;
  const { cache } = setup(() => now);
  await cache.getOrSet("42", 1, () => "Alice");
  now = 1099;
  expect((await cache.get("42")).hit).toBe(true);
  now = 1100;
  expect((await cache.get("42")).hit).toBe(false);
  await expect(
    cache.getOrSet("42", 1, () => {
      throw new Error("Loader failed");
    }),
  ).rejects.toThrow("Loader failed");
  expect(await cache.getOrSet("42", 1, () => "Bob")).toBe("Bob");
});

test("invalidation prevents a pending loader from repopulating stale data", async () => {
  const { cache } = setup();
  const value = deferred<string>();
  const load = vi.fn<() => Promise<string>>(() => value.promise);
  const old = cache.getOrSet("42", 60, load);
  await vi.waitFor(() => expect(load).toHaveBeenCalledOnce());
  await cache.invalidate("42");
  expect(await cache.getOrSet("42", 60, () => "Fresh")).toBe("Fresh");
  value.resolve("Stale");
  expect(await old).toBe("Stale");
  expect(await cache.get("42")).toEqual({ hit: true, value: "Fresh" });
});

test("invalidation waits for an already-started write before removing it", async () => {
  const { storage, cache } = setup();
  const release = deferred<void>();
  const original = storage.setItem.bind(storage);
  const writing = vi.spyOn(storage, "setItem").mockImplementation(async (...args) => {
    await release.promise;
    await original(...args);
  });
  const loaded = cache.getOrSet("42", 60, () => "Stale");
  await vi.waitFor(() => expect(writing).toHaveBeenCalledOnce());
  const invalidated = cache.invalidate("42");
  release.resolve();
  await Promise.all([loaded, invalidated]);
  expect(await cache.get("42")).toEqual({ hit: false });
});

test("clear respects namespaces and invalidates pending work", async () => {
  const { storage, cache } = setup();
  const other = createCache({ storage, namespace: "settings", schema });
  await cache.getOrSet("42", 60, () => "Alice");
  await other.getOrSet("theme", 60, () => "dark");
  const value = deferred<string>();
  const load = vi.fn<() => Promise<string>>(() => value.promise);
  const pending = cache.getOrSet("43", 60, load);
  await vi.waitFor(() => expect(load).toHaveBeenCalledOnce());
  await cache.clear();
  value.resolve("Bob");
  await pending;
  expect(await cache.get("42")).toEqual({ hit: false });
  expect(await cache.get("43")).toEqual({ hit: false });
  expect(await other.get("theme")).toEqual({ hit: true, value: "dark" });
});

test("driver failures do not prevent fresh business results; invalid loader data fails", async () => {
  const { storage, cache } = setup();
  vi.spyOn(storage, "getItem").mockRejectedValue(new Error("Driver unavailable"));
  vi.spyOn(storage, "setItem").mockRejectedValue(new Error("Driver unavailable"));
  expect(await cache.getOrSet("42", 60, () => "Alice")).toBe("Alice");
  await expect(cache.getOrSet("43", 60, () => 123 as unknown as string)).rejects.toThrow(
    "Expected a string",
  );
});

test("legacy wildcard invalidation matches keys instead of treating a glob as a prefix", async () => {
  const { storage } = setup();
  await storage.setItem("users:1", "Alice");
  await storage.setItem("users:2", "Bob");
  await storage.setItem("settings:theme", "dark");
  await invalidate("users:*");
  expect(await storage.getItem("users:1")).toBeNull();
  expect(await storage.getItem("users:2")).toBeNull();
  expect(await storage.getItem("settings:theme")).toBe("dark");
});

test("driver disposal is idempotent and supports a new explicit initialization", async () => {
  const first = getStorage({ memory: true });
  const disposed = vi.spyOn(first, "dispose");
  await Promise.all([closeStorage(), closeStorage()]);
  expect(disposed).toHaveBeenCalledOnce();
  expect(getStorage({ memory: true })).not.toBe(first);
});

test("failed invalidation and clear bypass stale persisted entries", async () => {
  const { storage, cache } = setup();
  await cache.getOrSet("42", 60, () => "Old");
  vi.spyOn(storage, "removeItem").mockRejectedValueOnce(new Error("Driver unavailable"));
  await cache.invalidate("42");
  expect(await cache.get("42")).toEqual({ hit: false });
  expect(await cache.getOrSet("42", 60, () => "Fresh")).toBe("Fresh");
  const other = createCache({ storage, namespace: "settings", schema });
  await other.getOrSet("theme", 60, () => "old-theme");
  vi.spyOn(storage, "getKeys").mockRejectedValueOnce(new Error("Driver unavailable"));
  await other.clear();
  expect(await other.getOrSet("theme", 60, () => "new-theme")).toBe("new-theme");
});
