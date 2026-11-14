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
} from "../../src/server/postgres.js";

const url = process.env.TEST_DATABASE_URL;
if (!url || !new URL(url).pathname.endsWith("_test"))
  throw new Error("A newly created disposable *_test database is required");
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
