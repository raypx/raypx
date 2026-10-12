import { describe, expect, it } from "vite-plus/test";
import { createOrderedSession, type OrderedTransport } from "./ordered-session.js";

type Event = { resourceId: string; sequence: number; text: string };
type Snapshot = { resourceId: string; cursor: number; events: Event[]; done: boolean };
const snapshot = (cursor = 0): Snapshot => ({ resourceId: "a", cursor, events: [], done: false });
const event = (sequence: number): Event => ({ resourceId: "a", sequence, text: String(sequence) });
function blocked(signal: AbortSignal) {
  return new Promise<void>((resolve) => {
    if (signal.aborted) resolve();
    else signal.addEventListener("abort", () => resolve(), { once: true });
  });
}
function session(transport: OrderedTransport<Snapshot, Event>) {
  return createOrderedSession({
    transport,
    retryDelayMs: 1,
    validateSnapshot: (s) => {
      if (s.resourceId !== "a") throw { code: "RESOURCE_SCOPE_MISMATCH" };
      return s;
    },
    validateEvent: (e) => {
      if (e.resourceId !== "a") throw { code: "RESOURCE_SCOPE_MISMATCH" };
      return e;
    },
    reduce: (s, e) => ({ ...s, cursor: e.sequence, events: [...s.events, e] }),
    isTerminal: (s) => s.done,
  });
}

describe("ordered resource sessions", () => {
  it("constructs without requests and provides stable snapshots", () => {
    let reads = 0;
    const s = session({
      snapshot: async () => {
        reads++;
        return snapshot();
      },
      stream: async () => (async function* () {})(),
    });
    expect(reads).toBe(0);
    expect(s.getSnapshot()).toBe(s.getSnapshot());
    s.dispose();
  });
  it("joins snapshot and subscription without duplicating the boundary event", async () => {
    const cursors: number[] = [];
    const s = session({
      snapshot: async () => snapshot(1),
      stream: async (cursor, signal) => {
        cursors.push(cursor);
        return (async function* () {
          yield event(1);
          yield event(2);
          yield event(2);
          await blocked(signal);
        })();
      },
    });
    s.reconnect();
    await expect.poll(() => s.getSnapshot().data?.cursor).toBe(2);
    expect(cursors).toEqual([1]);
    expect(s.getSnapshot().data?.events.map((e) => e.sequence)).toEqual([2]);
    s.dispose();
  });
  it("recovers a gap by reading a new projection before resuming", async () => {
    let reads = 0;
    const cursors: number[] = [];
    const s = session({
      snapshot: async () => snapshot(reads++ ? 2 : 0),
      stream: async (cursor, signal) => {
        cursors.push(cursor);
        return (async function* () {
          yield event(3);
          await blocked(signal);
        })();
      },
    });
    s.reconnect();
    await expect.poll(() => s.getSnapshot().data?.cursor).toBe(3);
    expect(cursors).toEqual([0, 2]);
    s.dispose();
  });
  it("aborts the prior generation and rejects its late snapshot", async () => {
    let resolve!: (s: Snapshot) => void;
    let reads = 0;
    const pending = new Promise<Snapshot>((done) => {
      resolve = done;
    });
    const s = session({
      snapshot: async () => (++reads === 1 ? pending : { ...snapshot(2), done: true }),
      stream: async () => (async function* () {})(),
    });
    s.reconnect();
    s.dispose();
    s.reconnect();
    await expect.poll(() => s.getSnapshot().data?.cursor).toBe(2);
    resolve(snapshot(100));
    await pending;
    await Promise.resolve();
    expect(s.getSnapshot().data?.cursor).toBe(2);
    s.dispose();
  });
  it("fails closed on another resource and stops reconnecting", async () => {
    let reads = 0;
    const s = session({
      snapshot: async () => {
        reads++;
        return { ...snapshot(), resourceId: "b" };
      },
      stream: async () => (async function* () {})(),
    });
    s.reconnect();
    await expect.poll(() => s.getSnapshot().connection).toBe("failed");
    expect(reads).toBe(1);
    expect(s.getSnapshot().data).toBeNull();
    s.dispose();
  });
  it("never turns connection EOF into successful execution", async () => {
    const s = session({
      snapshot: async () => snapshot(),
      stream: async () => (async function* () {})(),
    });
    s.reconnect();
    await expect.poll(() => s.getSnapshot().error?.code).toBe("STREAM_UNAVAILABLE");
    expect(s.getSnapshot().data?.done).toBe(false);
    s.dispose();
  });
  it("refreshes command facts without replacing an active SSE subscription", async () => {
    let reads = 0;
    let streams = 0;
    const s = session({
      snapshot: async () => {
        reads++;
        return snapshot();
      },
      stream: async (_cursor, signal) => {
        streams++;
        return (async function* () {
          await blocked(signal);
        })();
      },
    });
    s.reconnect();
    await expect.poll(() => streams).toBe(1);
    s.refresh();
    s.refresh();
    await expect.poll(() => reads).toBe(2);
    expect(streams).toBe(1);
    expect(s.getSnapshot().connection).toBe("connected");
    s.dispose();
  });
  it("marks a terminal event settled only after its durable final projection arrives", async () => {
    let complete!: (value: Snapshot) => void;
    const final = new Promise<Snapshot>((resolve) => {
      complete = resolve;
    });
    let reads = 0;
    const s = createOrderedSession({
      transport: {
        snapshot: async () => (++reads === 1 ? snapshot() : final),
        stream: async () =>
          (async function* () {
            yield event(1);
          })(),
      },
      validateSnapshot: (value) => value,
      validateEvent: (value) => value,
      reduce: (value, next) => ({ ...value, done: true, cursor: next.sequence, events: [next] }),
      isTerminal: (value) => value.done,
      refreshTerminal: true,
    });
    s.reconnect();
    await expect.poll(() => s.getSnapshot().data?.done).toBe(true);
    expect(s.getSnapshot().settled).toBe(false);
    complete({ ...snapshot(1), done: true });
    await expect.poll(() => s.getSnapshot().settled).toBe(true);
    expect(reads).toBe(2);
    s.dispose();
  });
});
