import { afterEach, expect, it, vi } from "vitest";
import type { ConversationClientFrame, ConversationServerFrame } from "@raypx/contracts/api";
import { conversationFixture } from "../../tests/helpers/conversations.js";
import { spaceStreamFixture } from "../../tests/helpers/space-stream.js";
import { ConversationStream } from "./stream.js";
import { LiveReplies } from "@raypx/agents/server";
import { liveReplySchema } from "@raypx/core/conversation";

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of cleanups.splice(0).reverse()) await close();
});

it("streams concurrent group replies with independent Run prefixes and offsets", async () => {
  const f = conversationFixture();
  const live = new LiveReplies();
  const stream = new ConversationStream({ ...f, live, pollMs: 10 });
  await stream.start();
  cleanups.push(() => stream.shutdown());
  const frames: ConversationServerFrame[] = [];
  const close = vi.fn();
  const first = liveReplySchema.parse({
    spaceId: f.spaceId,
    conversationId: f.conversationId,
    runId: "first-run",
    agentId: "first-agent",
    segmentId: "first-segment",
    text: "one",
  });
  const second = liveReplySchema.parse({
    ...first,
    runId: "second-run",
    agentId: "second-agent",
    segmentId: "second-segment",
    text: "two",
  });
  live.set(first);
  live.set(second);
  stream.openFeed(
    "group",
    "member",
    new Headers(),
    { spaceId: f.spaceId, conversationId: f.conversationId, after: 0 },
    {
      async write(frame) {
        frames.push(frame);
      },
      close,
    },
  );
  await expect.poll(() => frames.filter((frame) => frame.type === "reply.prefix").length).toBe(2);
  live.set({ ...first, text: "one!" });
  live.set({ ...second, text: "two?" });
  await expect.poll(() => frames.filter((frame) => frame.type === "reply.delta").length).toBe(2);
  expect(frames.filter((frame) => frame.type === "reply.delta")).toEqual([
    { ...first, type: "reply.delta", offset: 3, text: "!" },
    { ...second, type: "reply.delta", offset: 3, text: "?" },
  ]);
  expect(close).not.toHaveBeenCalled();
});
async function fixture(onWrite?: (frame: ConversationServerFrame) => Promise<void>) {
  const f = conversationFixture();
  const stream = new ConversationStream({ ...f, pollMs: 10 });
  await stream.start();
  cleanups.push(() => stream.shutdown());
  const frames: ConversationServerFrame[] = [];
  const close = vi.fn();
  function subscribe(after = 0, conversationId = f.conversationId, id = "feed") {
    stream.openFeed(
      id,
      "member",
      new Headers(),
      { spaceId: f.spaceId, conversationId, after },
      {
        async write(frame) {
          frames.push(frame);
          await onWrite?.(frame);
        },
        close,
      },
    );
  }
  const sequences = () =>
    frames.flatMap((frame) => (frame.type === "event" ? [frame.entry.event.sequence] : []));
  return { ...f, stream, frames, close, subscribe, sequences };
}

it("waits for HTTP backpressure and repairs missed notifications in order", async () => {
  let pull!: () => void;
  const blocked = new Promise<void>((resolve) => {
    pull = resolve;
  });
  const f = await fixture(async (frame) => {
    if (frame.type === "event" && frame.entry.event.sequence === 1) await blocked;
  });
  try {
    f.append();
    f.append();
    f.subscribe();
    await expect.poll(f.sequences).toEqual([1]);
    f.append(f.conversationId, false);
    expect(f.sequences()).toEqual([1]);
  } finally {
    pull();
  }
  await expect.poll(f.sequences).toEqual([1, 2, 3]);
});

it("forces a snapshot for expired cursors and rejects non-members without reading content", async () => {
  const f = await fixture();
  f.append();
  f.retain(1);
  f.subscribe();
  await expect.poll(() => f.frames.some((frame) => frame.type === "snapshot-required")).toBe(true);
  expect(f.sequences()).toEqual([]);
  await expect.poll(() => f.close.mock.calls).toEqual([[undefined, undefined]]);
  f.close.mockClear();
  f.events.mockClear();
  f.removeMember();
  f.subscribe(1);
  await expect.poll(() => f.close.mock.calls).toEqual([[4003, "Subscription unavailable"]]);
  expect(f.events).not.toHaveBeenCalled();
});

it("rechecks membership and session while an HTTP write waits for a reader", async () => {
  let pull!: () => void;
  const blocked = new Promise<void>((resolve) => {
    pull = resolve;
  });
  const f = await fixture(async (frame) => {
    if (frame.type === "event") await blocked;
  });
  try {
    f.append();
    f.append();
    f.subscribe();
    await expect.poll(f.sequences).toEqual([1]);
    f.removeMember();
    await expect.poll(() => f.close.mock.calls).toEqual([[4003, "Subscription unavailable"]]);
  } finally {
    pull();
  }
  expect(f.sequences()).toEqual([1]);
  const g = await fixture();
  g.subscribe();
  g.signOut();
  await expect.poll(() => g.close.mock.calls).toEqual([[4001, "SESSION_ENDED"]]);
});

it("isolates streams by conversation and resumes from the provided cursor", async () => {
  const f = await fixture();
  f.append();
  f.append();
  f.append(f.secondId);
  f.subscribe(1);
  f.subscribe(0, f.secondId, "second");
  const received = (id: string) =>
    f.frames.flatMap((frame) =>
      frame.type === "event" && frame.entry.event.conversationId === id
        ? [frame.entry.event.sequence]
        : [],
    );
  await expect.poll(() => received(f.conversationId)).toEqual([2]);
  await expect.poll(() => received(f.secondId)).toEqual([1]);
  f.stream.closeFeed("feed");
  f.append();
  f.append(f.secondId);
  await expect.poll(() => received(f.secondId)).toEqual([1, 2]);
  expect(received(f.conversationId)).toEqual([2]);
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
  stream.openFeed(
    "peer",
    "member",
    new Headers(),
    { spaceId: f.spaceId, conversationId: f.conversationId, after: 0 },
    {
      async write(frame) {
        frames.push(frame);
      },
      close,
    },
  );
  await expect.poll(() => f.events.mock.calls.length).toBe(1);
  f.removeMemberActively();
  expect(close).toHaveBeenCalledExactlyOnceWith(4003, "SPACE_MEMBER_REMOVED");
  expect(frames).toEqual([{ type: "ready", version: 1 }]);
});
