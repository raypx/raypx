import { afterAll, expect, it, vi } from "vitest";
import { Redis } from "ioredis";
import { connectRedis } from "../../src/runtime/redis.js";

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

it("notifies a second API process of each configuration scope and reports reconnects", async () => {
  const prefix = `raypx-test:${crypto.randomUUID()}:`;
  const subscriber = connectRedis(url, prefix);
  const publisher = connectRedis(url, prefix);
  const control = new Redis(url);
  const receive = vi.fn();
  const resubscribed = vi.fn();
  const unsubscribe = subscriber.configNotifications.subscribe(receive, resubscribed);
  try {
    await publisher.ping();
    await vi.waitFor(() => expect(resubscribed).toHaveBeenCalledTimes(1));
    await redis.ping();
    redis.configNotifications.publish({ scope: "site", revision: 99 });
    publisher.configNotifications.publish({ scope: "site", revision: 1 });
    publisher.configNotifications.publish({ scope: "storage", revision: 2 });
    await vi.waitFor(() =>
      expect(receive.mock.calls).toEqual([
        [{ scope: "site", revision: 1 }],
        [{ scope: "storage", revision: 2 }],
      ]),
    );
    const clients = await control.client("LIST", "TYPE", "PUBSUB");
    if (typeof clients !== "string") throw new Error("Redis returned an invalid client list");
    const client = clients.split("\n").find((line) => line.includes(` name=${prefix}`));
    const id = /^id=(\d+) /.exec(client ?? "")?.[1];
    if (!id) throw new Error("Configuration test subscriber is missing");
    expect(await control.client("KILL", "ID", id)).toBe(1);
    await vi.waitFor(() => expect(resubscribed).toHaveBeenCalledTimes(2));
    publisher.configNotifications.publish({ scope: "resend", revision: 3 });
    await vi.waitFor(() =>
      expect(receive).toHaveBeenLastCalledWith({ scope: "resend", revision: 3 }),
    );
  } finally {
    unsubscribe();
    control.disconnect();
    await Promise.all([subscriber.close(), publisher.close()]);
  }
});
