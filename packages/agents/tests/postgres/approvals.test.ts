import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";
import { and, asc, eq } from "drizzle-orm";
import { connectDatabase, migrateDatabase } from "@raypx/database";
import {
  approvalRules,
  approvalSettings,
  approvalRequests,
  conversationEvents,
  conversationEffects,
  conversationRuns,
  conversationToolCalls,
  spaceMembers,
  spaces,
  user,
} from "@raypx/database/schema";
import type { Effect } from "@raypx/core/approvals";
import {
  StaleRunFenceError,
  type ExecutionRun,
  type RunClaimOptions,
} from "../../src/conversations.js";
import type { SpaceScope } from "@raypx/spaces/server";
import { createSpaceAccess } from "@raypx/spaces/server/postgres";
import { createApprovalsService, type ApprovalCall } from "../../src/approvals.js";
import { EFFECT_INTENT_TIMEOUT_MS } from "../../src/tool-limits.js";
import {
  createAgentsRepository,
  createApprovalsRepository,
  createConversationsRepository,
} from "../../src/server/postgres.js";

const url = process.env.TEST_DATABASE_URL;
if (!url || !new URL(url).pathname.endsWith("_test"))
  throw new Error("A newly created disposable *_test database is required");
const first = connectDatabase(url),
  second = connectDatabase(url);
const access = createSpaceAccess(first.db);
const approvals = createApprovalsRepository(first.db),
  competing = createApprovalsRepository(second.db);
const conversations = createConversationsRepository(first.db);
const owner = `approvals-${crypto.randomUUID()}`,
  member = `approvals-member-${crypto.randomUUID()}`;
let scope: SpaceScope, other: SpaceScope, foreignScope: SpaceScope, run: ExecutionRun;
const extraSpaces: string[] = [];
const claimOptions: RunClaimOptions = {
  ownerId: "approval-fixture",
  leaseMs: 60_000,
  timeoutMs: 300_000,
  backupMarginMs: 30_000,
};
function uniqueEffectKey() {
  return crypto.randomUUID().replaceAll("-", "").repeat(2);
}
const call: ApprovalCall = {
  id: "write-call",
  name: "computer_write_file",
  arguments: { path: "note.txt", content: "this full body must never appear in events" },
  argumentSummary: "Write note.txt (41 characters)",
  target: "note.txt",
  changes: true,
};
const createdAt = new Date("2026-01-01T00:00:00Z"),
  expiresAt = new Date("2026-01-01T00:10:00Z");
beforeAll(async () => {
  await migrateDatabase(url);
  await first.db.insert(user).values([
    { id: owner, name: "Owner", email: `${owner}@example.test` },
    { id: member, name: "Member", email: `${member}@example.test` },
  ]);
  const a = await access.create(owner, { name: "Approval A" }),
    b = await access.create(owner, { name: "Approval B" });
  await first.db
    .insert(spaceMembers)
    .values({ spaceId: a.space.id, accountId: member, role: "member" });
  scope = await access.resolve(owner, a.space.id);
  other = await access.resolve(member, a.space.id);
  foreignScope = await access.resolve(owner, b.space.id);
});
beforeEach(async () => {
  const { conversation } = await createAgentsRepository(first.db).create(scope, {
    name: "Helper",
    instructions: "",
    model: { modelId: "fixture" },
  });
  await conversations.send(scope, conversation.id, {
    text: "Write a file",
    idempotencyKey: "start",
  });
  run = (await conversations.claimNext(scope, conversation.id, claimOptions))!.run;
  const settings = await approvals.getSettings(owner, "ask");
  await approvals.updateSettings(owner, { mode: "ask", rules: [] }, settings.revision, "ask");
});
afterAll(async () => {
  try {
    if (scope) await first.db.delete(spaces).where(eq(spaces.id, scope.spaceId));
    if (foreignScope) await first.db.delete(spaces).where(eq(spaces.id, foreignScope.spaceId));
    for (const id of extraSpaces) await first.db.delete(spaces).where(eq(spaces.id, id));
    await first.db.delete(user).where(eq(user.id, member));
    await first.db.delete(user).where(eq(user.id, owner));
  } finally {
    await Promise.all([first.close(), second.close()]);
  }
});
it("commits a bounded card and waiting state together and steers the same Run", async () => {
  const before = await conversations.snapshot(scope, run.conversationId);
  const request = await approvals.createRequest(scope, run, call, expiresAt, createdAt);
  expect((await conversations.getRun(scope, run.conversationId, run.id)).state).toBe("waiting");
  const page = await conversations.events(scope, run.conversationId, before.cursor, 100);
  expect(page.status).toBe("events");
  if (page.status !== "events") throw new Error("Unexpected snapshot");
  expect(page.events.map(({ event }) => event.kind)).toEqual(["card.created", "run.state"]);
  expect(page.events[0]!.event).toMatchObject({
    requestId: request.id,
    toolName: call.name,
    argumentSummary: call.argumentSummary,
    target: call.target,
    memberAccountId: owner,
  });
  expect(JSON.stringify(page)).not.toContain(call.arguments.content);
  const message = await conversations.send(scope, run.conversationId, {
    text: "Continue chatting",
    idempotencyKey: "while-waiting",
  });
  expect(message.text).toBe("Continue chatting");
  expect(await conversations.claimNext(scope, run.conversationId, claimOptions)).toBeUndefined();
  await approvals.answer(scope, request.id, { decision: "approved" }, createdAt);
  expect((await conversations.getRun(scope, run.conversationId, run.id)).state).toBe("running");
  const steered = await conversations.consumeSteering(scope, run, {
    continuation: [],
    pendingCalls: [],
    rounds: 0,
    completed: false,
  });
  expect(steered.continuation).toContainEqual(
    expect.objectContaining({ role: "user", content: message.text }),
  );
  await conversations.finish(scope, run, null);
  expect(await conversations.claimNext(scope, run.conversationId, claimOptions)).toBeUndefined();
  expect((await conversations.snapshot(scope, run.conversationId)).runs).toHaveLength(1);
});
it("serializes concurrent answers and limits answers to the addressed member in the selected Space", async () => {
  const request = await approvals.createRequest(scope, run, call, expiresAt, createdAt);
  await expect(
    approvals.answer(other, request.id, { decision: "approved" }, createdAt),
  ).rejects.toMatchObject({ code: "NOT_ADDRESSED" });
  await expect(
    approvals.answer(foreignScope, request.id, { decision: "approved" }, createdAt),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
  expect(await approvals.listPending(other, createdAt)).toEqual([]);
  const answers = await Promise.allSettled([
    approvals.answer(scope, request.id, { decision: "approved" }, createdAt),
    competing.answer(scope, request.id, { decision: "denied" }, createdAt),
  ]);
  expect(answers.filter((answer) => answer.status === "fulfilled")).toHaveLength(1);
  expect(answers.filter((answer) => answer.status === "rejected")).toMatchObject([
    { reason: { code: "ALREADY_RESOLVED" } },
  ]);
  const events = await conversations.events(scope, run.conversationId, 0, 100);
  if (events.status !== "events") throw new Error("Unexpected snapshot");
  expect(events.events.filter(({ event }) => event.kind === "card.resolved")).toHaveLength(1);
  expect(events.events.map(({ event }) => event.sequence)).toEqual(
    Array.from({ length: events.cursor }, (_, index) => index + 1),
  );
});
it("expires requests explicitly and commits expiry even when a late answer is rejected", async () => {
  const request = await approvals.createRequest(scope, run, call, expiresAt, createdAt);
  await expect(
    approvals.answer(scope, request.id, { decision: "approved" }, expiresAt),
  ).rejects.toMatchObject({ code: "EXPIRED" });
  expect((await approvals.pollRequest(scope, run, request.id, expiresAt)).state).toBe("expired");
  expect((await conversations.getRun(scope, run.conversationId, run.id)).state).toBe("running");
  expect(await approvals.listPending(scope, expiresAt)).toEqual([]);
});
it("stop atomically cancels a pending request and repeated stop appends no event", async () => {
  const request = await approvals.createRequest(scope, run, call, expiresAt, createdAt);
  expect((await conversations.stop(other, run.conversationId, run.id)).state).toBe("cancelled");
  expect(
    (await approvals.listPending(scope, createdAt)).some((item) => item.id === request.id),
  ).toBe(false);
  const before = await conversations.snapshot(scope, run.conversationId);
  await conversations.stop(scope, run.conversationId, run.id);
  expect((await conversations.snapshot(scope, run.conversationId)).cursor).toBe(before.cursor);
  const page = await conversations.events(scope, run.conversationId, 0, 100);
  if (page.status !== "events") throw new Error("Unexpected snapshot");
  expect(page.events.at(-1)!.event).toMatchObject({
    kind: "card.resolved",
    requestId: request.id,
    outcome: "cancelled",
    answeredByAccountId: null,
  });
});
it("requires a new request for changed arguments and adding Allow never erases a Block", async () => {
  const request = await approvals.createRequest(scope, run, call, expiresAt, createdAt);
  const settings = await approvals.getSettings(owner, "ask");
  await approvals.updateSettings(
    owner,
    {
      mode: "ask",
      rules: [{ toolName: call.name, executable: null, decision: "block" }],
    },
    settings.revision,
    "ask",
  );
  await approvals.answer(scope, request.id, { decision: "approved", allowTool: true }, createdAt);
  const stored = await first.db
    .select()
    .from(approvalRules)
    .where(eq(approvalRules.accountId, owner));
  expect(stored).toMatchObject([{ toolName: call.name, decision: "block" }]);
  expect((await approvals.createRequest(scope, run, call, expiresAt, createdAt)).id).toBe(
    request.id,
  );
  const changed = await approvals.createRequest(
    scope,
    run,
    { ...call, arguments: { ...call.arguments, content: "changed body" } },
    expiresAt,
    createdAt,
  );
  expect(changed.id).not.toBe(request.id);
  expect(changed.state).toBe("pending");
  expect(changed.createdAt).toBe(request.createdAt);
  expect(
    (
      await approvals.createRequest(
        scope,
        run,
        {
          ...call,
          arguments: { content: "changed body", path: call.arguments.path },
        },
        expiresAt,
        createdAt,
      )
    ).id,
  ).toBe(changed.id);
  expect(
    (
      await competing.createRequest(
        scope,
        run,
        {
          ...call,
          arguments: { content: call.arguments.content, path: call.arguments.path },
        },
        expiresAt,
        createdAt,
      )
    ).id,
  ).toBe(request.id);
});
it("keeps a request answerable when remembering Allow would exceed the rule bound", async () => {
  const settings = await approvals.getSettings(owner, "ask");
  await approvals.updateSettings(
    owner,
    {
      mode: "ask",
      rules: Array.from({ length: 256 }, (_, index) => ({
        toolName: "computer_run_command" as const,
        executable: `executable-${index}`,
        decision: "allow" as const,
      })),
    },
    settings.revision,
    "ask",
  );
  const request = await approvals.createRequest(scope, run, call, expiresAt, createdAt);
  await expect(
    approvals.answer(scope, request.id, { decision: "approved", allowTool: true }, createdAt),
  ).rejects.toMatchObject({ code: "RULE_LIMIT" });
  expect((await approvals.pollRequest(scope, run, request.id, createdAt)).state).toBe("pending");
  expect(
    (await approvals.answer(scope, request.id, { decision: "approved" }, createdAt)).state,
  ).toBe("approved");
});
it("persists and reuses effect outcomes while interrupted intents become unknown and block continuation", async () => {
  let observedAt = createdAt;
  const service = createApprovalsService(approvals, { now: () => observedAt });
  let writes = 0;
  const signal = new AbortController().signal;
  const result = await service.executeEffect(
    scope,
    run,
    call,
    async () => {
      writes++;
      return "written";
    },
    signal,
  );
  expect(
    await service.executeEffect(
      scope,
      run,
      call,
      async () => {
        writes++;
        return "duplicate";
      },
      signal,
    ),
  ).toBe(result);
  expect(writes).toBe(1);
  const interrupted: Effect = {
    spaceId: scope.spaceId,
    conversationId: run.conversationId,
    key: "a".repeat(64),
    runId: run.id,
    toolCallId: "interrupted",
    toolName: call.name,
    argumentHash: "b".repeat(64),
    state: "intent",
    result: null,
    createdAt: createdAt.toISOString(),
    completedAt: null,
  };
  await first.db
    .insert(conversationEffects)
    .values({ ...interrupted, createdAt, completedAt: null });
  observedAt = new Date(createdAt.getTime() + EFFECT_INTENT_TIMEOUT_MS);
  await expect(service.assertContinuable(scope, run)).rejects.toMatchObject({
    code: "EFFECT_UNKNOWN",
  });
  expect(
    (await service.listEffects(scope, run.id)).find((effect) => effect.key === interrupted.key)!
      .state,
  ).toBe("unknown");
  await expect(service.assertContinuable(scope, run)).rejects.toMatchObject({
    code: "EFFECT_UNKNOWN",
  });
  expect(
    (
      await first.db
        .select()
        .from(conversationEffects)
        .where(
          and(
            eq(conversationEffects.spaceId, scope.spaceId),
            eq(conversationEffects.key, interrupted.key),
          ),
        )
    )[0]!.state,
  ).toBe("unknown");
  await expect(approvals.listEffects(foreignScope, run.id, observedAt)).rejects.toThrow(
    "not found",
  );
  await expect(
    approvals.completeEffect(scope, interrupted.key, "succeeded", "late outcome", createdAt, run),
  ).rejects.toMatchObject({ code: "EFFECT_UNKNOWN" });
});

it("leaves a young intent unchanged across repository instances and allows its owner to finish", async () => {
  const intent: Effect = {
    spaceId: scope.spaceId,
    conversationId: run.conversationId,
    runId: run.id,
    key: "1".repeat(64),
    argumentHash: "2".repeat(64),
    toolCallId: call.id,
    toolName: call.name,
    state: "intent",
    result: null,
    createdAt: createdAt.toISOString(),
    completedAt: null,
  };
  await approvals.beginEffect(scope, run, intent, createdAt);
  const nextRepository = createApprovalsRepository(second.db);
  const observedAt = new Date(createdAt.getTime() + EFFECT_INTENT_TIMEOUT_MS - 1);
  const service = createApprovalsService(nextRepository, { now: () => observedAt });
  expect((await service.listEffects(scope, run.id))[0]!.state).toBe("intent");
  await expect(service.assertContinuable(scope, run)).rejects.toMatchObject({
    code: "EFFECT_IN_PROGRESS",
  });
  expect((await nextRepository.beginEffect(scope, run, intent, observedAt)).effect.state).toBe(
    "intent",
  );
  await expect(
    nextRepository.beginEffect(scope, run, { ...intent, key: "3".repeat(64) }, observedAt),
  ).rejects.toThrow("EFFECT_IN_PROGRESS");
  expect(
    (
      await first.db
        .select()
        .from(conversationEffects)
        .where(
          and(
            eq(conversationEffects.spaceId, scope.spaceId),
            eq(conversationEffects.key, intent.key),
          ),
        )
    )[0]!.state,
  ).toBe("intent");
  await approvals.completeEffect(scope, intent.key, "succeeded", "written", observedAt, run);
  expect((await service.listEffects(scope, run.id))[0]!.state).toBe("succeeded");
});

it("persists lazy expiry on a member read without an attempt or lifecycle record", async () => {
  const { conversation } = await createAgentsRepository(first.db).create(scope, {
    name: "Unclaimed effect",
    instructions: "",
    model: { modelId: "fixture" },
  });
  await conversations.send(scope, conversation.id, { text: "Work", idempotencyKey: "unclaimed" });
  const queued = (await conversations.snapshot(scope, conversation.id)).runs[0]!;
  const key = uniqueEffectKey();
  await first.db.insert(conversationEffects).values({
    spaceId: scope.spaceId,
    conversationId: conversation.id,
    runId: queued.id,
    key,
    argumentHash: "b".repeat(64),
    toolCallId: "unclaimed-call",
    toolName: call.name,
    state: "intent",
    createdAt,
  });
  const observedAt = new Date(createdAt.getTime() + EFFECT_INTENT_TIMEOUT_MS);
  const service = createApprovalsService(competing, { now: () => observedAt });
  expect(await service.listEffects(other, queued.id)).toMatchObject([
    { key, state: "unknown", result: null },
  ]);
  const [stored] = await first.db
    .select()
    .from(conversationEffects)
    .where(and(eq(conversationEffects.spaceId, scope.spaceId), eq(conversationEffects.key, key)));
  expect(stored).toMatchObject({ state: "unknown", result: null, completedAt: null, fence: 0 });
});

it("atomically finishes lazy-expired tools once across concurrent reads and a resumed attempt", async () => {
  // A future injected clock detects accidental use of database time for expiry.
  const intentAt = new Date("2099-01-01T00:00:00Z");
  let observedAt = new Date(intentAt.getTime() + EFFECT_INTENT_TIMEOUT_MS - 1);
  const service = createApprovalsService(approvals, { now: () => observedAt });
  const reader = createApprovalsService(competing, { now: () => observedAt });
  const summary = {
    toolCallId: call.id,
    toolName: call.name,
    target: call.target,
    argumentSummary: call.argumentSummary,
  };
  const intent: Effect = {
    spaceId: scope.spaceId,
    conversationId: run.conversationId,
    runId: run.id,
    key: uniqueEffectKey(),
    argumentHash: "c".repeat(64),
    toolCallId: call.id,
    toolName: call.name,
    state: "intent",
    result: null,
    createdAt: intentAt.toISOString(),
    completedAt: null,
  };
  await conversations.beginTool(scope, run, summary);
  await approvals.beginEffect(scope, run, intent, intentAt);
  await conversations.release(scope, run);
  const before = await conversations.snapshot(scope, run.conversationId);
  expect(await reader.listEffects(other, run.id)).toMatchObject([{ state: "intent" }]);
  expect((await conversations.snapshot(scope, run.conversationId)).cursor).toBe(before.cursor);
  observedAt = new Date(observedAt.getTime() + 1);

  const unavailable = createApprovalsService(
    createApprovalsRepository(second.db, async () => {
      throw new Error("Fixture fanout failure");
    }),
    { now: () => observedAt },
  );
  await expect(unavailable.listEffects(scope, run.id)).rejects.toThrow("Fixture fanout failure");
  const effectSelection = and(
    eq(conversationEffects.spaceId, scope.spaceId),
    eq(conversationEffects.key, intent.key),
  );
  const [rolledBack] = await first.db.select().from(conversationEffects).where(effectSelection);
  expect(rolledBack).toMatchObject({ state: "intent", result: null });
  expect((await conversations.snapshot(scope, run.conversationId)).toolActivity).toMatchObject([
    { toolCallId: call.id, finishedAt: null, outcome: null },
  ]);
  expect((await conversations.snapshot(scope, run.conversationId)).cursor).toBe(before.cursor);

  for (const result of await Promise.all([
    service.listEffects(scope, run.id),
    reader.listEffects(other, run.id),
  ]))
    expect(result).toMatchObject([{ state: "unknown", result: null }]);

  async function lifecycle() {
    return first.db
      .select()
      .from(conversationEvents)
      .where(
        and(
          eq(conversationEvents.spaceId, scope.spaceId),
          eq(conversationEvents.runId, run.id),
          eq(conversationEvents.kind, "tool.finished"),
        ),
      )
      .orderBy(asc(conversationEvents.sequence));
  }
  const finished = await lifecycle();
  expect(finished).toHaveLength(1);
  expect(finished[0]).toMatchObject({
    fence: run.fence,
    sequence: before.cursor + 1,
    createdAt: observedAt,
    data: { ...summary, outcome: "unknown", durationMs: expect.any(Number), exitStatus: null },
  });
  const [stored] = await first.db.select().from(conversationEffects).where(effectSelection);
  expect(stored).toMatchObject({ state: "unknown", result: null, completedAt: null });

  const resumed = (await conversations.claimNext(scope, run.conversationId, {
    ...claimOptions,
    ownerId: "resumed-approval-fixture",
  }))!.run;
  expect(resumed.fence).toBeGreaterThan(run.fence);
  await expect(approvals.listEffects(scope, run.id, observedAt, run)).rejects.toBeInstanceOf(
    StaleRunFenceError,
  );
  await conversations.beginTool(scope, resumed, summary);
  await expect(reader.assertContinuable(scope, resumed)).rejects.toMatchObject({
    code: "EFFECT_UNKNOWN",
  });
  await expect(
    competing.beginEffect(scope, resumed, { ...intent, key: uniqueEffectKey() }, observedAt),
  ).rejects.toMatchObject({ code: "EFFECT_UNKNOWN" });
  await expect(
    competing.completeEffect(scope, intent.key, "succeeded", "late result", observedAt, resumed),
  ).rejects.toMatchObject({ code: "EFFECT_UNKNOWN" });
  await service.listEffects(scope, run.id);
  await reader.listEffects(other, run.id);
  await conversations.finish(scope, resumed, "EFFECT_UNKNOWN");
  expect(await lifecycle()).toEqual(finished);
  expect((await conversations.snapshot(scope, run.conversationId)).toolActivity).toMatchObject([
    { ...summary, outcome: "unknown", finishedAt: observedAt.toISOString() },
  ]);
  const storedCalls = await first.db
    .select()
    .from(conversationToolCalls)
    .where(
      and(
        eq(conversationToolCalls.spaceId, scope.spaceId),
        eq(conversationToolCalls.runId, run.id),
      ),
    )
    .orderBy(asc(conversationToolCalls.toolCallId));
  expect(storedCalls).toMatchObject([
    { toolCallId: call.id, outcome: "unknown", fence: run.fence },
  ]);
});

it.each(["current", "older"])(
  "commits lazy expiry when a new effect or a late %s-fence outcome is refused",
  async (originFence) => {
    const lateKey = uniqueEffectKey();
    const intent: Effect = {
      spaceId: scope.spaceId,
      conversationId: run.conversationId,
      runId: run.id,
      key: uniqueEffectKey(),
      argumentHash: "5".repeat(64),
      toolCallId: call.id,
      toolName: call.name,
      state: "intent",
      result: null,
      createdAt: createdAt.toISOString(),
      completedAt: null,
    };
    await approvals.beginEffect(scope, run, intent, createdAt);
    const observedAt = new Date(createdAt.getTime() + EFFECT_INTENT_TIMEOUT_MS + 1);
    await expect(
      competing.beginEffect(scope, run, { ...intent, key: uniqueEffectKey() }, observedAt),
    ).rejects.toMatchObject({ code: "EFFECT_UNKNOWN" });
    expect(
      (
        await first.db
          .select()
          .from(conversationEffects)
          .where(
            and(
              eq(conversationEffects.spaceId, scope.spaceId),
              eq(conversationEffects.key, intent.key),
            ),
          )
      )[0]!.state,
    ).toBe("unknown");
    await first.db.insert(conversationEffects).values({
      ...intent,
      key: lateKey,
      fence: originFence === "current" ? run.fence : run.fence - 1,
      createdAt,
      completedAt: null,
    });
    await expect(
      competing.completeEffect(scope, lateKey, "succeeded", "late", observedAt, run),
    ).rejects.toMatchObject({ code: "EFFECT_UNKNOWN" });
    expect(
      (
        await first.db
          .select()
          .from(conversationEffects)
          .where(
            and(
              eq(conversationEffects.spaceId, scope.spaceId),
              eq(conversationEffects.key, lateKey),
            ),
          )
      )[0]!.state,
    ).toBe("unknown");
  },
);

it("commits lazy expiry when waiting work refuses a new effect", async () => {
  const intent: Effect = {
    spaceId: scope.spaceId,
    conversationId: run.conversationId,
    runId: run.id,
    key: uniqueEffectKey(),
    argumentHash: "9".repeat(64),
    toolCallId: call.id,
    toolName: call.name,
    state: "intent",
    result: null,
    createdAt: createdAt.toISOString(),
    completedAt: null,
  };
  await approvals.beginEffect(scope, run, intent, createdAt);
  await approvals.createRequest(scope, run, call, expiresAt, createdAt);
  const observedAt = new Date(createdAt.getTime() + EFFECT_INTENT_TIMEOUT_MS + 1);
  await expect(
    competing.beginEffect(scope, run, { ...intent, key: uniqueEffectKey() }, observedAt),
  ).rejects.toThrow("RUN_NOT_ACTIVE");
  const [stored] = await first.db
    .select()
    .from(conversationEffects)
    .where(
      and(eq(conversationEffects.spaceId, scope.spaceId), eq(conversationEffects.key, intent.key)),
    );
  expect(stored!.state).toBe("unknown");
});

it("deletes a Space containing pending/resolved requests and effect history", async () => {
  const created = await access.create(owner, { name: "Deletion fixture" });
  extraSpaces.push(created.space.id);
  const selected = await access.resolve(owner, created.space.id);
  for (const [index, resolved] of [false, true].entries()) {
    const { conversation } = await createAgentsRepository(first.db).create(selected, {
      name: "Deletion helper",
      instructions: "",
      model: { modelId: "fixture" },
    });
    await conversations.send(selected, conversation.id, {
      text: "Write",
      idempotencyKey: "delete",
    });
    const execution = (await conversations.claimNext(selected, conversation.id, claimOptions))!;
    const request = await approvals.createRequest(
      selected,
      execution.run,
      call,
      expiresAt,
      createdAt,
    );
    if (resolved) await approvals.answer(selected, request.id, { decision: "approved" }, createdAt);
    await first.db.insert(conversationEffects).values({
      spaceId: selected.spaceId,
      conversationId: conversation.id,
      runId: execution.run.id,
      key: String(index + 8).repeat(64),
      argumentHash: "a".repeat(64),
      toolCallId: call.id,
      toolName: call.name,
      state: resolved ? "succeeded" : "intent",
      result: resolved ? "written" : null,
      completedAt: resolved ? createdAt : null,
      createdAt,
    });
  }
  const requests = await first.db
    .select()
    .from(approvalRequests)
    .where(eq(approvalRequests.spaceId, selected.spaceId));
  expect(requests.map((request) => request.state).sort()).toEqual(["approved", "pending"]);
  await first.db.delete(spaces).where(eq(spaces.id, selected.spaceId));
  for (const table of [approvalRequests, conversationEffects, conversationRuns, conversationEvents])
    expect(await first.db.select().from(table).where(eq(table.spaceId, selected.spaceId))).toEqual(
      [],
    );
});

it("retains and cancels a departed member's requests with Space and Run/effect history", async () => {
  const { conversation } = await createAgentsRepository(first.db).create(other, {
    name: "Member helper",
    instructions: "",
    model: { modelId: "fixture" },
  });
  await conversations.send(other, conversation.id, {
    text: "Write",
    idempotencyKey: "member-delete",
  });
  const execution = (await conversations.claimNext(other, conversation.id, claimOptions))!;
  const request = await approvals.createRequest(other, execution.run, call, expiresAt, createdAt);
  const effectKey = "e".repeat(64);
  await first.db.insert(conversationEffects).values({
    spaceId: other.spaceId,
    conversationId: conversation.id,
    runId: execution.run.id,
    key: effectKey,
    argumentHash: "f".repeat(64),
    toolCallId: call.id,
    toolName: call.name,
    state: "succeeded",
    result: "written",
    createdAt,
    completedAt: createdAt,
  });
  try {
    await first.db
      .delete(spaceMembers)
      .where(and(eq(spaceMembers.spaceId, other.spaceId), eq(spaceMembers.accountId, member)));
    await conversations.getRun(scope, conversation.id, execution.run.id);
    expect(
      await first.db
        .select()
        .from(approvalRequests)
        .where(
          and(eq(approvalRequests.spaceId, other.spaceId), eq(approvalRequests.id, request.id)),
        ),
    ).toEqual([expect.objectContaining({ id: request.id, state: "cancelled" })]);
    expect((await access.resolve(owner, scope.spaceId)).spaceId).toBe(scope.spaceId);
    await expect(access.resolve(member, other.spaceId)).rejects.toThrow("not found");
    expect(
      (await conversations.getRun(scope, conversation.id, execution.run.id)).memberAccountId,
    ).toBe(member);
    expect((await approvals.listEffects(scope, execution.run.id, createdAt))[0]!.key).toBe(
      effectKey,
    );
  } finally {
    await first.db
      .insert(spaceMembers)
      .values({ spaceId: other.spaceId, accountId: member, role: "member" })
      .onConflictDoNothing();
  }
});

it("rejects cross-Space approval, effect and card foreign keys in PostgreSQL", async () => {
  const request = await approvals.createRequest(scope, run, call, expiresAt, createdAt);
  const foreign = await createAgentsRepository(first.db).create(foreignScope, {
    name: "Foreign helper",
    instructions: "",
    model: { modelId: "fixture" },
  });
  await conversations.send(foreignScope, foreign.conversation.id, {
    text: "Foreign input",
    idempotencyKey: "foreign",
  });
  const foreignRun = (await conversations.claimNext(
    foreignScope,
    foreign.conversation.id,
    claimOptions,
  ))!.run;
  await expect(
    first.db.insert(approvalRequests).values({
      spaceId: foreignScope.spaceId,
      conversationId: run.conversationId,
      id: crypto.randomUUID(),
      runId: run.id,
      memberAccountId: owner,
      toolCallId: call.id,
      toolName: call.name,
      arguments: call.arguments,
      argumentSummary: call.argumentSummary,
      target: call.target,
      createdAt,
      expiresAt,
    }),
  ).rejects.toMatchObject({ cause: { code: "23503" } });
  await expect(
    first.db.insert(conversationEffects).values({
      spaceId: foreignScope.spaceId,
      conversationId: run.conversationId,
      runId: run.id,
      key: "c".repeat(64),
      argumentHash: "d".repeat(64),
      toolCallId: call.id,
      toolName: call.name,
      state: "intent",
    }),
  ).rejects.toMatchObject({ cause: { code: "23503" } });
  await expect(
    first.db.insert(conversationEvents).values({
      spaceId: foreignScope.spaceId,
      conversationId: foreign.conversation.id,
      sequence: 4,
      kind: "card.created",
      runId: foreignRun.id,
      requestId: request.id,
      data: { toolName: call.name, argumentSummary: call.argumentSummary },
    }),
  ).rejects.toMatchObject({ cause: { code: "23503" } });
});

it("serializes competing settings revisions and returns the winning settings on conflict", async () => {
  const before = await approvals.getSettings(owner, "ask");
  const results = await Promise.allSettled([
    approvals.updateSettings(owner, { mode: "never", rules: [] }, before.revision, "ask"),
    competing.updateSettings(
      owner,
      {
        mode: "ask",
        rules: [{ toolName: "computer_write_file", executable: null, decision: "block" }],
      },
      before.revision,
      "ask",
    ),
  ]);
  const successful = results.filter((result) => result.status === "fulfilled");
  const failed = results.filter((result) => result.status === "rejected");
  expect(successful).toHaveLength(1);
  expect(failed).toHaveLength(1);
  const current = await approvals.getSettings(owner, "ask");
  expect(current.revision).toBe(before.revision + 1);
  expect(failed[0]!.reason).toMatchObject({
    code: "APPROVAL_SETTINGS_CONFLICT",
    settings: current,
  });
});

it("cascades revisioned approval settings and rules when their account is deleted", async () => {
  const accountId = `approval-settings-delete-${crypto.randomUUID()}`;
  await first.db.insert(user).values({
    id: accountId,
    name: "Deleted settings owner",
    email: `${accountId}@example.test`,
  });
  try {
    const initial = await approvals.getSettings(accountId, "never");
    expect(initial).toEqual({ mode: "never", rules: [], revision: 0 });
    await approvals.updateSettings(
      accountId,
      {
        mode: "ask",
        rules: [{ toolName: "computer_read_file", executable: null, decision: "block" }],
      },
      initial.revision,
      "never",
    );
    await first.db.delete(user).where(eq(user.id, accountId));
    expect(
      await first.db
        .select()
        .from(approvalSettings)
        .where(eq(approvalSettings.accountId, accountId)),
    ).toEqual([]);
    expect(
      await first.db.select().from(approvalRules).where(eq(approvalRules.accountId, accountId)),
    ).toEqual([]);
  } finally {
    await first.db.delete(user).where(eq(user.id, accountId));
  }
});

it("binds request actors and card references to the same Run within a Space", async () => {
  await expect(
    first.db.insert(approvalRequests).values({
      spaceId: scope.spaceId,
      conversationId: run.conversationId,
      id: crypto.randomUUID(),
      runId: run.id,
      memberAccountId: member,
      toolCallId: "wrong-actor",
      toolName: call.name,
      arguments: call.arguments,
      argumentSummary: call.argumentSummary,
      target: call.target,
      createdAt,
      expiresAt,
    }),
  ).rejects.toMatchObject({ cause: { code: "23503" } });
  const request = await approvals.createRequest(scope, run, call, expiresAt, createdAt);
  await conversations.stop(scope, run.conversationId, run.id);
  await conversations.send(scope, run.conversationId, {
    text: "Another Run",
    idempotencyKey: crypto.randomUUID(),
  });
  const anotherRun = (await conversations.claimNext(scope, run.conversationId, claimOptions))!.run;
  const snapshot = await conversations.snapshot(scope, run.conversationId);
  await expect(
    first.db.insert(conversationEvents).values({
      spaceId: scope.spaceId,
      conversationId: run.conversationId,
      sequence: snapshot.cursor + 1,
      kind: "card.created",
      runId: anotherRun.id,
      requestId: request.id,
      data: { toolName: call.name, argumentSummary: call.argumentSummary },
    }),
  ).rejects.toMatchObject({ cause: { code: "23503" } });
});
