import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import type { ToolCall } from "@raypx/ai";
import { connectDatabase, migrateDatabase } from "@raypx/database";
import {
  approvalRequests,
  computers,
  conversations,
  conversationEffects,
  spaceMembers,
  spaces,
  user,
} from "@raypx/database/schema";
import {
  ConversationRunner,
  createApprovalsService,
  createComputerTools,
  EFFECT_INTENT_TIMEOUT_MS,
} from "@raypx/agents/server";
import {
  createAgentsRepository,
  createApprovalsRepository,
  createConversationsRepository,
} from "@raypx/agents/server/postgres";
import { createComputersService } from "@raypx/computers/server";
import { createComputersRepository } from "@raypx/computers/server/postgres";
import { createMemoryComputerProvider } from "@raypx/providers/computer";
import { createSpaceAccess } from "@raypx/spaces/server/postgres";
import type { SpaceScope } from "@raypx/spaces/server";
import { createApiClient } from "@raypx/client/api";
import { createApiApp } from "../../helpers/app.js";
import { modelFixture } from "../../helpers/model.js";

const url = process.env.TEST_DATABASE_URL;
if (!url || !/_test(?:_[a-z0-9]+)?$/.test(new URL(url).pathname))
  throw new Error("A newly created disposable *_test or *_test_<lane> database is required");
const connection = connectDatabase(url);
const access = createSpaceAccess(connection.db);
const agents = createAgentsRepository(connection.db);
const repository = createConversationsRepository(connection.db);
const approvalRepository = createApprovalsRepository(connection.db);
let clock = new Date();
const approvals = createApprovalsService(approvalRepository, {
  now: () => clock,
  requestTtlMs: 60_000,
  pollIntervalMs: 5,
});
const provider = createMemoryComputerProvider();
const computerService = createComputersService(
  createComputersRepository(connection.db),
  provider,
  "memory",
);
const tools = createComputerTools(computerService, provider, [], repository.pinResources);
const model = modelFixture();
const runner = new ConversationRunner(repository, model.models, undefined, undefined, {
  tools,
  approvals,
});
const owner = `approvals-api-${crypto.randomUUID()}`;
const member = `approvals-api-${crypto.randomUUID()}`;
const outsider = `approvals-api-${crypto.randomUUID()}`;
let scope: SpaceScope;
const owned: string[] = [];
function client(accountId: string) {
  const app = createApiApp({
    spaces: access,
    agents,
    conversations: runner.conversations,
    agentApprovals: approvals,
    computers: computerService,
    allowedOrigins: ["https://web.example.test"],
    readSession: async () => ({
      user: {
        id: accountId,
        name: "Approval fixture",
        email: `${accountId}@example.test`,
        emailVerified: true,
        role: "admin",
      },
      session: {
        id: `session-${accountId}`,
        userId: accountId,
        expiresAt: new Date(Date.now() + 60_000),
      },
    }),
  });
  return createApiClient({
    baseUrl: "https://api.example.test",
    headers: { origin: "https://web.example.test" },
    fetch: async (input, init) => app.fetch(new Request(input, init)),
  });
}
const ownerClient = client(owner);
const memberClient = client(member);
const outsiderClient = client(outsider);
const definition = { name: "Helper", instructions: "Be helpful", model: { modelId: "fixture" } };
const write: ToolCall = {
  type: "toolCall",
  id: "write-one",
  name: "computer_write_file",
  arguments: { path: "result.txt", content: "private file body" },
};

beforeAll(async () => {
  await migrateDatabase(url);
  await connection.db.insert(user).values(
    [owner, member, outsider].map((id) => ({
      id,
      name: "Approval fixture",
      email: `${id}@example.test`,
      emailVerified: true,
    })),
  );
  const created = await access.create(owner, { name: "Approval API fixture" });
  owned.push(created.space.id);
  scope = await access.resolve(owner, created.space.id);
  await connection.db
    .insert(spaceMembers)
    .values({ spaceId: scope.spaceId, accountId: member, role: "member" });
});
beforeEach(async () => {
  clock = new Date();
  await ownerClient.approvals.updateSettings({
    expectedRevision: (await ownerClient.approvals.settings({})).revision,
    mode: "ask",
    rules: [],
  });
});
afterAll(async () => {
  try {
    await runner.close();
    await connection.db.delete(conversations).where(inArray(conversations.spaceId, owned));
    await connection.db.delete(computers).where(inArray(computers.spaceId, owned));
    await connection.db.delete(spaces).where(inArray(spaces.id, owned));
    await connection.db.delete(user).where(inArray(user.id, [owner, member, outsider]));
  } finally {
    await connection.close();
  }
});
async function start() {
  const { conversation } = await agents.create(scope, definition);
  const selection = { spaceId: scope.spaceId, conversationId: conversation.id };
  const before = model.calls.length;
  await ownerClient.conversations.send({
    ...selection,
    message: { idempotencyKey: "first", text: "Write the file" },
  });
  await expect.poll(() => model.calls.length).toBe(before + 1);
  return { before, selection, id: conversation.id };
}
async function pending() {
  await expect
    .poll(async () => (await ownerClient.approvals.pending({ spaceId: scope.spaceId })).length)
    .toBe(1);
  return (await ownerClient.approvals.pending({ spaceId: scope.spaceId }))[0]!;
}
function toolResult(index: number) {
  const result = model.calls[index]!.input.continuation?.find(
    (message) => message.role === "toolResult",
  );
  if (!result || result.role !== "toolResult") throw new Error("Expected tool result");
  const text = result.content
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("");
  return JSON.parse(text) as { state: string; refused?: boolean; trust?: string };
}

it("waits for the addressed member, accepts steering, and resumes the same Run after approval", async () => {
  const f = await start();
  expect(model.calls[f.before]!.input.tools?.map((tool) => tool.name)).toContain(
    "computer_write_file",
  );
  model.calls[f.before]!.toolCalls([write]);
  const request = await pending();
  expect(request).toMatchObject({
    memberAccountId: owner,
    toolName: write.name,
    arguments: write.arguments,
  });
  expect((await repository.snapshot(scope, f.id)).runs[0]!.state).toBe("waiting");
  expect(await computerService.get(scope)).toMatchObject({
    status: "available",
    computer: { state: "running" },
  });
  await ownerClient.conversations.send({
    ...f.selection,
    message: { idempotencyKey: "second", text: "Another message" },
  });
  expect((await repository.snapshot(scope, f.id)).runs.map((run) => run.state)).toEqual([
    "waiting",
  ]);
  expect(model.calls).toHaveLength(f.before + 1);
  expect(await memberClient.approvals.pending({ spaceId: scope.spaceId })).toEqual([]);
  await expect(
    memberClient.approvals.answer({
      spaceId: scope.spaceId,
      requestId: request.id,
      decision: "approved",
    }),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
  for (const operation of [
    () => outsiderClient.approvals.pending({ spaceId: scope.spaceId }),
    () =>
      outsiderClient.approvals.answer({
        spaceId: scope.spaceId,
        requestId: request.id,
        decision: "approved",
      }),
    () => outsiderClient.approvals.effects({ spaceId: scope.spaceId, runId: request.runId }),
  ])
    await expect(operation()).rejects.toMatchObject({ code: "NOT_FOUND" });
  await ownerClient.approvals.answer({
    spaceId: scope.spaceId,
    requestId: request.id,
    decision: "approved",
    allowTool: true,
  });
  await expect(
    ownerClient.approvals.answer({
      spaceId: scope.spaceId,
      requestId: request.id,
      decision: "denied",
    }),
  ).rejects.toMatchObject({ code: "CONFLICT" });
  await expect.poll(() => model.calls.length).toBe(f.before + 2);
  expect(model.calls[f.before + 1]!.input.continuation).toContainEqual(
    expect.objectContaining({ role: "user", content: "Another message" }),
  );
  expect(toolResult(f.before + 1)).toMatchObject({ state: "succeeded", trust: "untrusted" });
  expect(await ownerClient.approvals.settings({})).toMatchObject({
    mode: "ask",
    rules: [{ toolName: write.name, executable: null, decision: "allow" }],
  });
  const state = await computerService.get(scope);
  if (state.status !== "available" || !state.computer) throw new Error("Missing computer");
  const file = await provider.read(
    { id: state.computer.id, generation: state.computer.generation },
    "result.txt",
    1024,
  );
  expect(Buffer.from(file.bytes, "base64").toString("utf8")).toBe("private file body");
  expect(
    await ownerClient.approvals.effects({ spaceId: scope.spaceId, runId: request.runId }),
  ).toMatchObject([{ toolCallId: write.id, state: "succeeded" }]);
  const page = await repository.events(scope, f.id, 0, 100);
  if (page.status !== "events") throw new Error("Unexpected snapshot");
  expect(page.events.filter((entry) => entry.event.kind === "card.created")).toHaveLength(1);
  expect(
    page.events.filter((entry) => entry.event.kind === "card.resolved").map((entry) => entry.event),
  ).toMatchObject([{ requestId: request.id, outcome: "approved", answeredByAccountId: owner }]);
  expect(JSON.stringify(page)).not.toContain("private file body");
  expect(page.events.map((entry) => entry.event.sequence)).toEqual(
    Array.from({ length: page.events.length }, (_, index) => index + 1),
  );
  model.calls[f.before + 1]!.complete("Written");
  await expect
    .poll(async () => (await repository.snapshot(scope, f.id)).runs.map((run) => run.state))
    .toEqual(["succeeded"]);
});

it("returns denial and expiry as explicit refused tool results", async () => {
  for (const outcome of ["denied", "expired"] as const) {
    const f = await start();
    model.calls[f.before]!.toolCalls([{ ...write, id: outcome }]);
    const request = await pending();
    if (outcome === "denied") {
      await ownerClient.approvals.answer({
        spaceId: scope.spaceId,
        requestId: request.id,
        decision: "denied",
      });
    } else {
      clock = new Date(Date.parse(request.expiresAt) + 1);
    }
    await expect.poll(() => model.calls.length).toBe(f.before + 2);
    expect(toolResult(f.before + 1)).toMatchObject({ state: outcome, refused: true });
    expect(
      await ownerClient.approvals.effects({ spaceId: scope.spaceId, runId: request.runId }),
    ).toEqual([]);
    const [stored] = await connection.db
      .select()
      .from(approvalRequests)
      .where(and(eq(approvalRequests.spaceId, scope.spaceId), eq(approvalRequests.id, request.id)));
    expect(stored!.state).toBe(outcome);
    await expect(
      ownerClient.approvals.answer({
        spaceId: scope.spaceId,
        requestId: request.id,
        decision: "approved",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    model.calls[f.before + 1]!.complete("Refused");
    await expect
      .poll(async () => (await repository.snapshot(scope, f.id)).runs[0]!.state)
      .toBe("succeeded");
    clock = new Date();
  }
});

it("cancels a pending request through HTTP stop and keeps the cancelled resolution durable", async () => {
  const f = await start();
  model.calls[f.before]!.toolCalls([write]);
  const request = await pending();
  expect(
    await ownerClient.conversations.stop({ ...f.selection, runId: request.runId }),
  ).toMatchObject({ state: "cancelled" });
  await expect
    .poll(async () => (await ownerClient.approvals.pending({ spaceId: scope.spaceId })).length)
    .toBe(0);
  const [stored] = await connection.db
    .select()
    .from(approvalRequests)
    .where(and(eq(approvalRequests.spaceId, scope.spaceId), eq(approvalRequests.id, request.id)));
  expect(stored!.state).toBe("cancelled");
  await expect(
    ownerClient.approvals.answer({
      spaceId: scope.spaceId,
      requestId: request.id,
      decision: "approved",
    }),
  ).rejects.toMatchObject({ code: "CONFLICT" });
  expect(model.calls).toHaveLength(f.before + 1);
});

it("does not execute a recorded effect twice and exposes interrupted intent as unknown before continuation", async () => {
  await ownerClient.approvals.updateSettings({
    expectedRevision: (await ownerClient.approvals.settings({})).revision,
    mode: "never",
    rules: [],
  });
  const saved = await agents.create(scope, definition);
  await repository.send(scope, saved.conversation.id, { idempotencyKey: "effect", text: "Effect" });
  const execution = (await repository.claimNext(scope, saved.conversation.id, {
    ownerId: "effect-test",
    leaseMs: 15_000,
    timeoutMs: 300_000,
    backupMarginMs: 30_000,
  }))!;
  const call = tools.prepare(write);
  let executions = 0;
  const operation = async () => {
    executions += 1;
    return tools.execute(scope, execution.run, call, new AbortController().signal);
  };
  const first = await approvals.executeEffect(
    scope,
    execution.run,
    call,
    operation,
    new AbortController().signal,
  );
  const recreated = createApprovalsService(createApprovalsRepository(connection.db));
  expect(
    await recreated.executeEffect(
      scope,
      execution.run,
      call,
      operation,
      new AbortController().signal,
    ),
  ).toBe(first);
  expect(executions).toBe(1);
  expect(
    await ownerClient.approvals.effects({ spaceId: scope.spaceId, runId: execution.run.id }),
  ).toMatchObject([{ state: "succeeded" }]);
  tools.release(execution.run);
  await repository.finish(scope, execution.run, null);

  const interrupted = await agents.create(scope, definition);
  const message = { idempotencyKey: "interrupted", text: "Continue interrupted work" };
  await repository.send(scope, interrupted.conversation.id, message);
  const queued = (await repository.snapshot(scope, interrupted.conversation.id)).runs[0]!;
  await connection.db.insert(conversationEffects).values({
    spaceId: scope.spaceId,
    conversationId: interrupted.conversation.id,
    runId: queued.id,
    key: "a".repeat(64),
    argumentHash: "b".repeat(64),
    toolCallId: "interrupted-call",
    toolName: "computer_write_file",
    state: "intent",
    createdAt: new Date(clock.getTime() - EFFECT_INTENT_TIMEOUT_MS - 1),
  });
  expect(
    await ownerClient.approvals.effects({ spaceId: scope.spaceId, runId: queued.id }),
  ).toMatchObject([{ state: "unknown", result: null }]);
  const before = model.calls.length;
  await runner.conversations.send(scope, interrupted.conversation.id, message);
  await expect
    .poll(
      async () =>
        (await repository.getRun(scope, interrupted.conversation.id, queued.id)).failureCode,
    )
    .toBe("EFFECT_UNKNOWN");
  expect(model.calls).toHaveLength(before);
});

it("rejects unavailable Auto explicitly and keeps account settings isolated", async () => {
  await expect(
    ownerClient.approvals.updateSettings({
      expectedRevision: (await ownerClient.approvals.settings({})).revision,
      mode: "auto",
      rules: [],
    }),
  ).rejects.toMatchObject({ code: "BAD_REQUEST", message: "APPROVAL_MODE_UNAVAILABLE" });
  await ownerClient.approvals.updateSettings({
    expectedRevision: (await ownerClient.approvals.settings({})).revision,
    mode: "never",
    rules: [{ toolName: "computer_run_command", executable: "git", decision: "block" }],
  });
  expect(await outsiderClient.approvals.settings({})).toMatchObject({
    mode: "ask",
    rules: [],
    revision: 0,
  });
});
