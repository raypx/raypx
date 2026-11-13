import { afterEach, expect, it } from "vitest";
import { Hono } from "hono";
import { conversationServerFrameSchema, type ConversationServerFrame } from "@raypx/contracts/api";
import { conversationEventSchema } from "@raypx/core/conversation";
import type { ConversationEventEntry } from "@raypx/agents/server";
import { ConversationStream } from "../../src/conversations/stream.js";
import { createConversationSocketRoutes } from "../../src/conversations/socket.js";
import { conversationFixture } from "../helpers/conversations.js";
import { serveBackend } from "../fixtures/backend-server.js";

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of cleanups.splice(0).reverse()) await close();
});

async function fixture() {
  const state = conversationFixture();
  const stream = new ConversationStream({ ...state, pollMs: 10 });
  await stream.start();
  cleanups.push(() => stream.shutdown());
  const app = new Hono().route(
    "/events",
    createConversationSocketRoutes({
      stream,
      readSession: state.readSession,
      allowedOrigins: ["https://web.example.test"],
    }),
  );
  const server = serveBackend({ app });
  cleanups.push(async () => {
    await server.stop(true);
  });
  const base = { version: 1, spaceId: state.spaceId, conversationId: state.conversationId };
  function append(payload: object) {
    const event = conversationEventSchema.parse({
      spaceId: state.spaceId,
      conversationId: state.conversationId,
      sequence: state.log.length + 1,
      createdAt: new Date().toISOString(),
      ...payload,
    });
    state.publish({ event });
    return event;
  }
  async function connect(after = 0) {
    const url = new URL("/events", server.url);
    url.protocol = "ws:";
    const socket = new WebSocket(url);
    const frames: ConversationServerFrame[] = [];
    const closed: number[] = [];
    socket.addEventListener("message", (message) => {
      frames.push(conversationServerFrameSchema.parse(JSON.parse(String(message.data))));
    });
    socket.addEventListener("close", (event) => closed.push(event.code));
    cleanups.push(async () => {
      socket.close();
    });
    await expect.poll(() => frames[0]).toEqual({ type: "ready", version: 1 });
    socket.send(JSON.stringify({ ...base, type: "subscribe", after }));
    const entries = (): ConversationEventEntry[] =>
      frames.flatMap((frame) => {
        if (frame.type !== "event") return [];
        const { event, message } = frame.entry;
        return [{ event, ...(message ? { message } : {}) }];
      });
    return {
      socket,
      frames,
      closed,
      entries,
      sequences: () => entries().map(({ event }) => event.sequence),
      ack(sequence: number) {
        socket.send(JSON.stringify({ ...base, type: "ack", sequence }));
      },
    };
  }
  return { ...state, append, connect };
}

it("replays interleaved group replies and child activity through exact ACKs on loopback /events", async () => {
  const f = await fixture();
  f.append({
    kind: "run.state",
    runId: "alpha-run",
    agentId: "alpha",
    state: "running",
    failureCode: null,
  });
  f.append({
    kind: "run.state",
    runId: "beta-run",
    agentId: "beta",
    state: "running",
    failureCode: null,
  });
  const first = await f.connect();
  await expect.poll(first.sequences).toEqual([1]);
  // The second Agent and child commit while the first event awaits its ACK.
  f.append({
    kind: "run.state",
    runId: "child-run",
    parentRunId: "alpha-run",
    agentId: "alpha",
    state: "running",
    failureCode: null,
  });
  f.append({
    kind: "tool.started",
    runId: "child-run",
    parentRunId: "alpha-run",
    agentId: "alpha",
    toolCallId: "child-read",
    toolName: "computer_read_file",
    target: "notes.txt",
    argumentSummary: "Read file: notes.txt",
  });
  f.append({
    kind: "run.state",
    runId: "child-run",
    parentRunId: "alpha-run",
    agentId: "alpha",
    state: "succeeded",
    failureCode: null,
  });
  for (let sequence = 1; sequence <= 5; sequence++) {
    await expect.poll(() => first.sequences().at(-1)).toBe(sequence);
    first.ack(sequence);
  }
  expect(first.sequences()).toEqual([1, 2, 3, 4, 5]);
  expect(first.entries()[1]!.event).toMatchObject({ runId: "beta-run", agentId: "beta" });
  expect(first.entries()[2]!.event).toMatchObject({
    runId: "child-run",
    parentRunId: "alpha-run",
    agentId: "alpha",
  });
  expect(first.entries()[3]!.event).toMatchObject({
    kind: "tool.started",
    parentRunId: "alpha-run",
    agentId: "alpha",
  });
  first.socket.close();
  await expect.poll(() => first.closed.length).toBe(1);

  for (const [agentId, runId, text] of [
    ["beta", "beta-run", "Beta reply"],
    ["alpha", "alpha-run", "Alpha reply after child result"],
  ]) {
    const sequence = f.log.length + 1;
    f.append({
      kind: "reply.segment",
      agentId,
      segment: {
        id: `segment-${runId}`,
        spaceId: f.spaceId,
        conversationId: f.conversationId,
        runId,
        agentId,
        sequence,
        text,
        createdAt: new Date().toISOString(),
      },
    });
  }
  const resumed = await f.connect(5);
  await expect.poll(resumed.sequences).toEqual([6]);
  resumed.ack(6);
  await expect.poll(resumed.sequences).toEqual([6, 7]);
  resumed.ack(7);
  expect(
    resumed
      .entries()
      .map(({ event }) => (event.kind === "reply.segment" ? event.segment : undefined)),
  ).toEqual([
    expect.objectContaining({ runId: "beta-run", agentId: "beta", text: "Beta reply" }),
    expect.objectContaining({ runId: "alpha-run", agentId: "alpha" }),
  ]);
  expect(
    f.log.filter(
      ({ event }) => event.kind === "reply.segment" && event.segment.runId === "child-run",
    ),
  ).toEqual([]);
  expect([...first.sequences(), ...resumed.sequences()]).toEqual([1, 2, 3, 4, 5, 6, 7]);
});

it("keeps group child attribution after retention and revokes membership during replay", async () => {
  const f = await fixture();
  f.append({
    kind: "run.state",
    runId: "parent",
    agentId: "alpha",
    state: "running",
    failureCode: null,
  });
  f.retain(1);
  const expired = await f.connect();
  await expect
    .poll(() => expired.frames.find((frame) => frame.type === "snapshot-required"))
    .toEqual({
      type: "snapshot-required",
      spaceId: f.spaceId,
      conversationId: f.conversationId,
      cursor: 1,
    });
  f.append({
    kind: "run.state",
    runId: "child",
    parentRunId: "parent",
    agentId: "beta",
    state: "waiting",
    failureCode: null,
  });
  const current = await f.connect(1);
  await expect.poll(current.sequences).toEqual([2]);
  expect(current.entries()[0]!.event).toMatchObject({
    runId: "child",
    parentRunId: "parent",
    agentId: "beta",
    state: "waiting",
  });
  // A child waiting for approval grants no independent stream admission.
  f.removeMember();
  await expect.poll(() => current.closed).toContain(4003);
});
