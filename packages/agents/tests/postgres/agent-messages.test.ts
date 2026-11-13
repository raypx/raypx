import { afterAll, afterEach, beforeAll, expect, it } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import { createAssistantMessageEventStream, type AssistantMessage, type ToolCall } from "@raypx/ai";
import { connectDatabase, migrateDatabase } from "@raypx/database";
import {
  computers as computerRows,
  approvalRequests,
  conversationDelegations,
  conversationRunAttempts,
  conversationRunCheckpoints,
  conversationRuns,
  spaceMembers,
  spaces,
  user,
} from "@raypx/database/schema";
import {
  MAX_AGENT_MESSAGE_DEPTH,
  MAX_AGENT_MESSAGE_RUNS,
  type Run,
} from "@raypx/core/conversation";
import { createSpaceAccess } from "@raypx/spaces/server/postgres";
import { createMemoryComputerProvider } from "@raypx/providers/computer";
import { createComputersService } from "@raypx/computers/server";
import { createComputersRepository } from "@raypx/computers/server/postgres";
import { createApprovalsService } from "../../src/approvals.js";
import { createComputerTools } from "../../src/computer-tools.js";
import { ConversationRunner, type ModelAccess, type ModelTurn } from "../../src/runner.js";
import type { RunCheckpoint, RunClaimOptions } from "../../src/conversations.js";
import {
  createAgentsRepository,
  createApprovalsRepository,
  createComputerUseQueue,
  createConversationsRepository,
} from "../../src/server/postgres.js";

const url = process.env.TEST_DATABASE_URL;
if (!url || !new URL(url).pathname.endsWith("_test"))
  throw new Error("A newly created disposable *_test database is required");
const first = connectDatabase(url);
const second = connectDatabase(url);
const writer = createConversationsRepository(first.db);
const competitor = createConversationsRepository(second.db);
const access = createSpaceAccess(first.db);
const agents = createAgentsRepository(first.db);
const owner = `agent-message-owner-${crypto.randomUUID()}`;
const actor = `agent-message-actor-${crypto.randomUUID()}`;
const owned = new Set<string>();
const executors: ConversationRunner[] = [];
const claim: RunClaimOptions = {
  ownerId: "agent-message-fixture",
  leaseMs: 30_000,
  timeoutMs: 300_000,
  backupMarginMs: 30_000,
};

beforeAll(async () => {
  await migrateDatabase(url);
  await first.db.insert(user).values([
    { id: owner, name: "Owner", email: `${owner}@example.test` },
    { id: actor, name: "Actor", email: `${actor}@example.test` },
  ]);
});
afterEach(async () => {
  try {
    await Promise.all(executors.splice(0).map((runner) => runner.close()));
  } finally {
    // Workers scan every Space. Queued Runs from budget fixtures must not become
    // unrelated model calls in the next test's recovery worker.
    await removeOwnedSpaces();
  }
});
afterAll(async () => {
  try {
    await removeOwnedSpaces();
    for (const accountId of [actor, owner]) {
      await first.db.delete(spaces).where(eq(spaces.privateFor, accountId));
      await first.db.delete(user).where(eq(user.id, accountId));
    }
  } finally {
    await Promise.all([first.close(), second.close()]);
  }
});

async function removeOwnedSpaces() {
  for (const spaceId of owned) {
    await first.db.delete(computerRows).where(eq(computerRows.spaceId, spaceId));
    await first.db.delete(spaces).where(eq(spaces.id, spaceId));
    owned.delete(spaceId);
  }
}

async function fixture() {
  const home = await access.create(owner, { name: "Agent messages" });
  owned.add(home.space.id);
  const scope = await access.resolve(owner, home.space.id);
  await first.db
    .insert(spaceMembers)
    .values({ spaceId: scope.spaceId, accountId: actor, role: "member" });
  const actorScope = await access.resolve(actor, scope.spaceId);
  const alpha = await agents.create(scope, {
    name: "Alpha",
    instructions: "Fixture Alpha",
    model: { modelId: "fixture" },
  });
  const beta = await agents.create(scope, {
    name: "Beta",
    instructions: "Fixture Beta",
    model: { modelId: "fixture" },
  });
  const group = await writer.createGroup!(scope, {
    name: "Group",
    agentIds: [alpha.agent.id, beta.agent.id],
  });
  const message = await writer.send(actorScope, group.id, {
    text: "Original member task",
    mentions: [alpha.agent.id],
    idempotencyKey: crypto.randomUUID(),
  });
  const execution = (await writer.claimNext(scope, group.id, claim))!;
  return { scope, actorScope, alpha, beta, group, message, execution };
}

function assistant(text: string, tools: ToolCall[] = []): AssistantMessage {
  return {
    role: "assistant",
    content: [...(text ? [{ type: "text" as const, text }] : []), ...tools],
    api: "openai-responses",
    provider: "fixture",
    model: "fixture",
    stopReason: tools.length ? "toolUse" : "stop",
    timestamp: 0,
    usage: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
  };
}
function modelFixture() {
  const calls: Array<{
    input: ModelTurn;
    run: Run;
    respond(text: string, tools?: ToolCall[]): void;
  }> = [];
  const models: ModelAccess = {
    async resolve(run) {
      return {
        stream(input) {
          const stream = createAssistantMessageEventStream();
          calls.push({
            input: structuredClone(input),
            run: structuredClone(run),
            respond: (text, tools) => stream.end(assistant(text, tools)),
          });
          return stream;
        },
      };
    },
    close() {},
  };
  return { calls, models };
}
function toolOutput(input: ModelTurn, name: string) {
  return input.continuation
    ?.flatMap((message) =>
      message.role === "toolResult" && message.toolName === name ? message.content : [],
    )
    .filter((part) => part.type === "text")
    .map((part) => JSON.parse(part.text) as { state: string; code?: string });
}

function childResults(input: Pick<ModelTurn, "continuation">) {
  return (input.continuation ?? [])
    .flatMap((message) => (message.role === "toolResult" ? message.content : []))
    .filter((part) => part.type === "text")
    .map((part) => JSON.parse(part.text) as Record<string, unknown>)
    .filter((result) => result.source === "child_run");
}

function callsFor(model: ReturnType<typeof modelFixture>, runId: string) {
  return model.calls.filter((call) => call.run.id === runId);
}

async function checkpointFor(run: Run) {
  const [checkpoint] = await first.db
    .select({ data: conversationRunCheckpoints.data })
    .from(conversationRunCheckpoints)
    .where(
      and(
        eq(conversationRunCheckpoints.spaceId, run.spaceId),
        eq(conversationRunCheckpoints.conversationId, run.conversationId),
        eq(conversationRunCheckpoints.runId, run.id),
      ),
    );
  expect(checkpoint).toBeDefined();
  return checkpoint!.data as RunCheckpoint;
}

it("bounds an actual Agent message chain, retains its originating member and deduplicates retries", async () => {
  const f = await fixture();
  let current = f.execution;
  for (let depth = 1; depth <= MAX_AGENT_MESSAGE_DEPTH; depth++) {
    const agentId = current.run.agentId === f.alpha.agent.id ? f.beta.agent.id : f.alpha.agent.id;
    const input = { toolCallId: `chain-${depth}`, agentId, text: `Agent task ${depth}` };
    const sent = await writer.sendAgent!(current.scope, current.run, input);
    expect(await competitor.sendAgent!(current.scope, current.run, input)).toEqual(sent);
    expect(sent).toMatchObject({
      author: { kind: "agent", accountId: actor, agentId: current.run.agentId },
      mentions: [agentId],
    });
    await writer.finish(current.scope, current.run, null);
    current = (await competitor.claimNext(f.scope, f.group.id, {
      ...claim,
      ownerId: `chain-worker-${depth}`,
    }))!;
    expect(current.run).toMatchObject({
      agentId,
      trigger: "agent",
      memberAccountId: actor,
      untrustedInput: true,
    });
    const [stored] = await first.db
      .select()
      .from(conversationRuns)
      .where(
        and(eq(conversationRuns.spaceId, f.scope.spaceId), eq(conversationRuns.id, current.run.id)),
      );
    expect(stored).toMatchObject({ originMessageId: f.message.id, agentChainDepth: depth });
  }
  const before = await writer.snapshot(f.scope, f.group.id);
  const target = current.run.agentId === f.alpha.agent.id ? f.beta.agent.id : f.alpha.agent.id;
  const last = writer.sendAgent!(current.scope, current.run, {
    toolCallId: "chain-limit",
    agentId: target,
    text: "Must be refused",
  });
  await expect(last).rejects.toMatchObject({ code: "AGENT_MESSAGE_DEPTH_LIMIT" });
  const after = await writer.snapshot(f.scope, f.group.id);
  expect(after.cursor).toBe(before.cursor);
  expect(after.messages).toEqual(before.messages);
});

it("enforces the per-origin budget atomically across independent writers and permits an existing receipt at the limit", async () => {
  const f = await fixture();
  const results = await Promise.allSettled(
    Array.from({ length: MAX_AGENT_MESSAGE_RUNS + 4 }, (_, index) =>
      (index % 2 ? competitor : writer).sendAgent!(f.actorScope, f.execution.run, {
        toolCallId: `budget-${index}`,
        agentId: f.beta.agent.id,
        text: "Bounded Agent task",
      }),
    ),
  );
  const accepted = results.filter((result) => result.status === "fulfilled");
  const refused = results.filter((result) => result.status === "rejected");
  expect(accepted).toHaveLength(MAX_AGENT_MESSAGE_RUNS);
  expect(refused).toHaveLength(4);
  for (const result of refused)
    expect(result.status === "rejected" ? result.reason : undefined).toMatchObject({
      code: "AGENT_MESSAGE_BUDGET_LIMIT",
    });
  const index = results.findIndex((result) => result.status === "fulfilled");
  const replay = await writer.sendAgent!(f.actorScope, f.execution.run, {
    toolCallId: `budget-${index}`,
    agentId: f.beta.agent.id,
    text: "A changed retry body does not send another message",
  });
  const original = results[index]!;
  expect(replay.id).toBe(original.status === "fulfilled" ? original.value.id : undefined);
  const snapshot = await writer.snapshot(f.scope, f.group.id);
  expect(snapshot.runs.filter((run) => run.trigger === "agent")).toHaveLength(
    MAX_AGENT_MESSAGE_RUNS,
  );
  expect(snapshot.messages).toHaveLength(MAX_AGENT_MESSAGE_RUNS + 1);
});

it("returns cross-Space refusal codes to the model, including an opted-in receiver without a delivery path", async () => {
  const f = await fixture();
  const foreign = await fixture();
  const model = modelFixture();
  let claimed = false;
  const repository = {
    ...writer,
    async claimNext(...args: Parameters<typeof writer.claimNext>) {
      if (claimed) return undefined;
      const result = await writer.claimNext(...args);
      claimed ||= result !== undefined;
      return result;
    },
  };
  await writer.release(f.actorScope, f.execution.run);
  const runner = new ConversationRunner(repository, model.models, undefined, undefined, undefined, {
    ownerId: "cross-space-model-worker",
    maxAttempts: 1,
  });
  executors.push(runner);
  runner.dispatch(f.actorScope, f.group.id);
  await expect.poll(() => model.calls.length).toBe(1);
  const messageCall = (id: string): ToolCall => ({
    type: "toolCall",
    id,
    name: "agent_send_message",
    arguments: {
      agentId: foreign.beta.agent.id,
      spaceId: foreign.scope.spaceId,
      text: "No cross-Space delivery",
    },
  });
  model.calls[0]!.respond("", [messageCall("disabled-space")]);
  await expect.poll(() => model.calls.length).toBe(2);
  expect(toolOutput(model.calls[1]!.input, "agent_send_message")).toContainEqual(
    expect.objectContaining({ state: "refused", code: "AGENT_MESSAGE_CROSS_SPACE_DISABLED" }),
  );
  await agents.update(foreign.scope, foreign.beta.agent.id, {
    name: "Beta",
    instructions: "Fixture Beta",
    model: { modelId: "fixture" },
    allowCrossSpaceMessages: true,
  });
  model.calls[1]!.respond("", [messageCall("unsupported-space")]);
  await expect.poll(() => model.calls.length).toBe(3);
  expect(toolOutput(model.calls[2]!.input, "agent_send_message")).toContainEqual(
    expect.objectContaining({ state: "refused", code: "AGENT_MESSAGE_CROSS_SPACE_UNSUPPORTED" }),
  );
  model.calls[2]!.respond("Cross-Space delivery refused");
  await expect
    .poll(async () => (await writer.getRun(f.scope, f.group.id, f.execution.run.id)).state)
    .toBe("succeeded");
  expect((await writer.snapshot(f.scope, f.group.id)).messages).toHaveLength(1);
  expect((await writer.snapshot(foreign.scope, foreign.group.id)).messages).toHaveLength(1);
});

it.each(["depth", "budget"] as const)(
  "returns the %s limit as a stable tool result to the model",
  async (limit) => {
    const f = await fixture();
    if (limit === "depth") {
      await first.db
        .update(conversationRuns)
        .set({ agentChainDepth: MAX_AGENT_MESSAGE_DEPTH })
        .where(
          and(
            eq(conversationRuns.spaceId, f.scope.spaceId),
            eq(conversationRuns.id, f.execution.run.id),
          ),
        );
    } else {
      for (let index = 0; index < MAX_AGENT_MESSAGE_RUNS; index++)
        await writer.sendAgent!(f.actorScope, f.execution.run, {
          toolCallId: `model-budget-${index}`,
          agentId: f.beta.agent.id,
          text: "Bounded task",
        });
    }
    await writer.release(f.actorScope, f.execution.run);
    const model = modelFixture();
    let claimed = false;
    const repository = {
      ...writer,
      async claimNext(...args: Parameters<typeof writer.claimNext>) {
        if (claimed) return undefined;
        const result = await writer.claimNext(...args);
        claimed ||= result !== undefined;
        return result;
      },
    };
    const runner = new ConversationRunner(
      repository,
      model.models,
      undefined,
      undefined,
      undefined,
      {
        ownerId: `model-${limit}-worker`,
        maxAttempts: 1,
      },
    );
    executors.push(runner);
    runner.dispatch(f.actorScope, f.group.id);
    await expect.poll(() => model.calls.length).toBe(1);
    model.calls[0]!.respond("", [
      {
        type: "toolCall",
        id: `refused-${limit}`,
        name: "agent_send_message",
        arguments: { agentId: f.beta.agent.id, text: "Refused task" },
      },
    ]);
    await expect.poll(() => model.calls.length).toBe(2);
    expect(toolOutput(model.calls[1]!.input, "agent_send_message")).toContainEqual(
      expect.objectContaining({
        state: "refused",
        code: limit === "depth" ? "AGENT_MESSAGE_DEPTH_LIMIT" : "AGENT_MESSAGE_BUDGET_LIMIT",
      }),
    );
    model.calls[1]!.respond("Stopped at the limit");
    await expect
      .poll(async () => (await writer.getRun(f.scope, f.group.id, f.execution.run.id)).state)
      .toBe("succeeded");
  },
);

it("hands an Agent-triggered recipient to another runner and asks its originating member despite an Allow rule", async () => {
  const f = await fixture();
  const provider = createMemoryComputerProvider();
  const computers = createComputersService(createComputersRepository(first.db), provider, "memory");
  const approvals = createApprovalsService(createApprovalsRepository(first.db));
  await approvals.updateSettings(actor, {
    expectedRevision: (await approvals.getSettings(actor)).revision,
    mode: "ask",
    rules: [{ toolName: "computer_write_file", decision: "allow", executable: null }],
  });
  const runtime = {
    tools: createComputerTools(computers, provider, [], writer.pinResources),
    approvals,
  };
  const sourceModel = modelFixture();
  const targetModel = modelFixture();
  let claimed = false;
  const sourceRepository = {
    ...writer,
    async claimNext(...args: Parameters<typeof writer.claimNext>) {
      if (claimed) return undefined;
      const result = await writer.claimNext(...args);
      claimed ||= result !== undefined;
      return result;
    },
  };
  await writer.release(f.actorScope, f.execution.run);
  const source = new ConversationRunner(
    sourceRepository,
    sourceModel.models,
    undefined,
    undefined,
    runtime,
    {
      ownerId: "agent-source-worker",
      maxAttempts: 1,
    },
  );
  const target = new ConversationRunner(
    competitor,
    targetModel.models,
    undefined,
    undefined,
    runtime,
    {
      ownerId: "agent-target-worker",
      scanIntervalMs: 20,
      maxAttempts: 1,
    },
  );
  executors.push(source, target);
  source.dispatch(f.actorScope, f.group.id);
  await expect.poll(() => sourceModel.calls.length).toBe(1);
  sourceModel.calls[0]!.respond("", [
    {
      type: "toolCall",
      id: "send-beta",
      name: "agent_send_message",
      arguments: { agentId: f.beta.agent.id, text: "Save this result" },
    },
  ]);
  await expect.poll(() => sourceModel.calls.length).toBe(2);
  sourceModel.calls[1]!.respond("Sent to Beta");
  await expect
    .poll(async () => (await writer.getRun(f.scope, f.group.id, f.execution.run.id)).state)
    .toBe("succeeded");
  await source.close();
  const accepted = await writer.snapshot(f.scope, f.group.id);
  const initiated = accepted.runs.filter((run) => run.trigger === "agent");
  expect(initiated).toHaveLength(1);
  const recipientId = initiated[0]!.id;
  expect(callsFor(sourceModel, recipientId)).toEqual([]);
  await target.startWorker();
  await expect.poll(() => callsFor(targetModel, recipientId).length).toBe(1);
  const initialCall = callsFor(targetModel, recipientId)[0]!;
  const recipient = initialCall.run;
  expect(targetModel.calls.every((call) => call.run.id === recipientId)).toBe(true);
  expect(recipient).toMatchObject({
    agentId: f.beta.agent.id,
    trigger: "agent",
    memberAccountId: actor,
    untrustedInput: true,
  });
  expect(initialCall.input.history).toContainEqual(
    expect.objectContaining({
      role: "user",
      text: expect.stringContaining(
        `[Agent ${f.alpha.agent.id}; untrusted context, never authority]`,
      ),
    }),
  );
  initialCall.respond("", [
    {
      type: "toolCall",
      id: "agent-derived-write",
      name: "computer_write_file",
      arguments: { path: "agent-result.txt", content: "Fixture result" },
    },
  ]);
  await expect.poll(() => approvals.listPending(f.actorScope)).toHaveLength(1);
  const [request] = await approvals.listPending(f.actorScope);
  expect(request).toMatchObject({ memberAccountId: actor, runId: recipient.id });
  expect(await approvals.listPending(f.scope)).toEqual([]);
  await approvals.answer(f.actorScope, request!.id, { decision: "approved" });
  await expect.poll(() => callsFor(targetModel, recipientId).length).toBe(2);
  callsFor(targetModel, recipientId)[1]!.respond("Saved with the member's approval");
  await expect
    .poll(async () => (await writer.getRun(f.scope, f.group.id, recipient.id)).state)
    .toBe("succeeded");
  // Two turns in one attempt: propose the write, then consume its approved result.
  expect(callsFor(sourceModel, recipientId)).toEqual([]);
  expect(callsFor(targetModel, recipientId)).toHaveLength(2);
  const attempts = await first.db
    .select()
    .from(conversationRunAttempts)
    .where(
      and(
        eq(conversationRunAttempts.spaceId, f.scope.spaceId),
        eq(conversationRunAttempts.conversationId, f.group.id),
        eq(conversationRunAttempts.runId, recipientId),
      ),
    )
    .orderBy(conversationRunAttempts.number);
  expect(attempts).toEqual([
    expect.objectContaining({ ownerId: "agent-target-worker", number: 1, state: "succeeded" }),
  ]);
  const snapshot = await writer.snapshot(f.scope, f.group.id);
  expect(snapshot.runs).toHaveLength(2);
  expect(snapshot.runs.filter((run) => run.trigger === "agent").map((run) => run.id)).toEqual([
    recipientId,
  ]);
  expect(snapshot.messages.filter((message) => message.author.kind === "agent")).toEqual([
    expect.objectContaining({
      id: recipient.messageId,
      author: { kind: "agent", accountId: actor, agentId: f.alpha.agent.id },
      mentions: [f.beta.agent.id],
    }),
  ]);
  const requests = await first.db
    .select()
    .from(approvalRequests)
    .where(
      and(
        eq(approvalRequests.spaceId, f.scope.spaceId),
        eq(approvalRequests.conversationId, f.group.id),
        eq(approvalRequests.runId, recipientId),
      ),
    )
    .orderBy(approvalRequests.createdAt, approvalRequests.id);
  expect(requests).toEqual([
    expect.objectContaining({
      id: request!.id,
      runId: recipientId,
      memberAccountId: actor,
      state: "approved",
    }),
  ]);
});

it("queues same-Agent children across two computer queues and fences a stale release after recovery", async () => {
  const f = await fixture();
  const children: Array<{ runId: string }> = [];
  for (const toolCallId of ["computer-child-one", "computer-child-two"])
    children.push(
      await writer.delegate!(f.actorScope, f.execution.run, {
        toolCallId,
        task: "Work needing the computer",
      }),
    );
  const firstChild = (await writer.claimNext(f.scope, f.group.id, claim))!;
  const secondChild = (await competitor.claimNext(f.scope, f.group.id, {
    ...claim,
    ownerId: "second-computer-child",
  }))!;
  expect(new Set([firstChild.run.id, secondChild.run.id])).toEqual(
    new Set(children.map(({ runId }) => runId)),
  );
  const firstQueue = createComputerUseQueue(first.db);
  const secondQueue = createComputerUseQueue(second.db);
  expect(await firstQueue.acquire(firstChild.scope, firstChild.run)).toBe(true);
  expect(await secondQueue.acquire(secondChild.scope, secondChild.run)).toBe(false);
  await writer.release(firstChild.scope, firstChild.run);
  const recovered = (await competitor.claimNext(f.scope, f.group.id, {
    ...claim,
    ownerId: "recovered-computer-child",
  }))!;
  expect(recovered.run.id).toBe(firstChild.run.id);
  expect(recovered.run.fence).toBeGreaterThan(firstChild.run.fence);
  expect(await secondQueue.acquire(recovered.scope, recovered.run)).toBe(true);
  // Whether the old attempt is refused or ignored, it must leave the new holder intact.
  await Promise.allSettled([firstQueue.release(firstChild.scope, firstChild.run)]);
  expect(await firstQueue.acquire(secondChild.scope, secondChild.run)).toBe(false);
  await secondQueue.release(recovered.scope, recovered.run);
  expect(await firstQueue.acquire(secondChild.scope, secondChild.run)).toBe(true);
  await firstQueue.release(secondChild.scope, secondChild.run);
});

it("recovers a parent and its same-Agent child on a second runner without repeating delegation or losing the result", async () => {
  const f = await fixture();
  const provider = createMemoryComputerProvider();
  const computers = createComputersService(createComputersRepository(first.db), provider, "memory");
  const approvals = createApprovalsService(createApprovalsRepository(first.db));
  const sourceModel = modelFixture();
  const recoveredModel = modelFixture();
  const source = new ConversationRunner(
    writer,
    sourceModel.models,
    undefined,
    undefined,
    { tools: createComputerTools(computers, provider, [], writer.pinResources), approvals },
    { ownerId: "delegation-before-handover", maxAttempts: 1 },
  );
  const recovered = new ConversationRunner(
    competitor,
    recoveredModel.models,
    undefined,
    undefined,
    { tools: createComputerTools(computers, provider, [], competitor.pinResources), approvals },
    { ownerId: "delegation-after-handover", scanIntervalMs: 20, maxAttempts: 1 },
  );
  executors.push(source, recovered);
  await writer.release(f.actorScope, f.execution.run);
  source.dispatch(f.actorScope, f.group.id);
  await expect.poll(() => callsFor(sourceModel, f.execution.run.id).length).toBe(1);
  callsFor(sourceModel, f.execution.run.id)[0]!.respond("", [
    {
      type: "toolCall",
      id: "durable-delegate",
      name: "agent_delegate",
      arguments: { task: "Inspect files and return the delegated result" },
    },
  ]);
  await expect
    .poll(() => sourceModel.calls.some((call) => call.run.parentRunId === f.execution.run.id))
    .toBe(true);
  await expect.poll(() => callsFor(sourceModel, f.execution.run.id).length).toBe(2);
  const child = sourceModel.calls.find((call) => call.run.parentRunId === f.execution.run.id)!.run;
  expect(child).toMatchObject({ agentId: f.alpha.agent.id, memberAccountId: actor });
  callsFor(sourceModel, child.id)[0]!.respond("", [
    {
      type: "toolCall",
      id: "durable-child-list",
      name: "computer_list_files",
      arguments: { path: "." },
    },
  ]);
  await expect.poll(() => callsFor(sourceModel, child.id).length).toBe(2);
  // Neither Run can be claimed by the other process while the source owns it.
  expect(await competitor.claimNext(f.scope, f.group.id, claim)).toBeUndefined();
  const attemptsBefore = await first.db
    .select()
    .from(conversationRunAttempts)
    .where(
      and(
        eq(conversationRunAttempts.spaceId, f.scope.spaceId),
        eq(conversationRunAttempts.conversationId, f.group.id),
      ),
    )
    .orderBy(conversationRunAttempts.runId, conversationRunAttempts.number);
  await source.close();
  await recovered.startWorker();
  await expect.poll(() => callsFor(recoveredModel, f.execution.run.id).length).toBe(1);
  await expect.poll(() => callsFor(recoveredModel, child.id).length).toBe(1);
  expect(await writer.claimNext(f.scope, f.group.id, claim)).toBeUndefined();
  expect(
    toolOutput(callsFor(recoveredModel, child.id)[0]!.input, "computer_list_files"),
  ).toHaveLength(1);
  expect(
    toolOutput(callsFor(recoveredModel, f.execution.run.id)[0]!.input, "agent_delegate"),
  ).toHaveLength(1);
  callsFor(recoveredModel, child.id)[0]!.respond("Durable child result after recovery");
  await expect
    .poll(async () => (await writer.getRun(f.scope, f.group.id, child.id)).state)
    .toBe("succeeded");
  callsFor(recoveredModel, f.execution.run.id)[0]!.respond(
    "The parent continued while its child worked",
  );
  await expect.poll(() => callsFor(recoveredModel, f.execution.run.id).length).toBe(2);
  const delivered = childResults(callsFor(recoveredModel, f.execution.run.id)[1]!.input);
  expect(delivered).toEqual([
    expect.objectContaining({
      runId: child.id,
      agentId: f.alpha.agent.id,
      state: "succeeded",
      content: "Durable child result after recovery",
    }),
  ]);
  callsFor(recoveredModel, f.execution.run.id)[1]!.respond("Parent consumed the recovered result");
  await expect
    .poll(async () => (await writer.getRun(f.scope, f.group.id, f.execution.run.id)).state)
    .toBe("succeeded");
  const snapshot = await writer.snapshot(f.scope, f.group.id);
  expect(snapshot.runs).toHaveLength(2);
  expect(
    snapshot.runs.filter((run) => run.parentRunId === f.execution.run.id).map((run) => run.id),
  ).toEqual([child.id]);
  expect(callsFor(sourceModel, child.id)).toHaveLength(2);
  expect(callsFor(recoveredModel, child.id)).toHaveLength(1);
  expect(childResults(await checkpointFor(f.execution.run))).toEqual(delivered);
  expect(snapshot.segments.every((segment) => segment.runId === f.execution.run.id)).toBe(true);
  const delegations = await first.db
    .select()
    .from(conversationDelegations)
    .where(eq(conversationDelegations.spaceId, f.scope.spaceId))
    .orderBy(conversationDelegations.createdAt, conversationDelegations.toolCallId);
  expect(delegations).toEqual([
    expect.objectContaining({
      parentRunId: f.execution.run.id,
      childRunId: child.id,
      state: "delivered",
    }),
  ]);
  const attemptsAfter = await first.db
    .select()
    .from(conversationRunAttempts)
    .where(
      and(
        eq(conversationRunAttempts.spaceId, f.scope.spaceId),
        eq(conversationRunAttempts.conversationId, f.group.id),
      ),
    )
    .orderBy(conversationRunAttempts.runId, conversationRunAttempts.number);
  for (const runId of [f.execution.run.id, child.id])
    expect(attemptsAfter.filter((attempt) => attempt.runId === runId)).toHaveLength(
      attemptsBefore.filter((attempt) => attempt.runId === runId).length + 1,
    );
  expect(attemptsAfter.filter((attempt) => attempt.runId === child.id)).toEqual([
    expect.objectContaining({
      ownerId: "delegation-before-handover",
      number: 1,
      state: "released",
    }),
    expect.objectContaining({
      ownerId: "delegation-after-handover",
      number: 2,
      state: "succeeded",
    }),
  ]);
  expect(await writer.claimNext(f.scope, f.group.id, claim)).toBeUndefined();
});

it("retains a finished child's checkpoint until its unavailable parent recovers on the other runner", async () => {
  const f = await fixture();
  const provider = createMemoryComputerProvider();
  const computers = createComputersService(createComputersRepository(first.db), provider, "memory");
  const approvals = createApprovalsService(createApprovalsRepository(first.db));
  const sourceModel = modelFixture();
  const recoveredModel = modelFixture();
  const source = new ConversationRunner(
    writer,
    sourceModel.models,
    undefined,
    undefined,
    { tools: createComputerTools(computers, provider, [], writer.pinResources), approvals },
    { ownerId: "finished-child-source", maxAttempts: 1 },
  );
  const recovered = new ConversationRunner(
    competitor,
    recoveredModel.models,
    undefined,
    undefined,
    { tools: createComputerTools(computers, provider, [], competitor.pinResources), approvals },
    { ownerId: "finished-child-recovery", scanIntervalMs: 20, maxAttempts: 1 },
  );
  executors.push(source, recovered);
  await writer.release(f.actorScope, f.execution.run);
  source.dispatch(f.actorScope, f.group.id);
  await expect.poll(() => callsFor(sourceModel, f.execution.run.id).length).toBe(1);
  callsFor(sourceModel, f.execution.run.id)[0]!.respond("", [
    {
      type: "toolCall",
      id: "finished-before-parent",
      name: "agent_delegate",
      arguments: { task: "Return a result while the parent is unavailable" },
    },
  ]);
  await expect
    .poll(() => sourceModel.calls.some((call) => call.run.parentRunId === f.execution.run.id))
    .toBe(true);
  await expect.poll(() => callsFor(sourceModel, f.execution.run.id).length).toBe(2);
  const child = sourceModel.calls.find((call) => call.run.parentRunId === f.execution.run.id)!.run;
  await source.close();
  // Hold only the parent's eligibility; the child's durable backup remains runnable.
  await first.db
    .update(conversationRuns)
    .set({ nextAttemptAt: sql`clock_timestamp() + interval '1 hour'` })
    .where(
      and(
        eq(conversationRuns.spaceId, f.scope.spaceId),
        eq(conversationRuns.id, f.execution.run.id),
      ),
    );
  await recovered.startWorker();
  await expect.poll(() => callsFor(recoveredModel, child.id).length).toBe(1);
  expect(await writer.claimNext(f.scope, f.group.id, claim)).toBeUndefined();
  expect(callsFor(recoveredModel, f.execution.run.id)).toEqual([]);
  callsFor(recoveredModel, child.id)[0]!.respond("Finished before parent recovery");
  await expect
    .poll(async () => (await writer.getRun(f.scope, f.group.id, child.id)).state)
    .toBe("succeeded");
  await first.db
    .update(conversationRuns)
    .set({ nextAttemptAt: sql`clock_timestamp()` })
    .where(
      and(
        eq(conversationRuns.spaceId, f.scope.spaceId),
        eq(conversationRuns.id, f.execution.run.id),
      ),
    );
  await expect.poll(() => callsFor(recoveredModel, f.execution.run.id).length).toBe(1);
  expect(childResults(callsFor(recoveredModel, f.execution.run.id)[0]!.input)).toEqual([
    expect.objectContaining({
      runId: child.id,
      state: "succeeded",
      content: "Finished before parent recovery",
    }),
  ]);
  callsFor(recoveredModel, f.execution.run.id)[0]!.respond(
    "Recovered parent received the finished result",
  );
  await expect
    .poll(async () => (await writer.getRun(f.scope, f.group.id, f.execution.run.id)).state)
    .toBe("succeeded");
  const snapshot = await writer.snapshot(f.scope, f.group.id);
  expect(snapshot.runs).toHaveLength(2);
  expect(
    snapshot.runs.filter((run) => run.parentRunId === f.execution.run.id).map((run) => run.id),
  ).toEqual([child.id]);
  expect(callsFor(sourceModel, child.id)).toHaveLength(1);
  expect(callsFor(recoveredModel, child.id)).toHaveLength(1);
  expect(callsFor(recoveredModel, f.execution.run.id)).toHaveLength(1);
  expect(childResults(await checkpointFor(f.execution.run))).toEqual([
    expect.objectContaining({
      runId: child.id,
      state: "succeeded",
      content: "Finished before parent recovery",
    }),
  ]);
  const delegations = await first.db
    .select()
    .from(conversationDelegations)
    .where(eq(conversationDelegations.spaceId, f.scope.spaceId))
    .orderBy(conversationDelegations.createdAt, conversationDelegations.toolCallId);
  expect(delegations).toHaveLength(1);
  expect(delegations[0]).toMatchObject({ childRunId: child.id, state: "delivered" });
  const attempts = await first.db
    .select()
    .from(conversationRunAttempts)
    .where(
      and(
        eq(conversationRunAttempts.spaceId, f.scope.spaceId),
        eq(conversationRunAttempts.conversationId, f.group.id),
        eq(conversationRunAttempts.runId, child.id),
      ),
    )
    .orderBy(conversationRunAttempts.number);
  expect(attempts).toEqual([
    expect.objectContaining({ ownerId: "finished-child-source", number: 1, state: "released" }),
    expect.objectContaining({ ownerId: "finished-child-recovery", number: 2, state: "succeeded" }),
  ]);
  expect(await writer.claimNext(f.scope, f.group.id, claim)).toBeUndefined();
});
