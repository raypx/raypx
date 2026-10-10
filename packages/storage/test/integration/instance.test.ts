import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test, vi } from "vite-plus/test";
import {
  closeStorage,
  createCache,
  createStorageInstance,
  getStorage,
  type Storage,
} from "../../src/index.js";

const instances: Storage[] = [];
const directories: string[] = [];

function owned(config: Parameters<typeof createStorageInstance>[0]): Storage {
  const storage = createStorageInstance(config);
  instances.push(storage);
  return storage;
}

afterEach(async () => {
  await Promise.all(instances.splice(0).map((storage) => storage.dispose()));
  await closeStorage();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  await Promise.all(
    directories.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});

test("independent instances and the compatibility singleton do not share memory or disposal", async () => {
  const first = owned({ memory: true });
  const second = owned({ memory: true });
  const compatibility = getStorage({ memory: true });
  await first.setItem("key", "first");
  await second.setItem("key", "second");
  await compatibility.setItem("key", "compatibility");
  expect(first).not.toBe(second);
  expect(first).not.toBe(compatibility);
  expect(await first.getItem("key")).toBe("first");
  expect(await second.getItem("key")).toBe("second");
  await first.dispose();
  expect(await second.getItem("key")).toBe("second");
  expect(await compatibility.getItem("key")).toBe("compatibility");
  await closeStorage();
  expect(await second.getItem("key")).toBe("second");
});

test("concurrent and repeated disposal calls release the underlying driver exactly once", async () => {
  const storage = owned({ memory: true });
  await storage.setItem("key", "value");
  const dispose = vi.spyOn(storage.getMount().driver, "dispose");
  const first = storage.dispose();
  const second = storage.dispose();
  expect(first).toBe(second);
  await Promise.all([first, second]);
  await storage.dispose();
  expect(dispose).toHaveBeenCalledOnce();
  expect(await storage.getItem("key")).toBeNull();
});

test("explicit filesystem configuration ignores NODE_ENV=test and ambient Redis", async () => {
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("REDIS_URL", "redis://ambient.invalid:6379");
  const directory = await mkdtemp(join(tmpdir(), "raypx-owned-storage-"));
  directories.push(directory);
  const first = owned({ fsBase: directory, memory: false });
  expect(first.getMount().driver.name).toBe("fs");
  await first.setItem("persisted", { version: 1 });
  await first.dispose();
  const reopened = owned({ fsBase: directory });
  expect(await reopened.getItem("persisted")).toEqual({ version: 1 });
});

test("explicit Redis configuration wins over filesystem and ambient test defaults without connecting", async () => {
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("REDIS_URL", "redis://ambient.invalid:6379");
  const url = "redis://explicit.invalid:6379";
  const storage = owned({ redis: url, fsBase: "unused-filesystem", memory: false });
  expect(storage.getMount().driver.name).toBe("redis");
  expect(storage.getMount().driver.options).toMatchObject({ url, lazyConnect: true });
});

test("explicit memory takes precedence over the other configured drivers", async () => {
  const storage = owned({
    memory: true,
    redis: "redis://unused.invalid:6379",
    fsBase: "unused-filesystem",
  });
  expect(storage.getMount().driver.name).toBe("memory");
  await storage.setItem("key", "value");
  expect(await storage.getItem("key")).toBe("value");
});

test("independent storage instances can be injected into validated caches", async () => {
  const schema = {
    parse(value: unknown): string {
      if (typeof value !== "string") throw new Error("Expected a string");
      return value;
    },
  };
  const first = createCache({ storage: owned({ memory: true }), namespace: "shared", schema });
  const second = createCache({ storage: owned({ memory: true }), namespace: "shared", schema });
  await first.getOrSet("key", 60, () => "first");
  await second.getOrSet("key", 60, () => "second");
  expect(await first.get("key")).toEqual({ hit: true, value: "first" });
  expect(await second.get("key")).toEqual({ hit: true, value: "second" });
  await first.clear();
  expect(await second.get("key")).toEqual({ hit: true, value: "second" });
});

test("compatibility configuration still uses test memory and locks the first instance until close", async () => {
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("REDIS_URL", "redis://ambient.invalid:6379");
  const first = getStorage({ memory: false, redis: "redis://explicit.invalid:6379" });
  expect(first.getMount().driver.name).toBe("memory");
  expect(getStorage({ fsBase: "unused-filesystem" })).toBe(first);
  await closeStorage();
  vi.stubEnv("NODE_ENV", "production");
  const explicit = getStorage({ redis: "redis://explicit.invalid:6379" });
  expect(explicit.getMount().driver.options).toMatchObject({
    url: "redis://explicit.invalid:6379",
  });
  await closeStorage();
  const ambient = getStorage();
  expect(ambient.getMount().driver.options).toMatchObject({ url: "redis://ambient.invalid:6379" });
});
