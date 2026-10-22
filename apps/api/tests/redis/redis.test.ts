import { afterAll, expect, it } from "vite-plus/test";
import { connectRedis } from "../../server/runtime/redis.js";

const url = process.env.TEST_REDIS_URL;
if (!url) throw new Error("TEST_REDIS_URL is required");
// A unique prefix isolates this run; its keys expire within seconds.
const redis = connectRedis(url, `raypx-test:${crypto.randomUUID()}:`);
afterAll(() => redis.close());

it("stores, expires and atomically consumes Better Auth values", async () => {
  const storage = redis.secondaryStorage;
  await storage.set("session", "value", 60);
  expect(await storage.get("session")).toBe("value");
  expect(await storage.getAndDelete("session")).toBe("value");
  expect(await storage.get("session")).toBeNull();
  await storage.set("short", "value", 1);
  await new Promise((resolve) => setTimeout(resolve, 1500));
  expect(await storage.get("short")).toBeNull();
  await storage.set("deleted", "value");
  await storage.delete("deleted");
  expect(await storage.get("deleted")).toBeNull();
});

it("increments within a fixed window without extending it", async () => {
  const { increment } = redis.secondaryStorage;
  expect(await increment("counter", 1)).toBe(1);
  expect(await increment("counter", 60)).toBe(2);
  await new Promise((resolve) => setTimeout(resolve, 1500));
  expect(await increment("counter", 1)).toBe(1);
});

it("admits exactly the RPC limit under concurrent requests", async () => {
  const results = await Promise.all(
    Array.from({ length: 8 }, () =>
      redis.rateLimit("rpc:user:relay.ticket", { window: 60, max: 3 }),
    ),
  );
  expect(results.filter(Boolean)).toHaveLength(3);
});
