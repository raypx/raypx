import { expect, it, vi } from "vitest";
import { AcknowledgedStream } from "./acknowledged-stream.js";

it("advances only after an exact ACK, even when it arrives synchronously during send", async () => {
  const stream = new AcknowledgedStream();
  const cursor = { streamId: "conversation", sequence: 1 };
  stream.reset({ ...cursor, sequence: 0 });
  const waiting = stream.wait(cursor, new AbortController().signal);
  expect(stream.acknowledge({ ...cursor, streamId: "another" })).toBe(false);
  expect(stream.acknowledge({ ...cursor, sequence: 2 })).toBe(false);
  expect(stream.cursor?.sequence).toBe(0);
  expect(stream.acknowledge(cursor)).toBe(true);
  await waiting;
  expect(stream.cursor).toEqual(cursor);
  expect(stream.acknowledge(cursor)).toBe(false);
  await stream.wait({ ...cursor, sequence: 2 }, new AbortController().signal, () =>
    stream.acknowledge({ ...cursor, sequence: 2 }),
  );
  expect(stream.cursor?.sequence).toBe(2);
});
it("cancels pending work without committing and bounds acknowledgement waits", async () => {
  const cancel = vi.fn();
  let expire = () => {};
  const stream = new AcknowledgedStream({
    timeout(callback) {
      expire = callback;
      return cancel;
    },
  });
  const cursor = { streamId: "conversation", sequence: 1 };
  const controller = new AbortController();
  const waiting = stream.wait(cursor, controller.signal);
  expect(() => stream.wait(cursor, controller.signal)).toThrow("already pending");
  controller.abort(new Error("Disconnected"));
  await expect(waiting).rejects.toThrow("Disconnected");
  expect(stream.cursor).toBeUndefined();
  const timed = stream.wait(cursor, new AbortController().signal);
  expire();
  await expect(timed).rejects.toThrow("timed out");
  expect(cancel).toHaveBeenCalledTimes(2);
});
