import { ManualScheduler } from "@raypx/testing";
import { expect, it } from "vite-plus/test";
import { AcknowledgedStream } from "./acknowledged-stream";

it("commits only the exact stream, sequence and snapshot acknowledgement", async () => {
  const scheduler = new ManualScheduler(),
    stream = new AcknowledgedStream(scheduler);
  const cursor = { streamId: "managed", sequence: 8, snapshotId: "snapshot" };
  const pending = stream.wait(cursor, new AbortController().signal);
  for (const wrong of [
    { ...cursor, streamId: "other" },
    { ...cursor, sequence: 7 },
    { ...cursor, snapshotId: "old" },
    { streamId: "managed", sequence: 8 },
  ])
    expect(stream.acknowledge(wrong)).toBe(false);
  expect(stream.cursor).toBeUndefined();
  expect(stream.acknowledge(cursor)).toBe(true);
  await pending;
  expect(stream.cursor).toEqual(cursor);
  expect(scheduler.pending).toBe(0);
  expect(stream.acknowledge(cursor)).toBe(false);
});

it("an old deadline and acknowledgement cannot settle a replacement exchange", async () => {
  const deadlines: (() => void)[] = [];
  const stream = new AcknowledgedStream({
    timeout: (callback) => {
      deadlines.push(callback);
      // Model a callback that was already queued when cancellation occurred.
      return () => {};
    },
  });
  const oldCursor = { streamId: "observed", sequence: 1 };
  const nextCursor = { streamId: "observed", sequence: 2 };
  const old = stream.wait(oldCursor, new AbortController().signal).catch((error: unknown) => error);
  stream.reset();
  await expect(old).resolves.toMatchObject({ code: "NETWORK_UNAVAILABLE" });
  let settled = false;
  const next = stream.wait(nextCursor, new AbortController().signal).then(() => {
    settled = true;
  });
  deadlines[0]!();
  expect(stream.acknowledge(oldCursor)).toBe(false);
  await Promise.resolve();
  expect(settled).toBe(false);
  stream.acknowledge(nextCursor);
  await next;
  expect(stream.cursor).toEqual(nextCursor);
});

it("cancels a waiter on disconnect and expires unacknowledged exchanges", async () => {
  const scheduler = new ManualScheduler(),
    stream = new AcknowledgedStream(scheduler);
  const connection = new AbortController();
  const cancelled = stream
    .wait({ streamId: "one", sequence: 1 }, connection.signal)
    .catch((error: unknown) => error);
  connection.abort();
  await expect(cancelled).resolves.toMatchObject({ name: "AbortError" });
  expect(scheduler.pending).toBe(0);
  expect(stream.cursor).toBeUndefined();
  const timedOut = stream
    .wait({ streamId: "two", sequence: 2 }, new AbortController().signal)
    .catch((error: unknown) => error);
  scheduler.advance(10_000);
  await expect(timedOut).resolves.toMatchObject({ code: "NETWORK_UNAVAILABLE" });
  expect(stream.cursor).toBeUndefined();
  expect(scheduler.pending).toBe(0);
});

it("cleans up synchronous send failures without committing the cursor", async () => {
  const scheduler = new ManualScheduler(),
    stream = new AcknowledgedStream(scheduler);
  await expect(
    stream.wait({ streamId: "one", sequence: 1 }, new AbortController().signal, () => {
      throw new Error("socket closed");
    }),
  ).rejects.toThrow("socket closed");
  expect(stream.cursor).toBeUndefined();
  expect(scheduler.pending).toBe(0);
});
