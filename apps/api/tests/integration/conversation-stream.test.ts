import { afterEach, expect, it } from "vitest";
import { replyFixture } from "../helpers/replies.js";
import type { LiveReplies } from "@raypx/agents/server";
import { Hono } from "hono";
import { conversationServerFrameSchema, type ConversationServerFrame } from "@raypx/contracts/api";
import { ConversationStream } from "../../src/conversations/stream.js";
import { createConversationSocketRoutes } from "../../src/conversations/socket.js";
import { conversationFixture } from "../helpers/conversations.js";
import { serveBackend } from "../fixtures/backend-server.js";

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of cleanups.splice(0).reverse()) await close();
});
async function fixture(
  f: ReturnType<typeof conversationFixture> & { live?: LiveReplies } = conversationFixture(),
) {
  const stream = new ConversationStream({ ...f, pollMs: 10 });
  await stream.start();
  cleanups.push(() => stream.shutdown());
  const app = new Hono().route(
    "/events",
    createConversationSocketRoutes({
      stream,
      readSession: f.readSession,
      allowedOrigins: ["https://web.example.test"],
    }),
  );
  const server = serveBackend({ app });
  cleanups.push(async () => {
    await server.stop(true);
  });
  async function connect(after = 0, autoAck = false) {
    const url = new URL("/events", server.url);
    url.protocol = "ws:";
    const socket = new WebSocket(url);
    const frames: ConversationServerFrame[] = [];
    const closed: number[] = [];
    socket.addEventListener("message", (event) => {
      const frame = conversationServerFrameSchema.parse(JSON.parse(String(event.data)));
      frames.push(frame);
      if (autoAck && frame.type === "event")
        socket.send(
          JSON.stringify({
            version: 1,
            spaceId: f.spaceId,
            conversationId: f.conversationId,
            type: "ack",
            sequence: frame.entry.event.sequence,
          }),
        );
    });
    socket.addEventListener("close", (event) => closed.push(event.code));
    cleanups.push(async () => {
      socket.close();
    });
    await expect.poll(() => frames[0]).toEqual({ type: "ready", version: 1 });
    const base = { version: 1, spaceId: f.spaceId, conversationId: f.conversationId };
    socket.send(JSON.stringify({ ...base, type: "subscribe", after }));
    const sequences = () =>
      frames.flatMap((frame) => (frame.type === "event" ? [frame.entry.event.sequence] : []));
    return {
      socket,
      frames,
      closed,
      sequences,
      ack(sequence: number) {
        socket.send(JSON.stringify({ ...base, type: "ack", sequence }));
      },
    };
  }
  return { ...f, server, connect };
}
it("replays in order through concurrent commits and reconnects from the applied cursor without gaps or duplicates", async () => {
  const f = await fixture();
  f.append();
  f.append();
  const first = await f.connect();
  await expect.poll(first.sequences).toEqual([1]);
  // Commit while replay is waiting for the client's application ACK, losing the hint.
  f.append(f.conversationId, false);
  first.ack(1);
  await expect.poll(first.sequences).toEqual([1, 2]);
  first.ack(2);
  await expect.poll(first.sequences).toEqual([1, 2, 3]);
  first.ack(3);
  await expect.poll(() => f.events.mock.calls.some((call) => call[2] === 3)).toBe(true);
  first.socket.close();
  await expect.poll(() => first.closed.length).toBe(1);
  f.append(f.conversationId, false);
  const resumed = await f.connect(3);
  await expect.poll(resumed.sequences).toEqual([4]);
  resumed.ack(4);
  f.append();
  await expect.poll(resumed.sequences).toEqual([4, 5]);
  resumed.ack(5);
});
it("asks for a snapshot when the entire retained prefix has expired", async () => {
  const f = await fixture();
  f.append();
  f.retain(1);
  const old = await f.connect(0);
  await expect
    .poll(() => old.frames.find((frame) => frame.type === "snapshot-required"))
    .toEqual({
      type: "snapshot-required",
      spaceId: f.spaceId,
      conversationId: f.conversationId,
      cursor: 1,
    });
  expect(old.sequences()).toEqual([]);
  const current = await f.connect(1);
  f.append();
  await expect.poll(current.sequences).toEqual([2]);
  current.ack(2);
});
it("rejects a non-member and closes an already-open subscription when membership is removed", async () => {
  const f = await fixture();
  f.append();
  const member = await f.connect();
  await expect.poll(member.sequences).toEqual([1]);
  f.removeMember();
  await expect.poll(() => member.closed).toContain(4003);
  f.events.mockClear();
  const refused = await f.connect();
  await expect.poll(() => refused.closed).toContain(4003);
  expect(refused.sequences()).toEqual([]);
  expect(f.events).not.toHaveBeenCalled();
});
it("requires a live session and checks Origin before upgrading on the existing listener", async () => {
  const f = await fixture();
  expect(
    (
      await fetch(new URL("/events", f.server.url), {
        headers: { upgrade: "websocket", origin: "https://evil.example.test" },
      })
    ).status,
  ).toBe(403);
  f.signOut();
  expect(
    (await fetch(new URL("/events", f.server.url), { headers: { upgrade: "websocket" } })).status,
  ).toBe(401);
});

it("streams a fixture reply on the loopback socket and a mid-segment subscriber converges", async () => {
  const reply = replyFixture();
  cleanups.push(() => reply.runner.close());
  const f = await fixture(reply);
  const first = await f.connect(0, true);
  await reply.conversations.send(reply.scope, reply.conversationId, {
    text: "Private input",
    idempotencyKey: "socket-reply",
  });
  await expect.poll(() => reply.calls.length).toBe(1);
  await expect.poll(() => first.frames.some((frame) => frame.type === "reply.prefix")).toBe(true);
  reply.calls[0]!.delta("Hello");
  const text = (frames: ConversationServerFrame[]) => {
    let result = "";
    for (const frame of frames) {
      if (frame.type === "reply.prefix") result = frame.text;
      if (frame.type === "reply.delta") {
        if (frame.offset !== result.length) throw new Error("Noncontiguous live delta");
        result += frame.text;
      }
      if (frame.type === "event" && frame.entry.event.kind === "reply.segment")
        result = frame.entry.event.segment.text;
    }
    return result;
  };
  await expect.poll(() => text(first.frames)).toBe("Hello");
  const middle = await f.connect(0, true);
  await expect.poll(() => text(middle.frames)).toBe("Hello");
  reply.calls[0]!.delta(" world");
  await expect.poll(() => text(middle.frames)).toBe("Hello world");
  reply.calls[0]!.complete();
  for (const peer of [first, middle]) {
    await expect
      .poll(
        () =>
          peer.frames.filter(
            (frame) => frame.type === "event" && frame.entry.event.kind === "reply.segment",
          ).length,
      )
      .toBe(1);
    expect(text(peer.frames)).toBe("Hello world");
  }
  expect(first.frames.some((frame) => frame.type === "reply.delta")).toBe(true);
  expect(reply.segments).toHaveLength(1);
});
