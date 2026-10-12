import { describe, expect, it } from "vite-plus/test";
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
        return [item];
      },
      acknowledge: async ({ id }) => {
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
    const released: string[] = [];
    const outbox: OutboxRepository = {
      claim: async () => [{ id: "event-2", type: "cloud.run.queued", payload: {} }],
      acknowledge: async () => undefined,
      release: async ({ id }) => {
        released.push(id);
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
    expect(released).toEqual(["event-2"]);
  });

  it("backs off handled delivery failures rather than immediately reclaiming them", async () => {
    const controller = new AbortController();
    const delays: number[] = [];
    const outbox: OutboxRepository = {
      claim: async () => [{ id: "mail", type: "cloud.notification.created", payload: {} }],
      acknowledge: async () => {},
      release: async () => {},
    };
    await runWorker(
      {
        outbox,
        pollMs: 1000,
        dispatch: async () => {
          throw new Error("Unavailable");
        },
        onError: () => {},
        sleep: async (ms) => {
          delays.push(ms);
          if (delays.length === 3) controller.abort();
        },
      },
      controller.signal,
    );
    expect(delays).toEqual([1000, 2000, 4000]);
  });
});
