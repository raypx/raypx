import { expect, it, vi } from "vite-plus/test";
import { createManagedDrain, type ManagedSink } from "../../src/managed.js";
import type { SafeEvent } from "../../src/safe.js";

const policy = { fields: ["operation", "error"] };
const makeEvent = (operation: string) => ({ event: { operation, password: "private-password" } });
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

it("projects before buffering, preserves order and coalesces overlapping flushes", async () => {
  const gate = deferred();
  const events: SafeEvent[] = [];
  const drain = createManagedDrain({
    policy,
    sink: async ({ event }) => {
      await gate.promise;
      events.push(event);
    },
  });
  drain(makeEvent("first"));
  drain(makeEvent("second"));
  const flushing = drain.flush();
  expect(drain.flush()).toBe(flushing);
  expect(events).toEqual([]);
  expect(drain.stats().pending).toBe(2);
  gate.resolve();
  await flushing;
  expect(events.map((event) => event.operation)).toEqual(["first", "second"]);
  expect(JSON.stringify(events)).not.toContain("private-password");
  expect(drain.stats()).toMatchObject({ delivered: 2, pending: 0, failed: 0 });
  await drain.close();
});

it("bounds queued plus active events and reports overflow once without throwing on emit", async () => {
  const gate = deferred();
  const sink = vi.fn(async () => {
    await gate.promise;
  });
  const drain = createManagedDrain({ policy, sink, maxPending: 2 });
  drain(makeEvent("first"));
  await Promise.resolve();
  drain(makeEvent("second"));
  expect(() => drain(makeEvent("overflow"))).not.toThrow();
  expect(drain.stats()).toMatchObject({ pending: 2, dropped: 1 });
  gate.resolve();
  await expect(drain.flush()).rejects.toThrow("Log drain delivery failed");
  await drain.flush();
  expect(sink).toHaveBeenCalledTimes(2);
  await drain.close();
});

it("bounds concurrency across flushes and continues after a failed sink without retry", async () => {
  const gate = deferred();
  let active = 0,
    peak = 0;
  const sink = vi.fn(async ({ event }: { event: SafeEvent }) => {
    peak = Math.max(peak, ++active);
    await gate.promise;
    active--;
    if (event.operation === "first") throw new Error("private-sink-details");
  });
  const drain = createManagedDrain({ policy, sink, concurrency: 2 });
  drain(makeEvent("first"));
  drain(makeEvent("second"));
  drain(makeEvent("third"));
  const flushing = drain.flush();
  await Promise.resolve();
  expect(peak).toBe(2);
  gate.resolve();
  await expect(flushing).rejects.toThrow(/^Log drain delivery failed$/);
  expect(sink).toHaveBeenCalledTimes(3);
  expect(drain.stats()).toMatchObject({ pending: 0, delivered: 2, failed: 1 });
  await drain.close();
});

it("closes once, blocks new admission immediately and closes a sink even after flush failure", async () => {
  const close = vi.fn(async () => {});
  const sink: ManagedSink = Object.assign(() => {}, {
    flush: vi.fn(async () => {
      throw new Error("private-flush-error");
    }),
    close,
  });
  const drain = createManagedDrain({ policy, sink });
  drain(makeEvent("first"));
  const closing = drain.close();
  expect(drain.close()).toBe(closing);
  drain(makeEvent("after-close"));
  await expect(closing).rejects.toThrow("Log drain delivery failed");
  expect(close).toHaveBeenCalledTimes(1);
  expect(drain.stats()).toMatchObject({ closed: true, delivered: 1, dropped: 1 });
});

it("bounds the shutdown wait without pretending to cancel an uncancellable sink", async () => {
  const gate = deferred();
  const close = vi.fn(async () => {});
  const drain = createManagedDrain({
    policy,
    closeTimeoutMs: 10,
    sink: Object.assign(
      async () => {
        await gate.promise;
      },
      { close },
    ),
  });
  drain(makeEvent("slow"));
  await expect(drain.close()).rejects.toThrow("Log drain close timed out");
  expect(drain.stats()).toMatchObject({ pending: 1, closed: true });
  gate.resolve();
  await vi.waitFor(() => expect(close).toHaveBeenCalledTimes(1));
});

it("keeps independently owned drains isolated and never reads a context accessor", async () => {
  const first: SafeEvent[] = [],
    second: SafeEvent[] = [];
  const a = createManagedDrain({
    policy,
    sink: ({ event }) => {
      first.push(event);
    },
  });
  const b = createManagedDrain({
    policy,
    sink: ({ event }) => {
      second.push(event);
    },
  });
  const accessor = vi.fn(() => {
    throw new Error("private-getter");
  });
  a(Object.defineProperty({}, "event", { get: accessor }) as { event: unknown });
  a(makeEvent("a"));
  b(makeEvent("b"));
  await Promise.all([a.close(), b.close()]);
  expect(accessor).not.toHaveBeenCalled();
  expect(first.at(-1)?.operation).toBe("a");
  expect(second.map((event) => event.operation)).toEqual(["b"]);
});

it.each(["maxPending", "concurrency", "closeTimeoutMs"] as const)("validates %s", (field) => {
  expect(() => createManagedDrain({ policy, sink: () => {}, [field]: 0 })).toThrow(RangeError);
});
