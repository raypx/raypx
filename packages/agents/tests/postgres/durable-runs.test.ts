import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import {
  AiError,
  createAssistantMessageEventStream,
  type AssistantMessage,
  type ToolCall,
} from "@raypx/ai";
import { connectDatabase, migrateDatabase } from "@raypx/database";
import {
  conversationRunAttempts as attempts,
  conversationRunBackupJobs as backupJobs,
  conversationRunCheckpoints as checkpoints,
  conversationRunSteering as steering,
  conversationRuns as runs,
  conversationToolCalls as toolCalls,
  computers as computerRows,
  routineIdentities,
  spaceMemoryDocuments,
  spaceMemoryRevisions,
  spaceMembers,
  spaces,
  user,
} from "@raypx/database/schema";
import type { ConversationId } from "@raypx/core/agents";
import type { Effect } from "@raypx/core/approvals";
import type { SpaceScope } from "@raypx/spaces/server";
import { createSpaceAccess } from "@raypx/spaces/server/postgres";
import { createMemoryComputerProvider } from "@raypx/providers/computer";
import { createComputersService } from "@raypx/computers/server";
import { createComputersRepository } from "@raypx/computers/server/postgres";
import { createApprovalsService } from "../../src/approvals.js";
import { createComputerTools } from "../../src/computer-tools.js";
import {
  StaleRunFenceError,
  type ExecutionRun,
  type RunCheckpoint,
  type RunClaimOptions,
} from "../../src/conversations.js";
import {
  ConversationRunner,
  type ModelAccess,
  type ModelTurn,
  type RunTools,
} from "../../src/runner.js";
import {
  createAgentsRepository,
  createApprovalsRepository,
  createConversationsRepository,
} from "../../src/server/postgres.js";
import { publishConversationNotice } from "../../src/server/notice.js";

const url = process.env.TEST_DATABASE_URL;
if (!url || !/_test(?:_[a-z0-9]+)?$/.test(new URL(url).pathname))
  throw new Error("A newly created disposable *_test or *_test_<lane> database is required");
const first = connectDatabase(url),
  second = connectDatabase(url);
const writer = createConversationsRepository(first.db),
  competitor = createConversationsRepository(second.db);
const access = createSpaceAccess(first.db);
const memoryComputer = createMemoryComputerProvider();
const owner = `durable-${crypto.randomUUID()}`;
const teammate = `durable-member-${crypto.randomUUID()}`;
const claim: RunClaimOptions = {
  ownerId: "fixture-a",
  leaseMs: 30_000,
  timeoutMs: 300_000,
  backupMarginMs: 30_000,
};
const executors: ConversationRunner[] = [];
let scope: SpaceScope, foreignScope: SpaceScope, id: ConversationId;
const blank = (): RunCheckpoint => ({
  continuation: [],
  pendingCalls: [],
  rounds: 0,
  completed: false,
});
const agent = { name: "Durable", instructions: "Fixture", model: { modelId: "fixture" } };
beforeAll(async () => {
  await migrateDatabase(url);
  await first.db.insert(user).values([
    { id: owner, name: "Fixture", email: `${owner}@example.test` },
    { id: teammate, name: "Teammate", email: `${teammate}@example.test` },
  ]);
  const home = await access.create(owner, { name: "Durable test" });
  const foreign = await access.create(owner, { name: "Foreign durable test" });
  scope = await access.resolve(owner, home.space.id);
  await first.db
    .insert(spaceMembers)
    .values({ spaceId: scope.spaceId, accountId: teammate, role: "member" });
  foreignScope = await access.resolve(owner, foreign.space.id);
});
beforeEach(async () => {
  id = (await createAgentsRepository(first.db).create(scope, agent)).conversation.id;
});
afterEach(async () => {
  await Promise.all(executors.splice(0).map((executor) => executor.close()));
});
afterAll(async () => {
  try {
    // The retained Computer lifecycle deliberately restricts owner deletion.
    // Release these in-memory fixture resources before deleting their Space.
    if (scope) await first.db.delete(computerRows).where(eq(computerRows.spaceId, scope.spaceId));
    if (scope) await first.db.delete(spaces).where(eq(spaces.id, scope.spaceId));
    if (foreignScope) await first.db.delete(spaces).where(eq(spaces.id, foreignScope.spaceId));
    await first.db.delete(user).where(eq(user.id, teammate));
    await first.db.delete(user).where(eq(user.id, owner));
  } finally {
    await Promise.all([first.close(), second.close()]);
  }
});
const send = (text = "Start", conversationId = id) =>
  writer.send(scope, conversationId, { idempotencyKey: crypto.randomUUID(), text });
async function expire(run: Pick<ExecutionRun, "id" | "conversationId">) {
  await first.db
    .update(runs)
    .set({ leaseExpiresAt: sql`clock_timestamp() - interval '1 millisecond'` })
    .where(
      and(
        eq(runs.spaceId, scope.spaceId),
        eq(runs.conversationId, run.conversationId),
        eq(runs.id, run.id),
      ),
    );
}
function assistant(text = "", tools: ToolCall[] = []): AssistantMessage {
  return {
    role: "assistant",
    content: [...(text ? [{ type: "text" as const, text }] : []), ...tools],
    api: "openai-responses",
    provider: "fixture",
    model: "fixture",
    stopReason: tools.length ? "toolUse" : "stop",
    timestamp: Date.now(),
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
function fixture() {
  const calls: Array<{ input: ModelTurn; respond(text: string, tools?: ToolCall[]): void }> = [];
  const models: ModelAccess = {
    async resolve() {
      return {
        connectionId: "fixture-connection",
        stream(input) {
          const stream = createAssistantMessageEventStream();
          calls.push({
            input: structuredClone(input),
            respond: (text, tools) => stream.end(assistant(text, tools)),
          });
          return stream;
        },
      };
    },
    close() {},
  };
  return { models, calls };
}
function runner(repository: typeof writer, models: ModelAccess, tools?: RunTools) {
  const executor = new ConversationRunner(repository, models, undefined, undefined, tools, {
    leaseMs: 30_000,
    heartbeatMs: 5_000,
    scanIntervalMs: 20,
    attemptTimeoutMs: 300_000,
  });
  executors.push(executor);
  return executor;
}
function toolRuntime(repository = writer) {
  const memory = memoryComputer;
  let changes = 0;
  const provider = {
    ...memory,
    async write(...args: Parameters<typeof memory.write>) {
      changes++;
      return memory.write(...args);
    },
  };
  const computers = createComputersService(createComputersRepository(first.db), provider, "memory");
  const approvals = createApprovalsService(createApprovalsRepository(first.db));
  const tools = createComputerTools(computers, provider, [], repository.pinResources);
  return { provider, approvals, tools, changes: () => changes };
}
const writeCall: ToolCall = {
  type: "toolCall",
  id: "write-one",
  name: "computer_write_file",
  arguments: { path: "note.txt", content: "Fixture body" },
};

it("persists takeover-paused input as a fenced waiting Run and ordered state event", async () => {
  await send();
  const execution = (await writer.claimNext(scope, id, claim))!;
  try {
    await writer.setComputerInputPaused!(scope, execution.run, true);
    expect(await competitor.getRun(scope, id, execution.run.id)).toMatchObject({
      state: "waiting",
      computerInputPaused: true,
    });
    const snapshot = await competitor.snapshot(scope, id);
    expect(snapshot.runs.find((run) => run.id === execution.run.id)).toMatchObject({
      computerInputPaused: true,
    });
    const events = await competitor.events(scope, id, 0, 100);
    expect(events.status).toBe("events");
    if (events.status !== "events") throw new Error("Expected state events");
    expect(events.events.at(-1)?.event).toMatchObject({
      kind: "run.state",
      state: "waiting",
      computerInputPaused: true,
    });
    await expect(
      writer.setComputerInputPaused!(foreignScope, execution.run, false),
    ).rejects.toThrow("Space record not found");
    await competitor.setComputerInputPaused!(scope, execution.run, false);
    expect(await writer.getRun(scope, id, execution.run.id)).toMatchObject({
      state: "running",
      computerInputPaused: false,
    });
    await writer.setComputerInputPaused!(scope, execution.run, true);
    await expire(execution.run);
    await expect(writer.setComputerInputPaused!(scope, execution.run, true)).rejects.toThrow(
      StaleRunFenceError,
    );
  } finally {
    await writer.stop(scope, id, execution.run.id);
  }
  expect(await writer.getRun(scope, id, execution.run.id)).toMatchObject({
    state: "cancelled",
    computerInputPaused: false,
  });
  const terminal = await writer.events(scope, id, 0, 100);
  if (terminal.status !== "events") throw new Error("Expected terminal state event");
  expect(terminal.events.at(-1)?.event).toMatchObject({
    kind: "run.state",
    state: "cancelled",
    computerInputPaused: false,
  });
});

it.each([false, true])(
  "preserves steering turn order in the next Run's base history (queued before start: %s)",
  async (queuedBeforeStart) => {
    await send("A trigger");
    if (queuedBeforeStart) await send("B queued trigger");
    const original = (await writer.claimNext(scope, id, claim))!;
    await writer.executionStarted(scope, original.run);
    const working: RunCheckpoint = { ...blank(), continuation: [assistant("Working")] };
    await writer.commitTurn(scope, original.run, {
      checkpoint: working,
      text: "Working",
      segmentId: crypto.randomUUID(),
      firstResponseAt: new Date().toISOString(),
    });
    const steeringText = queuedBeforeStart ? "C steering" : "B steering";
    await send(steeringText);
    const steered = await writer.consumeSteering(scope, original.run, working);
    const answerText = `Answer to ${steeringText}`;
    const completed: RunCheckpoint = {
      ...steered,
      continuation: [...steered.continuation, assistant(answerText)],
      completed: true,
    };
    await writer.commitTurn(scope, original.run, {
      checkpoint: completed,
      text: answerText,
      segmentId: crypto.randomUUID(),
    });
    await writer.finish(scope, original.run, null);
    if (!queuedBeforeStart) await send("D next trigger");
    const next = (await competitor.claimNext(scope, id, { ...claim, ownerId: "fixture-b" }))!;
    expect(next.history.map(({ role, text }) => [role, text])).toEqual([
      ["user", "A trigger"],
      ["assistant", "Working"],
      ["user", steeringText],
      ["assistant", answerText],
      ["user", queuedBeforeStart ? "B queued trigger" : "D next trigger"],
    ]);
    await competitor.finish(scope, next.run, null);
  },
);

it("uses each queued Run's fresh initiating member when another member wakes the conversation", async () => {
  const other = await access.resolve(teammate, scope.spaceId);
  await send("Owner work");
  await writer.send(other, id, { text: "Teammate work", idempotencyKey: "teammate-queued" });
  const ownerExecution = (await writer.claimNext(other, id, claim))!;
  expect(ownerExecution.scope.member.accountId).toBe(owner);
  await writer.finish(ownerExecution.scope, ownerExecution.run, null);
  const teammateExecution = (await competitor.claimNext(scope, id, {
    ...claim,
    ownerId: "fixture-b",
  }))!;
  expect(teammateExecution.scope.member.accountId).toBe(teammate);
  expect(teammateExecution.scope.member.role).toBe("member");
  await competitor.finish(teammateExecution.scope, teammateExecution.run, null);
});

it("executes once when two independent runners start the same committed Run", async () => {
  await send();
  const a = fixture(),
    b = fixture();
  const firstRunner = runner(writer, a.models),
    secondRunner = runner(competitor, b.models);
  await Promise.all([firstRunner.startWorker(), secondRunner.startWorker()]);
  await expect.poll(() => a.calls.length + b.calls.length).toBe(1);
  (a.calls[0] ?? b.calls[0])!.respond("Exactly one reply");
  await expect
    .poll(async () => (await writer.snapshot(scope, id)).runs[0]?.state)
    .toBe("succeeded");
  const snapshot = await writer.snapshot(scope, id);
  expect(snapshot.segments.map((segment) => segment.text)).toEqual(["Exactly one reply"]);
  expect(
    await first.db
      .select()
      .from(attempts)
      .where(and(eq(attempts.spaceId, scope.spaceId), eq(attempts.conversationId, id))),
  ).toHaveLength(1);
});

it("rejects every stale fence and commits turn events with the last checkpoint atomically", async () => {
  await send();
  const original = (await writer.claimNext(scope, id, claim))!;
  await writer.executionStarted(scope, original.run);
  const checkpoint: RunCheckpoint = {
    ...blank(),
    continuation: [assistant("Committed")],
    completed: true,
  };
  const failing = createConversationsRepository(first.db, async (tx, notice) => {
    await publishConversationNotice(tx, notice);
    throw new Error("rollback turn");
  });
  await expect(
    failing.commitTurn(scope, original.run, {
      checkpoint,
      text: "Rolled back",
      segmentId: crypto.randomUUID(),
    }),
  ).rejects.toThrow("rollback turn");
  expect((await writer.snapshot(scope, id)).segments).toHaveLength(0);
  const [saved] = await first.db
    .select()
    .from(checkpoints)
    .where(and(eq(checkpoints.spaceId, scope.spaceId), eq(checkpoints.conversationId, id)));
  expect(saved!.data).toMatchObject({ completed: false, continuation: [] });
  const firstResponseAt = new Date().toISOString();
  expect(
    await writer.commitTurn(scope, original.run, {
      checkpoint,
      text: "Committed",
      segmentId: crypto.randomUUID(),
      firstResponseAt,
    }),
  ).toBe(true);
  await expire(original.run);
  const resumed = (await competitor.claimNext(scope, id, { ...claim, ownerId: "fixture-b" }))!;
  expect(resumed.run.fence).toBe(original.run.fence + 1);
  expect(resumed.checkpoint).toMatchObject(checkpoint);
  const before = await writer.snapshot(scope, id);
  for (const write of [
    () =>
      writer.commitTurn(scope, original.run, {
        checkpoint,
        text: "Late",
        segmentId: crypto.randomUUID(),
      }),
    () => writer.saveCheckpoint(scope, original.run, blank()),
    () => writer.executionStarted(scope, original.run),
    () => writer.consumeSteering(scope, original.run, blank()),
    () => writer.finish(scope, original.run, null),
    () => writer.pinResources(scope, original.run, { connectionId: "late" }),
    () => writer.release(scope, original.run),
  ])
    await expect(write()).rejects.toBeInstanceOf(StaleRunFenceError);
  expect(await writer.heartbeat(scope, original.run, 30_000)).toBe(false);
  expect(await writer.snapshot(scope, id)).toEqual(before);
  await competitor.finish(scope, resumed.run, null);
  expect((await writer.snapshot(scope, id)).runs[0]!.firstResponseAt).toBe(firstResponseAt);
});

it("recovers pending calls from a checkpoint without re-executing a recorded Computer effect", async () => {
  const runtime = toolRuntime();
  await runtime.approvals.updateSettings(owner, {
    expectedRevision: (await runtime.approvals.getSettings(owner)).revision,
    mode: "never",
    rules: [],
  });
  await send();
  const original = (await writer.claimNext(scope, id, claim))!;
  await runtime.tools.initialize!(scope, original.run, new AbortController().signal);
  await writer.executionStarted(scope, original.run);
  await writer.pinResources(scope, original.run, { connectionId: "fixture-connection" });
  const checkpoint: RunCheckpoint = {
    ...blank(),
    rounds: 1,
    continuation: [assistant("Before crash", [writeCall])],
    pendingCalls: [writeCall],
  };
  const firstResponseAt = new Date().toISOString();
  const call = runtime.tools.prepare(writeCall);
  await writer.commitTurn(scope, original.run, {
    checkpoint,
    tools: [
      {
        toolCallId: call.id,
        toolName: call.name,
        target: call.target,
        argumentSummary: call.argumentSummary,
      },
    ],
    text: "Before crash",
    segmentId: crypto.randomUUID(),
    firstResponseAt,
  });
  const signal = new AbortController().signal;
  await runtime.approvals.executeEffect(
    scope,
    original.run,
    call,
    () => runtime.tools.execute(scope, original.run, call, signal),
    signal,
  );
  expect(runtime.changes()).toBe(1);
  // Drop the owner after effect outcome commit, before its tool-result checkpoint.
  await expire(original.run);
  const model = fixture();
  const recovered = runner(competitor, model.models, runtime);
  await recovered.startWorker();
  await expect.poll(() => model.calls.length).toBe(1);
  expect(
    model.calls[0]!.input.continuation?.filter((message) => message.role === "toolResult"),
  ).toHaveLength(1);
  expect(runtime.changes()).toBe(1);
  model.calls[0]!.respond("Recovered");
  await expect
    .poll(async () => (await writer.snapshot(scope, id)).runs[0]!.state)
    .toBe("succeeded");
  const snapshot = await writer.snapshot(scope, id);
  expect(snapshot.segments.map((segment) => segment.text)).toEqual(["Before crash", "Recovered"]);
  expect(snapshot.runs[0]!.firstResponseAt).toBe(firstResponseAt);
  const page = await writer.events(scope, id, 0, 100);
  if (page.status !== "events") throw new Error("Unexpected retention");
  expect(page.events.filter(({ event }) => event.kind === "tool.started")).toHaveLength(1);
  expect(page.events.filter(({ event }) => event.kind === "tool.finished")).toHaveLength(1);
  expect(snapshot.toolActivity).toMatchObject([{ toolCallId: call.id, outcome: "succeeded" }]);
});

it("rejects stale approval creation, polling and effect writes after takeover", async () => {
  const approvals = createApprovalsRepository(first.db);
  const runtime = toolRuntime();
  await send();
  const original = (await writer.claimNext(scope, id, claim))!;
  await writer.executionStarted(scope, original.run);
  const call = runtime.tools.prepare(writeCall);
  const createdAt = new Date();
  const effect: Effect = {
    spaceId: scope.spaceId,
    conversationId: id,
    runId: original.run.id,
    key: "a".repeat(64),
    argumentHash: "b".repeat(64),
    toolCallId: call.id,
    toolName: call.name,
    state: "intent",
    result: null,
    createdAt: createdAt.toISOString(),
    completedAt: null,
  };
  await approvals.beginEffect(scope, original.run, effect, createdAt);
  const request = await approvals.createRequest(
    scope,
    original.run,
    call,
    new Date(createdAt.getTime() + 60_000),
    createdAt,
  );
  await expire(original.run);
  const resumed = (await competitor.claimNext(scope, id, { ...claim, ownerId: "fixture-b" }))!;
  const before = await writer.snapshot(scope, id);
  for (const write of [
    () =>
      approvals.createRequest(scope, original.run, call, new Date(Date.now() + 60_000), new Date()),
    () => approvals.pollRequest(scope, original.run, request.id, new Date()),
    () => approvals.cancelRequest(scope, original.run, request.id, new Date()),
    () =>
      approvals.beginEffect(scope, original.run, { ...effect, key: "c".repeat(64) }, new Date()),
    () => approvals.completeEffect(scope, effect.key, "succeeded", "{}", new Date(), original.run),
  ])
    await expect(write()).rejects.toBeInstanceOf(StaleRunFenceError);
  expect(await writer.snapshot(scope, id)).toEqual(before);
  await competitor.finish(scope, resumed.run, "MODEL_FAILED");
});

it("recovers a dropped runner on the worker scan interval without repeating committed turns", async () => {
  const runtime = toolRuntime();
  await runtime.approvals.updateSettings(owner, {
    expectedRevision: (await runtime.approvals.getSettings(owner)).revision,
    mode: "never",
    rules: [],
  });
  const a = fixture(),
    b = fixture();
  let dropped = false;
  const ownerRepository = {
    ...writer,
    heartbeat: (...args: Parameters<typeof writer.heartbeat>) => {
      if (dropped) return new Promise<boolean>(() => {});
      return writer.heartbeat(...args);
    },
  };
  const firstRunner = runner(ownerRepository, a.models, runtime);
  const secondRunner = runner(competitor, b.models, runtime);
  await firstRunner.conversations.send(scope, id, { text: "Work", idempotencyKey: "crash-owner" });
  await expect.poll(() => a.calls.length).toBe(1);
  a.calls[0]!.respond("Committed turn", [writeCall]);
  await expect.poll(() => a.calls.length).toBe(2);
  expect(runtime.changes()).toBe(1);
  dropped = true;
  const original = (await writer.snapshot(scope, id)).runs[0]!;
  await expire(original);
  // No close/release: the other instance recovers solely from storage and scans.
  await secondRunner.startWorker();
  await expect.poll(() => b.calls.length).toBe(1);
  expect(runtime.changes()).toBe(1);
  expect(
    b.calls[0]!.input.continuation?.filter((message) => message.role === "toolResult"),
  ).toHaveLength(1);
  b.calls[0]!.respond("Recovered after crash");
  await expect
    .poll(async () => (await writer.snapshot(scope, id)).runs[0]!.state)
    .toBe("succeeded");
  expect((await writer.snapshot(scope, id)).segments.map((segment) => segment.text)).toEqual([
    "Committed turn",
    "Recovered after crash",
  ]);
});

it("hands an approval wait to another runner and delivers waiting steering without a second Run", async () => {
  const runtime = toolRuntime();
  await runtime.approvals.updateSettings(owner, {
    expectedRevision: (await runtime.approvals.getSettings(owner)).revision,
    mode: "ask",
    rules: [],
  });
  const a = fixture(),
    b = fixture();
  const firstRunner = runner(writer, a.models, runtime);
  const secondRunner = runner(competitor, b.models, runtime);
  await firstRunner.conversations.send(scope, id, {
    text: "Write",
    idempotencyKey: "approval-handover",
  });
  await expect.poll(() => a.calls.length).toBe(1);
  a.calls[0]!.respond("Review this change", [writeCall]);
  await expect.poll(async () => (await writer.snapshot(scope, id)).runs[0]!.state).toBe("waiting");
  const [request] = await runtime.approvals.listPending(scope);
  expect(request).toBeDefined();
  await firstRunner.close();
  await secondRunner.startWorker();
  await send("Also report what changed");
  await runtime.approvals.answer(scope, request!.id, { decision: "approved" });
  await expect.poll(() => b.calls.length).toBe(1);
  expect(b.calls[0]!.input.continuation).toContainEqual(
    expect.objectContaining({ role: "user", content: "Also report what changed" }),
  );
  b.calls[0]!.respond("Saved and reported");
  await expect
    .poll(async () => (await writer.snapshot(scope, id)).runs[0]!.state)
    .toBe("succeeded");
  expect((await writer.snapshot(scope, id)).runs).toHaveLength(1);
  expect(runtime.changes()).toBe(1);
  expect(await runtime.approvals.listPending(scope)).toEqual([]);
});

it("fails explicitly when a resumed pinned model is gone", async () => {
  await send();
  const original = (await writer.claimNext(scope, id, claim))!;
  await writer.pinResources(scope, original.run, { connectionId: "fixture-connection" });
  await expire(original.run);
  const worker = runner(competitor, {
    async resolve() {
      throw new AiError("AI_MODEL_NOT_FOUND");
    },
    close() {},
  });
  await worker.startWorker();
  await expect
    .poll(async () => (await writer.snapshot(scope, id)).runs[0])
    .toMatchObject({ state: "failed", failureCode: "MODEL_UNAVAILABLE" });
});

it("fails a resumed Run explicitly when its pinned Computer was removed", async () => {
  const runtime = toolRuntime();
  await send();
  const original = (await writer.claimNext(scope, id, claim))!;
  await runtime.tools.initialize!(scope, original.run, new AbortController().signal);
  await writer.executionStarted(scope, original.run);
  await writer.pinResources(scope, original.run, { connectionId: "fixture-connection" });
  await first.db
    .delete(computerRows)
    .where(
      and(eq(computerRows.spaceId, scope.spaceId), eq(computerRows.id, original.run.computerId!)),
    );
  await expire(original.run);
  // Drive eligibility through PostgreSQL time, without waiting for lease expiry.
  expect(original.run.computerId).not.toBeNull();
  expect((await competitor.scanRunnable()).map((target) => target.id)).toContain(id);
  const model = fixture();
  await runner(competitor, model.models, runtime).startWorker();
  await expect
    .poll(async () => (await writer.snapshot(scope, id)).runs[0])
    .toMatchObject({ state: "failed", failureCode: "COMPUTER_UNAVAILABLE" });
  expect(model.calls).toHaveLength(0);
});

it("starts another Agent immediately while one Run is stuck and steers the running Run", async () => {
  const otherId = (await createAgentsRepository(first.db).create(scope, agent)).conversation.id;
  const model = fixture();
  const executor = runner(writer, model.models);
  await executor.conversations.send(scope, id, { text: "Stuck", idempotencyKey: "stuck" });
  await expect.poll(() => model.calls.length).toBe(1);
  await executor.conversations.send(scope, otherId, {
    text: "Independent",
    idempotencyKey: "independent",
  });
  await expect.poll(() => model.calls.length).toBe(2);
  await executor.conversations.send(scope, id, {
    text: "Steering",
    idempotencyKey: "running-steering",
  });
  model.calls[0]!.respond("First boundary");
  await expect.poll(() => model.calls.length).toBe(3);
  expect(model.calls[2]!.input.continuation).toContainEqual(
    expect.objectContaining({ role: "user", content: "Steering" }),
  );
  expect((await writer.snapshot(scope, id)).runs).toHaveLength(1);
  model.calls[1]!.respond("Independent reply");
  model.calls[2]!.respond("Steered reply");
  await expect
    .poll(async () => (await writer.snapshot(scope, id)).runs[0]!.state)
    .toBe("succeeded");
});

it("deletes successful backups, reschedules clean failures and claims crash backups once with SKIP LOCKED", async () => {
  await send();
  const original = (await writer.claimNext(scope, id, claim))!;
  let [job] = await first.db
    .select()
    .from(backupJobs)
    .where(and(eq(backupJobs.spaceId, scope.spaceId), eq(backupJobs.conversationId, id)));
  expect(job!.runAt.getTime()).toBe(Date.parse(original.run.timeoutAt) + claim.backupMarginMs);
  const retryAt = new Date(Date.now() + 60_000);
  await writer.finish(scope, original.run, "MODEL_RATE_LIMITED", retryAt);
  [job] = await first.db
    .select()
    .from(backupJobs)
    .where(and(eq(backupJobs.spaceId, scope.spaceId), eq(backupJobs.conversationId, id)));
  expect(job!.runAt.toISOString()).toBe(retryAt.toISOString());
  expect(await competitor.claimNext(scope, id, { ...claim, ownerId: "fixture-b" })).toBeUndefined();
  await first.db
    .update(runs)
    .set({ nextAttemptAt: sql`clock_timestamp()` })
    .where(and(eq(runs.spaceId, scope.spaceId), eq(runs.conversationId, id)));
  const crashed = (await competitor.claimNext(scope, id, { ...claim, ownerId: "fixture-b" }))!;
  await expire(crashed.run);
  await first.db
    .update(backupJobs)
    .set({ runAt: sql`clock_timestamp()` })
    .where(and(eq(backupJobs.spaceId, scope.spaceId), eq(backupJobs.conversationId, id)));
  const [a, b] = await Promise.all([
    writer.claimBackupJobs("backup-a", 30_000),
    competitor.claimBackupJobs("backup-b", 30_000),
  ]);
  expect([...a, ...b].filter((target) => target.id === id)).toHaveLength(1);
  const resumed = (await writer.claimNext(scope, id, claim))!;
  await writer.finish(scope, resumed.run, null);
  expect(
    await first.db
      .select()
      .from(backupJobs)
      .where(and(eq(backupJobs.spaceId, scope.spaceId), eq(backupJobs.conversationId, id))),
  ).toEqual([]);
});

it("enforces same-Space durable references and removes all records with the Space", async () => {
  const home = await access.create(owner, { name: "Disposable cascade" });
  const isolated = await access.resolve(owner, home.space.id);
  const conversation = (await createAgentsRepository(first.db).create(isolated, agent))
    .conversation;
  await writer.send(isolated, conversation.id, { text: "Start", idempotencyKey: "cascade" });
  const execution = (await writer.claimNext(isolated, conversation.id, claim))!;
  await writer.send(isolated, conversation.id, {
    text: "Steering",
    idempotencyKey: "cascade-steering",
  });
  await expect(
    first.db.insert(attempts).values({
      spaceId: foreignScope.spaceId,
      conversationId: conversation.id,
      runId: execution.run.id,
      id: crypto.randomUUID(),
      ownerId: "cross-space",
      fence: 1,
      number: 1,
      timeoutAt: new Date(Date.now() + 60_000),
    }),
  ).rejects.toMatchObject({ cause: { code: "23503" } });
  for (const table of [runs, attempts, checkpoints, steering, backupJobs])
    expect(
      await first.db.select().from(table).where(eq(table.spaceId, isolated.spaceId)),
    ).toHaveLength(1);
  await first.db.delete(spaces).where(eq(spaces.id, isolated.spaceId));
  for (const table of [runs, attempts, checkpoints, steering, backupJobs])
    expect(await first.db.select().from(table).where(eq(table.spaceId, isolated.spaceId))).toEqual(
      [],
    );
});

it("commits tool lifecycle once across a resumed fence and retains bounded snapshots after event pruning", async () => {
  await send();
  const original = (await writer.claimNext(scope, id, claim))!;
  const summary = {
    toolCallId: "read-lifecycle",
    toolName: "computer_read_file",
    target: "notes.txt",
    argumentSummary: "Path: notes.txt",
  };
  await writer.beginTool(scope, original.run, summary);
  await writer.beginTool(scope, original.run, summary);
  await writer.release(scope, original.run);
  const resumed = (await competitor.claimNext(scope, id, { ...claim, ownerId: "fixture-b" }))!;
  await competitor.beginTool(scope, resumed.run, summary);
  await expect(writer.beginTool(scope, original.run, summary)).rejects.toBeInstanceOf(
    StaleRunFenceError,
  );
  await competitor.saveCheckpoint(scope, resumed.run, blank(), {
    toolCallId: summary.toolCallId,
    outcome: "succeeded",
    exitStatus: null,
  });
  await competitor.saveCheckpoint(scope, resumed.run, blank(), {
    toolCallId: summary.toolCallId,
    outcome: "succeeded",
    exitStatus: null,
  });
  const page = await writer.events(scope, id, 0, 100);
  if (page.status !== "events") throw new Error("Unexpected retention");
  const lifecycle = page.events.filter(
    ({ event }) => event.kind === "tool.started" || event.kind === "tool.finished",
  );
  expect(lifecycle.map(({ event }) => event.kind)).toEqual(["tool.started", "tool.finished"]);
  expect(lifecycle[1]!.event).toMatchObject({
    ...summary,
    outcome: "succeeded",
    durationMs: expect.any(Number),
    exitStatus: null,
  });
  expect(page.events.map(({ event }) => event.sequence)).toEqual(
    Array.from({ length: page.events.length }, (_, i) => i + 1),
  );
  await writer.retainAfter(scope, id, page.cursor);
  await competitor.beginTool(scope, resumed.run, summary);
  const snapshot = await writer.snapshot(scope, id);
  expect(snapshot.toolActivity).toHaveLength(1);
  expect(snapshot.toolActivityTruncated).toBe(false);
  expect(snapshot.toolActivity![0]).toMatchObject({ ...summary, outcome: "succeeded" });
  for (let index = 0; index < 101; index++)
    await competitor.beginTool(scope, resumed.run, {
      ...summary,
      toolCallId: `bounded-${String(index).padStart(3, "0")}`,
    });
  const bounded = await writer.snapshot(scope, id);
  expect(bounded.toolActivity).toHaveLength(100);
  expect(bounded.toolActivityTruncated).toBe(true);
  const [otherSpace] = await first.db
    .select()
    .from(toolCalls)
    .where(and(eq(toolCalls.spaceId, foreignScope.spaceId), eq(toolCalls.runId, resumed.run.id)));
  expect(otherSpace).toBeUndefined();
  const temporary = await access.create(owner, { name: "Lifecycle deletion" });
  const temporaryScope = await access.resolve(owner, temporary.space.id);
  const temporaryId = (await createAgentsRepository(first.db).create(temporaryScope, agent))
    .conversation.id;
  await writer.send(temporaryScope, temporaryId, { idempotencyKey: "temporary", text: "Start" });
  const temporaryRun = (await writer.claimNext(temporaryScope, temporaryId, claim))!;
  await writer.beginTool(temporaryScope, temporaryRun.run, summary);
  await first.db.delete(spaces).where(eq(spaces.id, temporary.space.id));
  expect(
    await first.db.select().from(toolCalls).where(eq(toolCalls.spaceId, temporary.space.id)),
  ).toEqual([]);
});

it("starts all pending calls in the model checkpoint transaction and cancels unexecuted calls", async () => {
  await send();
  const execution = (await writer.claimNext(scope, id, claim))!;
  const summaries = ["first-pending", "later-pending"].map((toolCallId) => ({
    toolCallId,
    toolName: "computer_write_file",
    target: "notes.txt",
    argumentSummary: "Write file: notes.txt",
  }));
  const pending: ToolCall[] = summaries.map((summary) => ({
    type: "toolCall",
    id: summary.toolCallId,
    name: summary.toolName,
    arguments: { path: "notes.txt", content: "private-not-in-activity" },
  }));
  const checkpoint: RunCheckpoint = { ...blank(), pendingCalls: pending, rounds: 1 };
  await writer.commitTurn(scope, execution.run, { checkpoint, tools: summaries });
  expect((await writer.snapshot(scope, id)).toolActivity?.map((tool) => tool.toolCallId)).toEqual([
    "first-pending",
    "later-pending",
  ]);
  await writer.stop(scope, id, execution.run.id);
  const activity = (await writer.snapshot(scope, id)).toolActivity!;
  expect(activity).toHaveLength(2);
  expect(activity.every((tool) => tool.outcome === "cancelled")).toBe(true);
  const page = await writer.events(scope, id, 0, 100);
  if (page.status !== "events") throw new Error("Unexpected retention");
  expect(page.events.filter(({ event }) => event.kind === "tool.started")).toHaveLength(2);
  expect(page.events.filter(({ event }) => event.kind === "tool.finished")).toHaveLength(2);
  expect(JSON.stringify(activity)).not.toContain("private-not-in-activity");
});

async function seedMemorySource(run: ExecutionRun, documentId: string, revision: number) {
  const timestamp = new Date();
  const body = {
    id: documentId,
    spaceId: run.spaceId,
    scope: "agent" as const,
    agentId: run.agentId,
    title: "Pinned fixture",
    text: "Pinned fixture content",
    pinned: false,
    removed: false,
    revision,
    attribution: { speaker: null, source: null },
    provenance: {
      kind: "member",
      accountId: run.memberAccountId,
      runId: null,
      untrustedInput: false,
    },
    createdAt: timestamp.toISOString(),
    updatedAt: timestamp.toISOString(),
  };
  await first.db.insert(spaceMemoryDocuments).values({
    ...body,
    authorAccountId: run.memberAccountId,
    createdAt: timestamp,
    updatedAt: timestamp,
  });
  for (let number = 1; number <= revision; number++) {
    const reason = number === 1 ? "created" : "edited";
    await first.db.insert(spaceMemoryRevisions).values({
      spaceId: run.spaceId,
      documentId,
      revision: number,
      reason,
      body: { ...body, revision: number, reason },
      createdAt: timestamp,
    });
  }
}

it("pins the routine due time and private untrusted context at the original first start", async () => {
  await send("Saved routine prompt");
  const dueAt = new Date("2026-11-14T00:00:00.000Z");
  const firstStart = new Date("2026-11-14T00:15:00.000Z");
  await first.db
    .insert(routineIdentities)
    .values({ spaceId: scope.spaceId, id: "routine-fixture" });
  await first.db
    .update(runs)
    .set({
      trigger: "webhook",
      routineId: "routine-fixture",
      routineDueAt: dueAt,
      routineTimezone: "Asia/Shanghai",
      inboundProvenance: {
        kind: "webhook",
        routineId: "routine-fixture",
        deliveryId: "delivery-fixture",
      },
      inboundContent: JSON.stringify({ source: "webhook", content: { text: "external input" } }),
    })
    .where(and(eq(runs.spaceId, scope.spaceId), eq(runs.conversationId, id)));
  const clocked = createConversationsRepository(first.db, undefined, { now: () => firstStart });
  const execution = (await clocked.claimNext(scope, id, claim))!;
  expect(execution.run.untrustedInput).toBe(true);
  expect(execution.history.some((entry) => entry.text.includes("Untrusted inbound context"))).toBe(
    true,
  );
  expect(execution.history.some((entry) => entry.text.includes("external input"))).toBe(true);
  expect(await clocked.executionStarted(scope, execution.run)).toBe(firstStart.toISOString());
  await seedMemorySource(execution.run, "pinned", 2);
  await clocked.saveCheckpoint(scope, execution.run, {
    ...execution.checkpoint,
    memory: {
      revisions: [{ documentId: "pinned", revision: 2 }],
      context: "Pinned context",
      untrustedInput: true,
    },
  });
  await clocked.release(scope, execution.run);
  const resumed = (await competitor.claimNext(scope, id, { ...claim, ownerId: "fixture-b" }))!;
  expect(resumed.run.routineDueAt).toBe(dueAt.toISOString());
  expect(await competitor.executionStarted(scope, resumed.run)).toBe(firstStart.toISOString());
  expect(resumed.checkpoint.memory?.revisions).toEqual([{ documentId: "pinned", revision: 2 }]);
  expect(resumed.history).toEqual(execution.history);
  const snapshot = await competitor.snapshot(scope, id);
  expect(snapshot.messages.map((message) => message.text)).toEqual(["Saved routine prompt"]);
  expect(JSON.stringify(snapshot)).not.toContain("external input");
  await competitor.stop(scope, id, resumed.run.id);
});

it("keeps untrusted recalled-memory provenance on subsequent conversation Runs", async () => {
  await send("First prompt");
  const initial = (await writer.claimNext(scope, id, claim))!;
  await writer.executionStarted(scope, initial.run);
  await seedMemorySource(initial.run, "removed-memory", 1);
  await writer.commitTurn(scope, initial.run, {
    checkpoint: {
      ...initial.checkpoint,
      completed: true,
      memory: {
        revisions: [{ documentId: "removed-memory", revision: 1 }],
        context: "untrusted prior memory",
        untrustedInput: true,
      },
    },
    segmentId: crypto.randomUUID(),
    text: "Reply derived from recalled context",
    firstResponseAt: new Date().toISOString(),
  });
  await writer.finish(scope, initial.run, null);
  await send("Second prompt after source memory removal");
  const next = (await competitor.claimNext(scope, id, { ...claim, ownerId: "fixture-b" }))!;
  expect(next.run.untrustedInput).toBe(true);
  expect(next.checkpoint.untrustedInput).toBe(true);
  expect(next.history.some((entry) => entry.text === "Reply derived from recalled context")).toBe(
    true,
  );
  await competitor.stop(scope, id, next.run.id);
});
