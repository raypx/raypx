import { afterEach, expect, it, vi } from "vitest";
import { createReadinessCheck } from "./readiness.js";

afterEach(() => vi.useRealTimers());

it("shares dependency probes within one runtime and checks relay state on each read", async () => {
  vi.useFakeTimers({ toFake: ["performance", "setTimeout", "clearTimeout"] });
  const initial = Promise.withResolvers<void>();
  const database = vi.fn(async () => {}).mockReturnValueOnce(initial.promise);
  const redis = vi
    .fn(async () => {})
    .mockImplementationOnce(() => {
      throw new Error("Unavailable");
    });
  const relay = vi.fn(async () => {});
  const read = createReadinessCheck({ database, redis, relay });

  const callers = [read(), read()];
  initial.resolve();
  await expect(Promise.all(callers)).resolves.toEqual([
    { database: "ok", redis: "unavailable", relay: "ok" },
    { database: "ok", redis: "unavailable", relay: "ok" },
  ]);
  relay.mockRejectedValueOnce(new Error("Disconnected"));
  await expect(read()).resolves.toEqual({
    database: "ok",
    redis: "unavailable",
    relay: "unavailable",
  });
  expect(database).toHaveBeenCalledOnce();
  expect(redis).toHaveBeenCalledOnce();
  expect(relay).toHaveBeenCalledTimes(2);

  await expect(createReadinessCheck({ redis })()).resolves.toEqual({ redis: "ok" });
  await vi.advanceTimersByTimeAsync(1_000);
  await expect(read()).resolves.toEqual({ database: "ok", redis: "ok", relay: "ok" });
  expect(database).toHaveBeenCalledTimes(2);
  expect(redis).toHaveBeenCalledTimes(3);
});

it("releases timed-out callers while keeping a single driver operation in flight", async () => {
  vi.useFakeTimers({ toFake: ["performance", "setTimeout", "clearTimeout"] });
  const delayed = Promise.withResolvers<void>();
  const retry = Promise.withResolvers<void>();
  const database = vi.fn(() => retry.promise).mockReturnValueOnce(delayed.promise);
  const read = createReadinessCheck({ database });

  const callers = [read(), read()];
  await vi.advanceTimersByTimeAsync(3_000);
  await expect(Promise.all(callers)).resolves.toEqual([
    { database: "unavailable" },
    { database: "unavailable" },
  ]);
  await vi.advanceTimersByTimeAsync(10_000);
  await expect(read()).resolves.toEqual({ database: "unavailable" });
  expect(database).toHaveBeenCalledOnce();

  delayed.resolve();
  await vi.advanceTimersByTimeAsync(0);
  const recovered = read();
  await vi.advanceTimersByTimeAsync(0);
  expect(database).toHaveBeenCalledTimes(2);
  retry.resolve();
  await expect(recovered).resolves.toEqual({ database: "ok" });
  expect(vi.getTimerCount()).toBe(0);
});
