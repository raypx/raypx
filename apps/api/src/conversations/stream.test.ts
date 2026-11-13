import { afterEach, expect, it, vi } from "vitest";
import type { ConversationClientFrame, ConversationServerFrame } from "@raypx/contracts/api";
import { conversationFixture } from "../../tests/helpers/conversations.js";
import { spaceStreamFixture } from "../../tests/helpers/space-stream.js";
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

it("replays Space events with isolated exact ACKs and resumes from an applied Space cursor", async () => {
  const f = spaceStreamFixture();
  const stream = new ConversationStream({ ...f, pollMs: 60_000 });
  await stream.start();
  cleanups.push(() => stream.shutdown());
  const frames: ConversationServerFrame[] = [];
  const close = vi.fn();
  stream.open("space-peer", "member", new Headers(), {
    send: (frame) => frames.push(frame),
    close,
  });
  f.appendSpace({ kind: "space.renamed", payload: { name: "First" } });
  f.appendSpace({ kind: "space.renamed", payload: { name: "Second" } });
  const send = (frame: ConversationClientFrame) =>
    stream.receive("space-peer", JSON.stringify(frame));
  const selection = { version: 1 as const, spaceId: f.spaceId };
  const ids = () =>
    frames.flatMap((frame) => (frame.type === "space.event" ? [frame.event.id] : []));
  send({ ...selection, type: "space.subscribe", after: 0 });
  await expect.poll(ids).toEqual([1]);
  send({ ...selection, type: "space.ack", sequence: 1 });
  await expect.poll(ids).toEqual([1, 2]);
  send({ ...selection, type: "space.ack", sequence: 2 });
  stream.close("space-peer");
  stream.open("space-peer", "member", new Headers(), {
    send: (frame) => frames.push(frame),
    close,
  });
  f.appendSpace({ kind: "space.renamed", payload: { name: "Third" } }, false);
  send({ ...selection, type: "space.subscribe", after: 2 });
  await expect.poll(ids).toEqual([1, 2, 3]);
  send({ ...selection, type: "space.ack", sequence: 3 });
  expect(close).not.toHaveBeenCalled();
});

it("actively closes a conversation-only peer on membership removal without a poll or next delivery", async () => {
  const f = spaceStreamFixture();
  const stream = new ConversationStream({ ...f, pollMs: 60_000 });
  await stream.start();
  cleanups.push(() => stream.shutdown());
  const frames: ConversationServerFrame[] = [];
  const close = vi.fn();
  stream.open("peer", "member", new Headers(), { send: (frame) => frames.push(frame), close });
  stream.receive(
    "peer",
    JSON.stringify({
      version: 1,
      type: "subscribe",
      spaceId: f.spaceId,
      conversationId: f.conversationId,
      after: 0,
    }),
  );
  await expect.poll(() => f.events.mock.calls.length).toBe(1);
  f.removeMemberActively();
  expect(close).toHaveBeenCalledExactlyOnceWith(4003, "Subscription unavailable");
  expect(frames).toEqual([{ type: "ready", version: 1 }]);
});
