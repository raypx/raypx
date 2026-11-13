import { afterEach, expect, it, vi } from "vitest";
import type { ConversationClientFrame, ConversationServerFrame } from "@raypx/contracts/api";
import { conversationFixture } from "../../tests/helpers/conversations.js";
import { ConversationStream } from "./stream.js";

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of cleanups.splice(0).reverse()) await close();
});
async function fixture() {
  const f = conversationFixture();
  const stream = new ConversationStream({ ...f, pollMs: 10 });
  await stream.start();
  cleanups.push(() => stream.shutdown());
  const frames: ConversationServerFrame[] = [];
  const close = vi.fn();
  stream.open("socket", "member", new Headers(), { send: (frame) => frames.push(frame), close });
  function send(frame: ConversationClientFrame) {
    stream.receive("socket", JSON.stringify(frame));
  }
  const base = { version: 1 as const, spaceId: f.spaceId, conversationId: f.conversationId };
  function ack(sequence: number) {
    send({ ...base, type: "ack", sequence });
  }
  function subscribe(after = 0) {
    send({ ...base, type: "subscribe", after });
  }
  const sequences = () =>
    frames.flatMap((frame) => (frame.type === "event" ? [frame.entry.event.sequence] : []));
  return { ...f, stream, frames, close, send, base, ack, subscribe, sequences };
}
it("bounds in-flight delivery, preserves order during replay, and repairs missed notifications", async () => {
  const f = await fixture();
  f.append();
  f.append();
  f.subscribe();
  await expect.poll(f.sequences).toEqual([1]);
  f.append(f.conversationId, false);
  f.ack(1);
  await expect.poll(f.sequences).toEqual([1, 2]);
  f.ack(2);
  await expect.poll(f.sequences).toEqual([1, 2, 3]);
  f.ack(3);
  await expect.poll(() => f.events.mock.calls.some((call) => call[2] === 3)).toBe(true);
  expect(f.sequences()).toEqual([1, 2, 3]);
});
it("forces a snapshot for expired cursors and rejects non-members without reading content", async () => {
  const f = await fixture();
  f.append();
  f.retain(1);
  f.subscribe();
  await expect.poll(() => f.frames.some((frame) => frame.type === "snapshot-required")).toBe(true);
  expect(f.sequences()).toEqual([]);
  f.events.mockClear();
  f.removeMember();
  f.subscribe(1);
  await expect.poll(() => f.close.mock.calls).toEqual([[4003, "Subscription unavailable"]]);
  expect(f.events).not.toHaveBeenCalled();
});
it("rechecks removal and session expiry while waiting for ACKs and rejects forged ACKs", async () => {
  const f = await fixture();
  f.append();
  f.subscribe();
  await expect.poll(f.sequences).toEqual([1]);
  f.removeMember();
  await expect.poll(() => f.close.mock.calls).toEqual([[4003, "Subscription unavailable"]]);
  const g = await fixture();
  g.subscribe();
  g.signOut();
  await expect.poll(() => g.close.mock.calls).toEqual([[4001, "Authentication required"]]);
  const h = await fixture();
  h.append();
  h.subscribe();
  await expect.poll(h.sequences).toEqual([1]);
  h.ack(2);
  expect(h.close).toHaveBeenCalledWith(4000, "Invalid frame");
});
it("isolates subscription cursors and cancels obsolete subscriptions", async () => {
  const f = await fixture();
  f.append();
  f.append(f.secondId);
  f.subscribe();
  f.send({ ...f.base, type: "subscribe", conversationId: f.secondId, after: 0 });
  await expect.poll(() => f.frames.filter((frame) => frame.type === "event").length).toBe(2);
  f.send({ ...f.base, type: "unsubscribe" });
  f.append();
  f.send({ ...f.base, type: "ack", conversationId: f.secondId, sequence: 1 });
  expect(f.close).not.toHaveBeenCalled();
  f.stream.close("socket");
});

it("resumes a replacement connection from the applied cursor without replaying acknowledged events", async () => {
  const f = await fixture();
  f.append();
  f.append();
  f.subscribe();
  await expect.poll(f.sequences).toEqual([1]);
  f.ack(1);
  await expect.poll(f.sequences).toEqual([1, 2]);
  f.stream.close("socket");
  f.append(f.conversationId, false);
  const frames: ConversationServerFrame[] = [];
  f.stream.open("replacement", "member", new Headers(), {
    send: (frame) => frames.push(frame),
    close: f.close,
  });
  f.stream.receive("replacement", JSON.stringify({ ...f.base, type: "subscribe", after: 1 }));
  const sequences = () =>
    frames.flatMap((frame) => (frame.type === "event" ? [frame.entry.event.sequence] : []));
  await expect.poll(sequences).toEqual([2]);
  f.stream.receive("replacement", JSON.stringify({ ...f.base, type: "ack", sequence: 2 }));
  await expect.poll(sequences).toEqual([2, 3]);
  f.stream.receive("replacement", JSON.stringify({ ...f.base, type: "ack", sequence: 3 }));
});
