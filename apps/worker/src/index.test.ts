import { describe, expect, it, vi } from "vite-plus/test";
import { runWorker, type OutboxItem, type OutboxRepository } from "./index.js";

describe("durable outbox worker", () => {
  it("acknowledges successful work and stops on abort", async () => {
    const item: OutboxItem = { id: "event-1", type: "cloud.run.queued", payload: {} };
    const controller = new AbortController();
    const acknowledged: string[] = [];
    let claimed = false;
    const outbox: OutboxRepository = {
      claim: async () => {
        if (claimed) {
          controller.abort();
          return [];
        }
        claimed = true;
        return [{ ...item, attempts: 1 }];
      },
      acknowledge: async ({ id, attempts }) => {
        expect(attempts).toBe(1);
        acknowledged.push(id);
      },
      release: async () => undefined,
    };

    await runWorker(
      { outbox, dispatch: async () => undefined, sleep: async () => undefined },
      controller.signal,
    );
    expect(acknowledged).toEqual(["event-1"]);
  });

  it("releases failed work for retry", async () => {
    const released: Parameters<OutboxRepository["release"]>[0][] = [];
    const outbox: OutboxRepository = {
      claim: async () => [{ id: "event-2", type: "cloud.run.queued", payload: {}, attempts: 3 }],
      acknowledge: async () => undefined,
      release: async (lease) => {
        released.push(lease);
      },
    };
    const controller = new AbortController();
    await expect(
      runWorker(
        {
          outbox,
          dispatch: async () => {
            controller.abort();
            throw new Error("failed");
          },
        },
        controller.signal,
      ),
    ).rejects.toThrow("failed");
    expect(released).toEqual([
      { id: "event-2", workerId: "worker-default", attempts: 3, retryDelayMs: 4000 },
    ]);
  });

  it("uses persistent per-item attempts for capped retry delays across Worker restarts", async () => {
    const delays: number[] = [];
    for (const attempts of [1, 2, 3, 4, 5, 6, 7, 99, 2_147_483_647]) {
      const controller = new AbortController();
      const outbox: OutboxRepository = {
        claim: async () => [
          { id: "mail", type: "cloud.notification.created", payload: {}, attempts },
        ],
        acknowledge: async () => {},
        release: async (lease) => {
          expect(lease.attempts).toBe(attempts);
          delays.push(lease.retryDelayMs);
        },
      };
      await runWorker(
        {
          outbox,
          pollMs: 17,
          dispatch: async () => {
            controller.abort();
            throw new Error("Unavailable");
          },
          onError: () => {},
        },
        controller.signal,
      );
    }
    expect(delays).toEqual([1000, 2000, 4000, 8000, 16000, 32000, 60000, 60000, 60000]);
  });

  it("processes healthy work behind a full failed batch without pausing the whole queue", async () => {
    const controller = new AbortController();
    let clock = 0;
    let claims = 0;
    const sleeps: number[] = [];
    const handled: { id: string; time: number }[] = [];
    const failures: string[] = [];
    const events = Array.from({ length: 15 }, (_, index) => ({
      id: index < 10 ? `mail-${index}` : `run-${index}`,
      type: index < 10 ? "cloud.notification.created" : "cloud.run.queued",
      payload: {},
      attempts: 0,
      availableAt: 0,
      createdAt: index,
      leased: false,
      delivered: false,
    }));
    const outbox: OutboxRepository = {
      async claim({ limit }) {
        if (++claims > 4) {
          controller.abort();
          return [];
        }
        return events
          .filter((event) => !event.delivered && !event.leased && event.availableAt <= clock)
          .sort((left, right) => left.createdAt - right.createdAt)
          .slice(0, limit)
          .map((event) => {
            event.leased = true;
            event.attempts++;
            return {
              id: event.id,
              type: event.type,
              payload: event.payload,
              attempts: event.attempts,
            };
          });
      },
      async acknowledge({ id }) {
        events.find((event) => event.id === id)!.delivered = true;
        if (
          events
            .filter((event) => event.type === "cloud.run.queued")
            .every((event) => event.delivered)
        )
          controller.abort();
      },
      async release({ id, retryDelayMs }) {
        const event = events.find((event) => event.id === id)!;
        event.leased = false;
        event.availableAt = clock + (retryDelayMs ?? 0);
      },
    };
    await runWorker(
      {
        outbox,
        batchSize: 10,
        async dispatch(event) {
          if (event.type === "cloud.notification.created") throw new Error("Unavailable");
          handled.push({ id: event.id, time: clock });
        },
        onError: (_error, event) => failures.push(event.id),
        async sleep(ms) {
          sleeps.push(ms);
          clock += ms;
        },
      },
      controller.signal,
    );
    expect(handled).toEqual(
      Array.from({ length: 5 }, (_, index) => ({ id: `run-${index + 10}`, time: 0 })),
    );
    expect(sleeps).toEqual([]);
    expect(failures).toHaveLength(10);
    expect(
      events.slice(0, 10).every((event) => !event.delivered && event.availableAt === 1000),
    ).toBe(true);
  });

  it("propagates retry scheduling failures without acknowledging the item", async () => {
    const acknowledge = vi.fn(async () => {});
    const onError = vi.fn();
    const outbox: OutboxRepository = {
      claim: async () => [
        { id: "mail", type: "cloud.notification.created", payload: {}, attempts: 1 },
      ],
      acknowledge,
      release: async () => {
        throw new Error("Database unavailable");
      },
    };
    await expect(
      runWorker({
        outbox,
        dispatch: async () => {
          throw new Error("Delivery unavailable");
        },
        onError,
      }),
    ).rejects.toThrow("Database unavailable");
    expect(acknowledge).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });

  it("waits for claimed peers before propagating an unhandled delivery failure", async () => {
    const acknowledged: string[] = [];
    const outbox: OutboxRepository = {
      claim: async () => [
        { id: "failed", type: "cloud.notification.created", payload: {}, attempts: 1 },
        { id: "healthy", type: "cloud.run.queued", payload: {}, attempts: 1 },
      ],
      acknowledge: async ({ id }) => {
        acknowledged.push(id);
      },
      release: async () => {},
    };
    await expect(
      runWorker({
        outbox,
        async dispatch(event) {
          if (event.id === "failed") throw new Error("Delivery unavailable");
          await new Promise((resolve) => setTimeout(resolve, 10));
        },
      }),
    ).rejects.toThrow("Delivery unavailable");
    expect(acknowledged).toEqual(["healthy"]);
  });
});
