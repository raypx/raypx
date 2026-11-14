import { afterAll, beforeAll, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { connectDatabase, migrateDatabase } from "@raypx/database";
import {
  conversationEvents,
  conversationRuns,
  conversationReplySegments,
  spaces,
  user,
} from "@raypx/database/schema";
import {
  createAgentsRepository,
  createConversationsRepository,
} from "@raypx/agents/server/postgres";
import { ConversationRunner } from "@raypx/agents/server";
import { createSpaceAccess } from "@raypx/spaces/server/postgres";
import type { SpaceScope } from "@raypx/spaces/server";
import { createApiClient } from "@raypx/client/api";
import { createApiApp } from "../../helpers/app.js";
import { modelFixture } from "../../helpers/model.js";
import { createDeploymentModels } from "../../../src/conversations/models.js";

const url = process.env.TEST_DATABASE_URL;
if (!url || !/_test(?:_[a-z0-9]+)?$/.test(new URL(url).pathname))
  throw new Error("A newly created disposable *_test or *_test_<lane> database is required");
const connection = connectDatabase(url);
const second = connectDatabase(url);
const access = createSpaceAccess(connection.db);
const owner = `reply-${crypto.randomUUID()}`;
let scope: SpaceScope, foreign: SpaceScope;
const owned: string[] = [];
const model = modelFixture();
const repository = createConversationsRepository(connection.db);
const runner = new ConversationRunner(repository, model.models, undefined, undefined, undefined, {
  maxAttempts: 1,
});
const claim = {
  ownerId: "api-reply-fixture",
  leaseMs: 15_000,
  timeoutMs: 300_000,
  backupMarginMs: 30_000,
};
const agents = createAgentsRepository(connection.db);
const app = createApiApp({
  spaces: access,
  agents,
  conversations: runner.conversations,
  allowedOrigins: ["https://web.example.test"],
  readSession: async () => ({
    user: {
      id: owner,
      name: "Fixture",
      email: `${owner}@example.test`,
      emailVerified: true,
      role: "member",
    },
    session: { id: "fixture", userId: owner, expiresAt: new Date(Date.now() + 60_000) },
  }),
});
const client = createApiClient({
  baseUrl: "https://api.example.test",
  headers: { origin: "https://web.example.test" },
  fetch: async (input, init) => app.fetch(new Request(input, init)),
});
beforeAll(async () => {
  await migrateDatabase(url);
  await connection.db
    .insert(user)
    .values({ id: owner, name: "Fixture", email: `${owner}@example.test` });
  for (const name of ["A", "B"]) owned.push((await access.create(owner, { name })).space.id);
  scope = await access.resolve(owner, owned[0]! as SpaceScope["spaceId"]);
  foreign = await access.resolve(owner, owned[1]! as SpaceScope["spaceId"]);
});
afterAll(async () => {
  try {
    await runner.close();
    for (const id of owned) await connection.db.delete(spaces).where(eq(spaces.id, id));
    await connection.db.delete(user).where(eq(user.id, owner));
  } finally {
    await Promise.all([connection.close(), second.close()]);
  }
});
const definition = {
  name: "Helper",
  instructions: "Private instructions",
  model: { modelId: "fixture" },
};
it("atomically persists message, queued Run and gapless events; retries create one Run and rollback creates nothing", async () => {
  const { conversation } = await agents.create(scope, definition);
  const input = { idempotencyKey: "transaction", text: "Private input" };
  const sent = await repository.send(scope, conversation.id, input);
  expect(await repository.send(scope, conversation.id, input)).toEqual(sent);
  const snapshot = await repository.snapshot(scope, conversation.id);
  expect(snapshot).toMatchObject({
    cursor: 2,
    messages: [sent],
    runs: [
      { state: "queued", trigger: "message", memberAccountId: owner, model: definition.model },
    ],
  });
  const failing = createConversationsRepository(connection.db, async () => {
    throw new Error("rollback");
  });
  await expect(
    failing.send(scope, conversation.id, { ...input, idempotencyKey: "rollback" }),
  ).rejects.toThrow("rollback");
  expect(await repository.snapshot(scope, conversation.id)).toEqual(snapshot);
  const claimed = await Promise.all([
    repository.claimNext(scope, conversation.id, claim),
    createConversationsRepository(second.db).claimNext(scope, conversation.id, {
      ...claim,
      ownerId: "other-process",
    }),
  ]);
  expect(claimed.filter(Boolean)).toHaveLength(1);
  const execution = claimed.find((entry) => entry !== undefined)!;
  await expect(
    failing.commitTurn(scope, execution.run, {
      checkpoint: execution.checkpoint,
      segmentId: "rollback-segment",
      text: "Uncommitted",
      firstResponseAt: new Date().toISOString(),
    }),
  ).rejects.toThrow("rollback");
  const rolledBack = await repository.snapshot(scope, conversation.id);
  expect(rolledBack.segments).toHaveLength(0);
  expect(rolledBack.runs[0]!.firstResponseAt).toBeNull();
  const events = await repository.events(scope, conversation.id, 0, 100);
  if (events.status !== "events") throw new Error("Unexpected snapshot");
  expect(events.events.map((entry) => entry.event.kind)).toEqual([
    "message.created",
    "run.state",
    "run.state",
  ]);
  await repository.stop(scope, conversation.id, snapshot.runs[0]!.id);
});
it("HTTP returns before a gated model completes, steers its Run and commits first response atomically", async () => {
  const { conversation } = await agents.create(scope, definition);
  const selected = { spaceId: scope.spaceId, conversationId: conversation.id };
  const before = model.calls.length;
  await client.conversations.send({
    ...selected,
    message: { idempotencyKey: "first", text: "First" },
  });
  await expect.poll(() => model.calls.length).toBe(before + 1);
  const call = model.calls[before]!;
  call.delta("Hello");
  expect((await repository.snapshot(scope, conversation.id)).segments).toEqual([]);
  await client.conversations.send({
    ...selected,
    message: { idempotencyKey: "second", text: "Second" },
  });
  const waiting = await repository.snapshot(scope, conversation.id);
  expect(waiting.runs.map((run) => run.state)).toEqual(["running"]);
  expect(model.calls).toHaveLength(before + 1);
  call.delta(" world");
  call.complete();
  await expect.poll(() => model.calls.length).toBe(before + 2);
  expect(model.calls[before + 1]!.input.continuation).toContainEqual(
    expect.objectContaining({ role: "user", content: "Second" }),
  );
  const committed = await repository.snapshot(scope, conversation.id);
  expect(committed.segments).toHaveLength(1);
  expect(committed.segments[0]!.text).toBe("Hello world");
  expect(Date.parse(committed.runs[0]!.firstResponseAt!)).toBeLessThanOrEqual(
    Date.parse(committed.segments[0]!.createdAt),
  );
  const page = await repository.events(scope, conversation.id, 0, 100);
  if (page.status !== "events") throw new Error("Unexpected snapshot");
  expect(page.events.filter((entry) => entry.event.kind === "reply.segment")).toHaveLength(1);
  expect(page.events.map((entry) => entry.event.sequence)).toEqual(
    Array.from({ length: page.events.length }, (_, i) => i + 1),
  );
  const stopped = await client.conversations.stop({ ...selected, runId: committed.runs[0]!.id });
  expect(stopped.state).toBe("cancelled");
  expect(model.calls[before + 1]!.signal.aborted).toBe(true);
  for (const operation of [
    () => repository.stop(foreign, conversation.id, committed.runs[0]!.id),
    () => repository.getRun(foreign, conversation.id, committed.runs[0]!.id),
  ])
    await expect(operation()).rejects.toThrow("not found");
});
it("missing models and raw provider errors commit safe failed states without fallback", async () => {
  const { conversation } = await agents.create(scope, definition);
  const missing = new ConversationRunner(repository, createDeploymentModels("[]", "{}"));
  try {
    await missing.conversations.send(scope, conversation.id, {
      idempotencyKey: "missing",
      text: "Missing",
    });
    await expect
      .poll(async () => (await repository.snapshot(scope, conversation.id)).runs[0]!.failureCode)
      .toBe("MODEL_UNAVAILABLE");
  } finally {
    await missing.close();
  }
  const before = model.calls.length;
  await runner.conversations.send(scope, conversation.id, {
    idempotencyKey: "error",
    text: "Error",
  });
  await expect.poll(() => model.calls.length).toBe(before + 1);
  model.calls[before]!.fail();
  await expect
    .poll(async () => (await repository.snapshot(scope, conversation.id)).runs[1]!.state)
    .toBe("failed");
  const snapshot = await repository.snapshot(scope, conversation.id);
  expect(snapshot.runs[1]!.failureCode).toBe("MODEL_FAILED");
  expect(JSON.stringify(await repository.events(scope, conversation.id, 0, 100))).not.toMatch(
    /private-provider-message|secret-fixture/,
  );
  // Every new Space-owned reference is composite.
  const run = snapshot.runs[0]!;
  await expect(
    connection.db.insert(conversationRuns).values({
      spaceId: foreign.spaceId,
      conversationId: conversation.id,
      id: crypto.randomUUID(),
      agentId: run.agentId,
      messageId: run.messageId,
      messageSequence: 1,
      memberAccountId: owner,
      modelId: "fixture",
      instructions: "",
    }),
  ).rejects.toMatchObject({ cause: { code: "23503" } });
  await expect(
    connection.db.insert(conversationReplySegments).values({
      spaceId: foreign.spaceId,
      conversationId: conversation.id,
      id: crypto.randomUUID(),
      runId: run.id,
      sequence: 1,
      text: "Cross",
    }),
  ).rejects.toMatchObject({ cause: { code: "23503" } });
  const other = await agents.create(foreign, definition);
  await expect(
    connection.db.insert(conversationEvents).values({
      spaceId: foreign.spaceId,
      conversationId: other.conversation.id,
      sequence: 1,
      kind: "run.state",
      runId: run.id,
      data: { state: "failed", failureCode: "MODEL_FAILED" },
    }),
  ).rejects.toMatchObject({ cause: { code: "23503" } });
});

it("pins model/instructions at first start and builds queued context as member/reply pairs", async () => {
  const saved = await agents.create(scope, definition);
  const id = saved.conversation.id;
  await repository.send(scope, id, { idempotencyKey: "one", text: "One" });
  await repository.send(scope, id, { idempotencyKey: "two", text: "Two" });
  await repository.send(scope, id, { idempotencyKey: "three", text: "Three" });
  await agents.update(scope, saved.agent.id, {
    ...definition,
    instructions: "Changed",
    model: { modelId: "changed" },
  });
  const first = (await repository.claimNext(scope, id, claim))!;
  expect(first.run.model).toEqual({ modelId: "changed" });
  expect(first.instructions).toBe("Changed");
  expect(first.history.map((entry) => entry.text)).toEqual(["One"]);
  await repository.commitTurn(scope, first.run, {
    checkpoint: { ...first.checkpoint, completed: true },
    segmentId: crypto.randomUUID(),
    text: "Reply one",
    firstResponseAt: new Date().toISOString(),
  });
  await repository.finish(scope, first.run, null);
  const next = (await repository.claimNext(scope, id, claim))!;
  expect(next.history.map((entry) => entry.text)).toEqual(["One", "Reply one", "Two"]);
  await repository.commitTurn(scope, next.run, {
    checkpoint: { ...next.checkpoint, completed: true },
    segmentId: crypto.randomUUID(),
    text: "Reply two",
    firstResponseAt: new Date().toISOString(),
  });
  await repository.finish(scope, next.run, null);
  const last = (await repository.claimNext(scope, id, claim))!;
  expect(last.history.map((entry) => entry.text)).toEqual([
    "One",
    "Reply one",
    "Two",
    "Reply two",
    "Three",
  ]);
  await repository.stop(scope, id, last.run.id);
});
