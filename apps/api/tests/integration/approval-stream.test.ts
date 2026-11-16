import { afterEach, expect, it } from "vitest";
import { Hono } from "hono";
import { createApiClient } from "@raypx/client/api";
import { ConversationRunner } from "@raypx/agents/server";
import { connectConversationFeed } from "../helpers/conversation-feed.js";
import { ConversationStream } from "../../src/conversations/stream.js";
import { createConversationSocketRoutes } from "../../src/conversations/socket.js";
import { serveBackend } from "../fixtures/backend-server.js";
import { agentToolsFixture } from "../helpers/agent-tools.js";
import { createApiApp } from "../helpers/app.js";

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of cleanups.splice(0).reverse()) await close();
});

it("recovers a waiting Run, delivers steering and replays its approval answer on /events after handover", async () => {
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
    const feed = connectConversationFeed(server.url, { ...selection, after });
    cleanups.push(async () => feed.close());
    await expect.poll(() => feed.frames[0]).toEqual({ version: 1, type: "ready" });
    return feed;
  }
  const first = await connect(0);
  await client.conversations.send({
    ...selection,
    message: { idempotencyKey: "approval-feed", text: "Write a file" },
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
  const pinnedComputer = f.computer()!;
  expect(f.runs[0]).toMatchObject({
    computerId: pinnedComputer.id,
    computerGeneration: pinnedComputer.generation,
  });
  first.close();
  await f.conversations.send(f.scope, f.conversationId, {
    idempotencyKey: "waiting-steering",
    text: "Mention the file name in your reply",
  });
  await f.runner.close();
  const replacement = new ConversationRunner(
    f.repository,
    f.models,
    undefined,
    undefined,
    {
      tools: f.tools,
      approvals: f.agentApprovals,
    },
    { ownerId: "replacement-worker", scanIntervalMs: 10, maxAttempts: 1 },
  );
  cleanups.push(() => replacement.close());
  await replacement.startWorker(f.fanout);
  const [pending] = await client.approvals.pending({ spaceId: f.spaceId });
  await client.approvals.answer({
    spaceId: f.spaceId,
    requestId: pending!.id,
    decision: "approved",
  });
  await expect.poll(() => f.calls.length).toBe(2);
  expect(f.calls[1]!.input.continuation).toContainEqual(
    expect.objectContaining({
      role: "user",
      content: "Mention the file name in your reply",
    }),
  );
  f.calls[1]!.complete("File written");
  await expect.poll(() => f.runs[0]!.state).toBe("succeeded");
  expect(f.runs).toHaveLength(1);
  // Check storage and transport separately so failures identify a log gap,
  // duplicate delivery, or an incorrect reconnect cursor.
  expect(f.log.map(({ event }) => event.sequence)).toEqual(
    Array.from({ length: f.log.length }, (_, index) => index + 1),
  );
  const expected = f.log.filter(({ event }) => event.sequence > cursor).map(({ event }) => event);
  const resumed = await connect(cursor);
  await expect.poll(() => resumed.events()).toEqual(expected);
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
