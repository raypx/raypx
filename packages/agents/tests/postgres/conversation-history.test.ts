import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { connectDatabase, migrateDatabase } from "@raypx/database";
import {
  spaces,
  spaceMembers,
  user,
  approvalRequests,
  conversationReplySegments,
  conversationMemberNames,
  conversationToolCalls,
  conversationRuns,
} from "@raypx/database/schema";
import type { SpaceScope } from "@raypx/spaces/server";
import { createSpaceAccess } from "@raypx/spaces/server/postgres";
import type { ConversationId } from "@raypx/core/agents";
import type { ConversationHistoryCursor } from "@raypx/core/conversation";
import {
  createAgentsRepository,
  createConversationsRepository,
  createApprovalsRepository,
} from "../../src/server/postgres.js";

const url = process.env.TEST_DATABASE_URL;
if (!url || !/_test(?:_[a-z0-9]+)?$/.test(new URL(url).pathname))
  throw new Error("A newly created disposable *_test or *_test_<lane> database is required");
const first = connectDatabase(url),
  second = connectDatabase(url);
const access = createSpaceAccess(first.db);
const writer = createConversationsRepository(first.db),
  other = createConversationsRepository(second.db);
const agents = createAgentsRepository(first.db);
const input = { name: "Helper", instructions: "", model: { modelId: "fixture" } };
const claim = { ownerId: "history", leaseMs: 30_000, timeoutMs: 300_000, backupMarginMs: 30_000 };
let owner: string, member: string, scope: SpaceScope, memberScope: SpaceScope, id: ConversationId;
beforeAll(async () => {
  await migrateDatabase(url);
});
beforeEach(async () => {
  owner = `history-owner-${crypto.randomUUID()}`;
  member = `history-member-${crypto.randomUUID()}`;
  await first.db.insert(user).values([
    { id: owner, name: "Owner", email: `${owner}@example.test` },
    { id: member, name: "Retained member", email: `${member}@example.test` },
  ]);
  const home = await access.create(owner, { name: "History test" });
  scope = await access.resolve(owner, home.space.id);
  await first.db
    .insert(spaceMembers)
    .values({ spaceId: scope.spaceId, accountId: member, role: "member" });
  memberScope = await access.resolve(member, scope.spaceId);
  id = (await agents.create(scope, input)).conversation.id;
});
afterEach(async () => {
  if (scope) await first.db.delete(spaces).where(eq(spaces.id, scope.spaceId));
  await first.db.delete(spaces).where(eq(spaces.privateFor, owner));
  await first.db.delete(user).where(eq(user.id, owner));
  await first.db.delete(user).where(eq(user.id, member));
});
afterAll(async () => {
  await Promise.all([first.close(), second.close()]);
});

it.each(["direct", "group"])(
  "pages %s history without duplicates or gaps while other writers append",
  async (kind) => {
    if (kind === "group") {
      const a = await agents.create(scope, input),
        b = await agents.create(scope, input);
      id = (
        await writer.createGroup!(scope, {
          name: "Group history",
          agentIds: [a.agent.id, b.agent.id],
        })
      ).id;
    }
    const initial = await Promise.all(
      Array.from({ length: 23 }, (_, i) =>
        (i % 2 ? writer : other).send(scope, id, {
          text: `Message ${i}`,
          idempotencyKey: `initial-${i}`,
        }),
      ),
    );
    const firstPage = await writer.history!(scope, id, 5);
    expect(firstPage.messages).toHaveLength(5);
    const collected = [...firstPage.messages];
    let before = firstPage.olderCursor;
    while (before) {
      const boundary: ConversationHistoryCursor = before;
      const [page] = await Promise.all([
        other.history!(scope, id, 5, boundary),
        writer.send(scope, id, { text: "Concurrent append", idempotencyKey: crypto.randomUUID() }),
      ]);
      expect(page.messages.length).toBeLessThanOrEqual(5);
      expect(page.messages.every((message) => message.sequence < boundary.beforeSequence)).toBe(
        true,
      );
      expect(page.messages.map((message) => message.sequence)).toEqual(
        page.messages.map((message) => message.sequence).sort((a, b) => a - b),
      );
      collected.push(...page.messages);
      before = page.olderCursor;
    }
    expect(new Set(collected.map((message) => message.id)).size).toBe(23);
    expect(collected.map((message) => message.id).sort()).toEqual(
      initial.map((message) => message.id).sort(),
    );
    // The existing snapshot remains complete and its cursor still resumes the event stream.
    const snapshot = await writer.snapshot(scope, id);
    expect(snapshot.messages.length).toBeGreaterThan(23);
    expect(await writer.events(scope, id, snapshot.cursor, 100)).toMatchObject({
      status: "events",
      events: [],
    });
    await expect(writer.history!(scope, id, 101)).rejects.toThrow("Invalid history limit");
    await expect(
      writer.history!(scope, id, 5, {
        ...firstPage.olderCursor!,
        conversationId: "wrong" as ConversationId,
      }),
    ).rejects.toThrow("Invalid conversation cursor");
  },
);

it("keeps delegated child Runs and all their bounded activity with their originating message window", async () => {
  const original = await writer.send(scope, id, { text: "Delegate", idempotencyKey: "parent" });
  const parent = (await writer.claimNext(scope, id, claim))!;
  const child = await writer.delegate!(scope, parent.run, {
    toolCallId: "delegate",
    task: "Do work",
  });
  const childExecution = (await other.claimNext(scope, id, { ...claim, ownerId: "child" }))!;
  expect(childExecution.run.id).toBe(child.runId);
  await other.beginTool(scope, childExecution.run, {
    toolCallId: "read",
    toolName: "computer_read_file",
    target: "workspace",
    argumentSummary: "Read",
  });
  await writer.commitTurn(scope, parent.run, {
    checkpoint: { continuation: [], pendingCalls: [], rounds: 0, completed: false },
    segmentId: "parent-reply",
    text: "Reply",
  });
  await writer.send(scope, id, { text: "Newer", idempotencyKey: "newer" });
  const newest = await writer.history!(scope, id, 1);
  expect(newest.messages[0]!.id).not.toBe(original.id);
  expect(newest.runs).toEqual([]); // this message steers the existing parent
  const page = await writer.history!(scope, id, 1, newest.olderCursor!);
  expect(page.runs.map((run) => run.id).sort()).toEqual([parent.run.id, child.runId].sort());
  expect(page.toolActivity).toEqual([
    expect.objectContaining({ runId: child.runId, parentRunId: parent.run.id }),
  ]);
  expect(page.segments).toEqual([
    expect.objectContaining({ id: "parent-reply", runId: parent.run.id }),
  ]);
});

it("retains departed and deleted accounts' display names and resolved answerers without email", async () => {
  await writer.send(memberScope, id, { text: "Member message", idempotencyKey: "member" });
  const run = (await writer.snapshot(scope, id)).runs[0]!;
  const resolvedAt = new Date();
  await first.db.insert(approvalRequests).values({
    spaceId: scope.spaceId,
    conversationId: id,
    id: "resolved",
    runId: run.id,
    memberAccountId: member,
    toolCallId: "write",
    toolName: "computer_write_file",
    arguments: {},
    argumentSummary: "Write",
    target: "workspace",
    state: "approved",
    resolvedAt,
    answeredByAccountId: member,
    expiresAt: new Date(Date.now() + 60_000),
  });
  await first.db.update(user).set({ name: "Current member name" }).where(eq(user.id, member));
  expect((await writer.snapshot(scope, id)).participants).toContainEqual({
    accountId: member,
    displayName: "Current member name",
    isMember: true,
  });
  await first.db
    .update(spaceMembers)
    .set({ removedAt: new Date(), removalReason: "removed" })
    .where(and(eq(spaceMembers.spaceId, scope.spaceId), eq(spaceMembers.accountId, member)));
  await first.db.update(user).set({ name: "Name after departure" }).where(eq(user.id, member));
  for (const snapshot of [await writer.snapshot(scope, id), await writer.history!(scope, id, 10)]) {
    expect(snapshot.participants).toContainEqual({
      accountId: member,
      displayName: "Retained member",
      isMember: false,
    });
    expect(snapshot.resolvedApprovals).toContainEqual({
      requestId: "resolved",
      runId: run.id,
      toolCallId: "write",
      outcome: "approved",
      answeredByAccountId: member,
      resolvedAt: resolvedAt.toISOString(),
    });
    expect(JSON.stringify(snapshot)).not.toContain("@example.test");
    expect(JSON.stringify(snapshot)).not.toContain('"email"');
  }
  await first.db.delete(user).where(eq(user.id, member));
  const afterDeletion = await writer.snapshot(scope, id);
  expect(afterDeletion.participants).toContainEqual({
    accountId: member,
    displayName: "Retained member",
    isMember: false,
  });
  expect(afterDeletion.resolvedApprovals?.[0]?.answeredByAccountId).toBe(member);
});

it("caps directory, resolved approvals, segments and tool activity with explicit truncation flags", async () => {
  await writer.send(scope, id, { text: "Root", idempotencyKey: "root" });
  const run = (await writer.snapshot(scope, id)).runs[0]!;
  await first.db.insert(conversationMemberNames).values(
    Array.from({ length: 101 }, (_, i) => ({
      spaceId: scope.spaceId,
      conversationId: id,
      accountId: `historical-${i}`,
      displayName: `Member ${i}`,
    })),
  );
  await first.db.insert(approvalRequests).values(
    Array.from({ length: 101 }, (_, i) => ({
      spaceId: scope.spaceId,
      conversationId: id,
      id: `resolved-${i}`,
      runId: run.id,
      memberAccountId: owner,
      toolCallId: `call-${i}`,
      toolName: "computer_write_file",
      arguments: {},
      argumentSummary: "Write",
      target: "workspace",
      state: "denied" as const,
      resolvedAt: new Date(),
      answeredByAccountId: owner,
      expiresAt: new Date(Date.now() + 60_000),
    })),
  );
  await first.db.insert(conversationReplySegments).values(
    Array.from({ length: 501 }, (_, i) => ({
      spaceId: scope.spaceId,
      conversationId: id,
      runId: run.id,
      id: `segment-${i}`,
      sequence: 1000 + i,
      text: "Reply",
    })),
  );
  await first.db.insert(conversationToolCalls).values(
    Array.from({ length: 101 }, (_, i) => ({
      spaceId: scope.spaceId,
      conversationId: id,
      runId: run.id,
      toolCallId: `tool-${i}`,
      toolName: "computer_read_file",
      argumentSummary: "Read",
      target: "workspace",
    })),
  );
  const page = await writer.history!(scope, id, 1);
  expect(page.participants).toHaveLength(100);
  expect(page.resolvedApprovals).toHaveLength(100);
  expect(page.segments).toHaveLength(500);
  expect(page.toolActivity).toHaveLength(100);
  expect(page).toMatchObject({
    participantsTruncated: true,
    resolvedApprovalsTruncated: true,
    segmentsTruncated: true,
    toolActivityTruncated: true,
  });
  const foreign = await access.create(owner, { name: "Foreign history" });
  try {
    const foreignScope = await access.resolve(owner, foreign.space.id);
    await expect(writer.history!(foreignScope, id, 10)).rejects.toThrow("not found");
    await expect(
      first.db.insert(conversationMemberNames).values({
        spaceId: foreignScope.spaceId,
        conversationId: id,
        accountId: owner,
        displayName: "Cross Space",
      }),
    ).rejects.toMatchObject({ cause: { code: "23503" } });
  } finally {
    await first.db.delete(spaces).where(eq(spaces.id, foreign.space.id));
  }
});

it("caps Runs independently of its message window, including large delegated families", async () => {
  const sent = await writer.send(scope, id, { text: "Root", idempotencyKey: "many-runs" });
  const root = (await writer.snapshot(scope, id)).runs[0]!;
  await first.db.insert(conversationRuns).values(
    Array.from({ length: 501 }, (_, i) => ({
      spaceId: scope.spaceId,
      conversationId: id,
      id: `bounded-child-${i}`,
      agentId: root.agentId,
      parentRunId: root.id,
      messageId: sent.id,
      messageSequence: sent.sequence,
      memberAccountId: owner,
      modelId: "fixture",
      instructions: "",
      state: "succeeded" as const,
      finishedAt: new Date(),
    })),
  );
  const page = await writer.history!(scope, id, 1);
  expect(page.messages).toHaveLength(1);
  expect(page.runs).toHaveLength(500);
  expect(page.runsTruncated).toBe(true);
  expect(page.olderCursor).toBeNull();
});

it.each(["succeeded", "failed", "cancelled"] as const)(
  "projects every active transition outside the message window until %s",
  async (terminal) => {
    const original = await writer.send(scope, id, { text: "Old work", idempotencyKey: "old-work" });
    const queued = (await writer.history!(scope, id, 1)).activeRuns![0]!;
    expect(queued).toMatchObject({
      run: { state: "queued" },
      triggerMessage: { id: original.id, sequence: original.sequence },
      pendingApprovals: [],
      latestCommittedSegment: null,
    });
    const execution = (await writer.claimNext(scope, id, claim))!;
    expect((await writer.snapshot(scope, id)).activeRuns?.[0]?.run.state).toBe("running");
    const approvalsRepository = createApprovalsRepository(first.db);
    const now = new Date();
    const request = await approvalsRepository.createRequest(
      scope,
      execution.run,
      {
        id: "old-write",
        name: "computer_write_file",
        arguments: { path: "report.txt", content: "private body" },
        target: "report.txt",
        argumentSummary: "Write report.txt",
        changes: true,
      },
      new Date(now.getTime() + 60_000),
      now,
    );
    for (let i = 0; i < 35; i++)
      await writer.send(scope, id, { text: `Newer ${i}`, idempotencyKey: `steer-${i}` });
    let page = await writer.history!(scope, id, 5);
    expect(page.runs).toEqual([]);
    expect(page.activeRuns).toHaveLength(1);
    expect(page.activeRuns![0]).toMatchObject({
      run: { id: execution.run.id, state: "waiting" },
      pendingApprovals: [{ requestId: request.id, runId: execution.run.id, target: "report.txt" }],
    });
    expect(JSON.stringify(page)).not.toContain("private body");
    expect(page.activeRuns![0]!.pendingApprovals[0]).not.toHaveProperty("arguments");
    const foreign = await access.create(owner, { name: "Other Space" });
    try {
      const foreignScope = await access.resolve(owner, foreign.space.id);
      await expect(writer.history!(foreignScope, id, 5)).rejects.toThrow("not found");
      const otherConversation = (await agents.create(foreignScope, input)).conversation;
      expect((await writer.history!(foreignScope, otherConversation.id, 5)).activeRuns).toEqual([]);
    } finally {
      await first.db.delete(spaces).where(eq(spaces.id, foreign.space.id));
    }
    await approvalsRepository.answer(scope, request.id, { decision: "approved" }, now);
    page = await writer.history!(scope, id, 5);
    expect(page.activeRuns![0]).toMatchObject({ run: { state: "running" }, pendingApprovals: [] });
    await writer.commitTurn(scope, execution.run, {
      checkpoint: { continuation: [], pendingCalls: [], rounds: 0, completed: false },
      segmentId: "old-commit",
      text: "A committed segment",
    });
    page = await writer.history!(scope, id, 5);
    const position = page.activeRuns![0]!.latestCommittedSegment!;
    expect(position).toMatchObject({ id: "old-commit" });
    expect(position.sequence).toBeGreaterThan(original.sequence);
    expect(page.segments).toEqual([]);
    const targetPage = await writer.history!(scope, id, 5, {
      spaceId: scope.spaceId,
      conversationId: id,
      beforeSequence: original.sequence + 1,
    });
    expect(targetPage.messages.map((message) => message.id)).toContain(original.id);
    expect(targetPage.runs.map((run) => run.id)).toContain(execution.run.id);
    await writer.retainAfter(scope, id, page.cursor);
    expect((await writer.snapshot(scope, id)).activeRuns![0]!.latestCommittedSegment).toEqual(
      position,
    );
    await writer.consumeSteering(scope, execution.run, {
      continuation: [],
      pendingCalls: [],
      rounds: 0,
      completed: false,
    });
    if (terminal === "cancelled") await writer.stop(scope, id, execution.run.id);
    else await writer.finish(scope, execution.run, terminal === "failed" ? "MODEL_FAILED" : null);
    expect((await writer.snapshot(scope, id)).activeRuns).toEqual([]);
    expect((await writer.history!(scope, id, 5)).activeRuns).toEqual([]);
  },
);

it("bounds active work independently of visible Runs and pending summaries independently per Run", async () => {
  const root = await writer.send(scope, id, { text: "Root", idempotencyKey: "bounded-active" });
  const execution = (await writer.claimNext(scope, id, claim))!;
  await first.db.insert(conversationRuns).values(
    Array.from({ length: 101 }, (_, i) => ({
      spaceId: scope.spaceId,
      conversationId: id,
      id: `zz-active-child-${i}`,
      agentId: execution.run.agentId,
      parentRunId: execution.run.id,
      messageId: root.id,
      messageSequence: root.sequence,
      memberAccountId: owner,
      modelId: "fixture",
      instructions: "",
      state: "queued" as const,
    })),
  );
  await first.db.insert(approvalRequests).values(
    Array.from({ length: 17 }, (_, i) => ({
      spaceId: scope.spaceId,
      conversationId: id,
      id: `pending-${i}`,
      runId: execution.run.id,
      memberAccountId: owner,
      toolCallId: `pending-call-${i}`,
      toolName: "computer_write_file",
      arguments: { content: "private body" },
      argumentSummary: "Write",
      target: "workspace",
      expiresAt: new Date(Date.now() + 60_000),
    })),
  );
  const snapshot = await writer.snapshot(scope, id);
  expect(snapshot.activeRuns).toHaveLength(100);
  expect(snapshot.activeRunsTruncated).toBe(true);
  const parent = snapshot.activeRuns?.find((item) => item.run.id === execution.run.id);
  expect(parent?.pendingApprovals).toHaveLength(16);
  expect(parent?.pendingApprovalsTruncated).toBe(true);
  const page = await writer.history!(scope, id, 1);
  expect(page.activeRuns).toEqual(snapshot.activeRuns);
  expect(page.activeRunsTruncated).toBe(true);
});

it("streams different-member steering provenance for an active Run outside history", async () => {
  const root = await writer.send(scope, id, { text: "Original", idempotencyKey: "untrusted-root" });
  const execution = (await writer.claimNext(scope, id, claim))!;
  for (let i = 0; i < 6; i++)
    await writer.send(scope, id, {
      text: "Same-member steering",
      idempotencyKey: `trusted-steer-${i}`,
    });
  const before = await writer.history!(scope, id, 2);
  expect(before.activeRuns![0]!.run.untrustedInput).toBe(false);
  await writer.send(memberScope, id, {
    text: "Another member's instructions",
    idempotencyKey: "different-member",
  });
  const page = await writer.history!(scope, id, 2);
  expect(page.messages.some((message) => message.id === root.id)).toBe(false);
  expect(page.activeRuns![0]!.run.untrustedInput).toBe(true);
  const replay = await writer.events(scope, id, before.cursor, 100);
  expect(replay.status).toBe("events");
  if (replay.status !== "events") throw new Error("Expected event replay");
  expect(replay.events.map(({ event }) => event)).toEqual([
    expect.objectContaining({ kind: "message.created" }),
    expect.objectContaining({
      kind: "run.state",
      runId: execution.run.id,
      state: "running",
      untrustedInput: true,
      triggerMessage: { id: root.id, sequence: root.sequence },
    }),
  ]);
});

it("steers an exact queued or delegated Run and refuses stale or cross-conversation targets", async () => {
  await writer.send(scope, id, { text: "Original", idempotencyKey: "exact-root" });
  const queued = (await writer.snapshot(scope, id)).runs[0]!;
  await writer.send(scope, id, {
    text: "Queued instruction",
    idempotencyKey: "queued-steer",
    steerRunId: queued.id,
  });
  expect((await writer.snapshot(scope, id)).runs).toHaveLength(1);
  const parent = (await writer.claimNext(scope, id, claim))!;
  const consumed = await writer.consumeSteering(scope, parent.run, parent.checkpoint);
  expect(JSON.stringify(consumed.continuation)).toContain("Queued instruction");
  const child = await writer.delegate!(scope, parent.run, {
    toolCallId: "exact-child",
    task: "Child task",
  });
  const before = (await writer.snapshot(scope, id)).cursor;
  await writer.send(scope, id, {
    text: "Child instruction",
    idempotencyKey: "child-steer",
    steerRunId: child.runId,
  });
  expect((await writer.snapshot(scope, id)).runs).toHaveLength(2);
  const childExecution = (await writer.claimNext(scope, id, { ...claim, ownerId: "exact-child" }))!;
  expect(childExecution.run.id).toBe(child.runId);
  const childCheckpoint = await writer.consumeSteering(
    scope,
    childExecution.run,
    childExecution.checkpoint,
  );
  expect(JSON.stringify(childCheckpoint.continuation)).toContain("Child instruction");
  const parentCheckpoint = await writer.consumeSteering(scope, parent.run, consumed);
  expect(JSON.stringify(parentCheckpoint.continuation)).not.toContain("Child instruction");
  const another = (await agents.create(scope, input)).conversation;
  await expect(
    writer.send(scope, another.id, {
      text: "Wrong conversation",
      idempotencyKey: "wrong-conversation",
      steerRunId: child.runId,
    }),
  ).rejects.toThrow("not found");
  expect((await writer.snapshot(scope, another.id)).messages).toEqual([]);
  await writer.stop(scope, id, child.runId);
  await expect(
    writer.send(scope, id, {
      text: "Late instruction",
      idempotencyKey: "stale-target",
      steerRunId: child.runId,
    }),
  ).rejects.toThrow("RUN_NOT_ACTIVE");
  const snapshot = await writer.snapshot(scope, id);
  expect(snapshot.messages.some((message) => message.text === "Late instruction")).toBe(false);
  const replay = await writer.events(scope, id, before, 100);
  expect(replay.status).toBe("events");
});
