import { afterEach, expect, it } from "vitest";
import { Hono } from "hono";
import { createApiClient } from "@raypx/client/api";
import { conversationServerFrameSchema, type ConversationServerFrame } from "@raypx/contracts/api";
import { ConversationStream } from "../../src/conversations/stream.js";
import { createConversationSocketRoutes } from "../../src/conversations/socket.js";
import { serveBackend } from "../fixtures/backend-server.js";
import { agentToolsFixture } from "../helpers/agent-tools.js";
import { createApiApp } from "../helpers/app.js";

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of cleanups.splice(0).reverse()) await close();
});

it("delivers approval cards and waiting/resumed states on /events and replays the answer after reconnect", async () => {
  const f = agentToolsFixture();
  cleanups.push(() => f.runner.close());
  const stream = new ConversationStream({ ...f, pollMs: 10 });
  await stream.start();
  cleanups.push(() => stream.shutdown());
  const origins = ["https://web.example.test"];
  const app = new Hono()
    .route(
      "/events",
      createConversationSocketRoutes({
        stream,
        readSession: f.readSession,
        allowedOrigins: origins,
      }),
    )
    .route("/", createApiApp({ ...f, allowedOrigins: origins }));
  const server = serveBackend({ app });
  cleanups.push(async () => {
    await server.stop(true);
  });
  const client = createApiClient({ baseUrl: String(server.url), headers: { origin: origins[0]! } });
  const selection = { spaceId: f.spaceId, conversationId: f.conversationId };
  async function connect(after: number) {
    const url = new URL("/events", server.url);
    url.protocol = "ws:";
    const socket = new WebSocket(url);
    const frames: ConversationServerFrame[] = [];
    const closed: number[] = [];
    socket.addEventListener("message", (event) => {
      const frame = conversationServerFrameSchema.parse(JSON.parse(String(event.data)));
      frames.push(frame);
      if (frame.type === "event")
        socket.send(
          JSON.stringify({
            version: 1,
            ...selection,
            type: "ack",
            sequence: frame.entry.event.sequence,
          }),
        );
    });
    socket.addEventListener("close", (event) => closed.push(event.code));
    cleanups.push(async () => {
      socket.close();
    });
    await expect.poll(() => frames[0]).toEqual({ version: 1, type: "ready" });
    socket.send(JSON.stringify({ version: 1, ...selection, type: "subscribe", after }));
    const events = () =>
      frames.flatMap((frame) => (frame.type === "event" ? [frame.entry.event] : []));
    return { socket, frames, closed, events };
  }
  const first = await connect(0);
  await client.conversations.send({
    ...selection,
    message: { idempotencyKey: "approval-socket", text: "Write a file" },
  });
  await expect.poll(() => f.calls.length).toBe(1);
  f.calls[0]!.toolCalls([
    {
      type: "toolCall",
      id: "write",
      name: "computer_write_file",
      arguments: { path: "note.txt", content: "Private file content never belongs in cards" },
    },
  ]);
  await expect
    .poll(() =>
      first.events().some((event) => event.kind === "run.state" && event.state === "waiting"),
    )
    .toBe(true);
  const created = first.events().find((event) => event.kind === "card.created");
  expect(created).toMatchObject({
    toolName: "computer_write_file",
    memberAccountId: "member",
    target: "note.txt",
  });
  expect(JSON.stringify(first.frames)).not.toContain("Private file content");
  const cursor = first.events().at(-1)!.sequence;
  first.socket.close();
  await expect.poll(() => first.closed.length).toBe(1);
  const [pending] = await client.approvals.pending({ spaceId: f.spaceId });
  await client.approvals.answer({
    spaceId: f.spaceId,
    requestId: pending!.id,
    decision: "approved",
  });
  await expect.poll(() => f.calls.length).toBe(2);
  f.calls[1]!.complete("File written");
  await expect.poll(() => f.runs[0]!.state).toBe("succeeded");
  const resumed = await connect(cursor);
  await expect
    .poll(() =>
      resumed.events().some((event) => event.kind === "run.state" && event.state === "succeeded"),
    )
    .toBe(true);
  expect(resumed.events().filter((event) => event.kind === "card.resolved")).toMatchObject([
    { toolName: "computer_write_file", outcome: "approved", answeredByAccountId: "member" },
  ]);
  expect(resumed.events().some((event) => event.kind === "card.created")).toBe(false);
  expect(resumed.events().map((event) => event.sequence)).toEqual(
    Array.from({ length: resumed.events().length }, (_, index) => cursor + index + 1),
  );
  expect(JSON.stringify(resumed.frames)).not.toContain("Private file content");
});
