import { afterAll, beforeAll, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { connectDatabase, migrateDatabase } from "@raypx/database";
import {
  approvalRequests,
  conversationDelegations,
  conversationMessageMentions,
  conversationMessages,
  conversationParticipants,
  conversationRunAttempts,
  conversationRunBackupJobs,
  conversationRunCheckpoints,
  conversationRuns,
  conversations,
  spaceMembers,
  spaces,
  user,
} from "@raypx/database/schema";
import { createSpaceAccess, createSpaceManagement } from "@raypx/spaces/server/postgres";
import {
  cancelSpaceRuns,
  createAgentsRepository,
  createApprovalsRepository,
  createConversationsRepository,
} from "../../src/server/postgres.js";
import type { RunClaimOptions } from "../../src/conversations.js";

const url = process.env.TEST_DATABASE_URL;
if (!url || !new URL(url).pathname.endsWith("_test"))
  throw new Error("A newly created disposable *_test database is required");
const storage = connectDatabase(url);
const access = createSpaceAccess(storage.db);
const agents = createAgentsRepository(storage.db);
const writer = createConversationsRepository(storage.db);
const approvals = createApprovalsRepository(storage.db);
const owner = `group-isolation-${crypto.randomUUID()}`;
const actor = `group-actor-${crypto.randomUUID()}`;
const owned = new Set<string>();
const extraAccounts = new Set<string>();
const claim: RunClaimOptions = {
  ownerId: "group-isolation-worker",
  leaseMs: 30_000,
  timeoutMs: 300_000,
  backupMarginMs: 30_000,
};

beforeAll(async () => {
  await migrateDatabase(url);
  await storage.db.insert(user).values([
    { id: owner, name: "Group owner", email: `${owner}@example.test` },
    { id: actor, name: "Group member", email: `${actor}@example.test` },
  ]);
});
afterAll(async () => {
  try {
    for (const spaceId of owned) await storage.db.delete(spaces).where(eq(spaces.id, spaceId));
    await storage.db.delete(spaces).where(eq(spaces.privateFor, owner));
    await storage.db.delete(spaces).where(eq(spaces.privateFor, actor));
    for (const accountId of extraAccounts) {
      await storage.db.delete(spaces).where(eq(spaces.privateFor, accountId));
      await storage.db.delete(user).where(eq(user.id, accountId));
    }
    await storage.db.delete(user).where(eq(user.id, actor));
    await storage.db.delete(user).where(eq(user.id, owner));
  } finally {
    await storage.close();
  }
});

async function fixture(accountId = actor) {
  const home = await access.create(owner, { name: "Group isolation" });
  owned.add(home.space.id);
  const scope = await access.resolve(owner, home.space.id);
  await storage.db
    .insert(spaceMembers)
    .values({ spaceId: scope.spaceId, accountId, role: "member" });
  const actorScope = await access.resolve(accountId, scope.spaceId);
  const participants = await Promise.all(
    ["Alpha", "Beta", "Gamma"].map((name) =>
      agents.create(scope, { name, instructions: "Fixture", model: { modelId: "fixture" } }),
    ),
  );
  const group = await writer.createGroup!(scope, {
    name: "Shared thread",
    agentIds: participants.map(({ agent }) => agent.id),
  });
  await writer.send(actorScope, group.id, {
    text: "Task for Alpha",
    mentions: [participants[0]!.agent.id],
    idempotencyKey: crypto.randomUUID(),
  });
  const parent = (await writer.claimNext(scope, group.id, claim))!;
  expect(parent.run.memberAccountId).toBe(accountId);
  const child = await writer.delegate!(actorScope, parent.run, {
    toolCallId: "delegate-fixture",
    task: "Inspect the task independently",
  });
  return { scope, actorScope, participants, group, parent, child };
}

it("rejects cross-Space participants, Agent authors, origins, parent Runs and every delegation reference", async () => {
  const local = await fixture();
  const foreign = await fixture();
  const localAgent = local.participants[0]!.agent.id;
  const foreignAgent = foreign.participants[0]!.agent.id;
  await expect(
    storage.db.insert(conversationParticipants).values({
      spaceId: foreign.scope.spaceId,
      conversationId: local.group.id,
      agentId: foreignAgent,
    }),
  ).rejects.toMatchObject({ cause: { code: "23503" } });
  await expect(
    storage.db.insert(conversationParticipants).values({
      spaceId: local.scope.spaceId,
      conversationId: local.group.id,
      agentId: foreignAgent,
    }),
  ).rejects.toMatchObject({ cause: { code: "23503" } });
  await expect(
    storage.db
      .update(conversations)
      .set({ defaultResponderAgentId: foreignAgent })
      .where(
        and(eq(conversations.spaceId, local.scope.spaceId), eq(conversations.id, local.group.id)),
      ),
  ).rejects.toMatchObject({ cause: { code: "23503" } });
  await expect(
    storage.db.insert(conversationMessages).values({
      spaceId: local.scope.spaceId,
      conversationId: local.group.id,
      id: crypto.randomUUID(),
      sequence: 1_000,
      authorAccountId: actor,
      authorAgentId: foreignAgent,
      idempotencyKey: crypto.randomUUID(),
      text: "Cross-Space Agent author",
    }),
  ).rejects.toMatchObject({ cause: { code: "23503" } });
  for (const reference of [
    { messageId: foreign.parent.run.messageId, agentId: localAgent },
    { messageId: local.parent.run.messageId, agentId: foreignAgent },
  ])
    await expect(
      storage.db.insert(conversationMessageMentions).values({
        spaceId: local.scope.spaceId,
        conversationId: local.group.id,
        position: 0,
        ...reference,
      }),
    ).rejects.toMatchObject({ cause: { code: "23503" } });
  const runValues = {
    spaceId: local.scope.spaceId,
    conversationId: local.group.id,
    agentId: localAgent,
    messageId: local.parent.run.messageId,
    messageSequence: 1,
    memberAccountId: actor,
    modelId: "fixture",
    instructions: "Fixture",
  };
  await expect(
    storage.db.insert(conversationRuns).values({
      ...runValues,
      id: crypto.randomUUID(),
      parentRunId: foreign.parent.run.id,
    }),
  ).rejects.toMatchObject({ cause: { code: "23503" } });
  await expect(
    storage.db.insert(conversationRuns).values({
      ...runValues,
      id: crypto.randomUUID(),
      // A child avoids the top-level trigger uniqueness constraint.
      parentRunId: local.parent.run.id,
      originMessageId: foreign.parent.run.messageId,
    }),
  ).rejects.toMatchObject({ cause: { code: "23503" } });
  const unboundChildId = crypto.randomUUID();
  await storage.db.insert(conversationRuns).values({
    ...runValues,
    id: unboundChildId,
    parentRunId: local.parent.run.id,
  });
  for (const reference of [
    { parentRunId: foreign.parent.run.id, childRunId: unboundChildId },
    { parentRunId: local.parent.run.id, childRunId: foreign.child.runId },
  ])
    await expect(
      storage.db.insert(conversationDelegations).values({
        spaceId: local.scope.spaceId,
        conversationId: local.group.id,
        toolCallId: crypto.randomUUID(),
        ...reference,
      }),
    ).rejects.toMatchObject({ cause: { code: "23503" } });
});

it("removing a Space member cancels their group parents, children and addressed approvals while retaining history", async () => {
  const f = await fixture();
  const child = (await writer.claimNext(f.scope, f.group.id, claim))!;
  expect(child.run.parentRunId).toBe(f.parent.run.id);
  const request = await approvals.createRequest(
    f.actorScope,
    child.run,
    {
      id: "child-write",
      name: "computer_write_file",
      arguments: { path: "notes.txt", content: "Fixture" },
      target: "notes.txt",
      argumentSummary: "Write file: notes.txt",
      changes: true,
    },
    new Date(Date.now() + 60_000),
    new Date(),
  );
  const management = createSpaceManagement(storage.db, { beforeMemberRemoved: cancelSpaceRuns });
  await management.removeMember(f.scope, actor);
  const snapshot = await writer.snapshot(f.scope, f.group.id);
  expect(snapshot.messages).toHaveLength(1);
  expect(snapshot.messages[0]!.author).toEqual({ kind: "member", accountId: actor });
  expect(snapshot.runs).toHaveLength(2);
  expect(snapshot.runs.every((run) => run.state === "cancelled")).toBe(true);
  expect(snapshot.runs.every((run) => run.memberAccountId === actor)).toBe(true);
  expect(
    await storage.db.select().from(approvalRequests).where(eq(approvalRequests.id, request.id)),
  ).toEqual([expect.objectContaining({ memberAccountId: actor, state: "cancelled" })]);
  const delegation = await storage.db
    .select()
    .from(conversationDelegations)
    .where(eq(conversationDelegations.spaceId, f.scope.spaceId));
  expect(delegation).toEqual([expect.objectContaining({ state: "discarded" })]);
  await expect(access.resolve(actor, f.scope.spaceId)).rejects.toThrow("not found");
  await expect(writer.saveCheckpoint(f.actorScope, child.run, child.checkpoint)).rejects.toThrow(
    "STALE_RUN_FENCE",
  );
});

it("removing an Agent cancels its group Runs and children without cancelling another participant", async () => {
  const f = await fixture();
  await writer.send(f.scope, f.group.id, {
    text: "Independent Beta work",
    mentions: [f.participants[1]!.agent.id],
    idempotencyKey: crypto.randomUUID(),
  });
  await writer.removeGroupAgent!(f.scope, f.group.id, f.participants[0]!.agent.id);
  const snapshot = await writer.snapshot(f.scope, f.group.id);
  const removed = snapshot.runs.filter((run) => run.agentId === f.participants[0]!.agent.id);
  expect(removed).toHaveLength(2);
  expect(removed.every((run) => run.state === "cancelled")).toBe(true);
  expect(snapshot.runs.find((run) => run.agentId === f.participants[1]!.agent.id)?.state).toBe(
    "queued",
  );
  expect(snapshot.conversation.agentIds).not.toContain(f.participants[0]!.agent.id);
  const replay = await writer.events(f.scope, f.group.id, 0, 100);
  if (replay.status !== "events") throw new Error("Expected events");
  expect(replay.events.map(({ event }) => event.sequence)).toEqual(
    Array.from({ length: replay.cursor }, (_, index) => index + 1),
  );
});

it("account deletion retains a group's message and delegation identities while cancelling unfinished children", async () => {
  const accountId = `deleted-group-member-${crypto.randomUUID()}`;
  extraAccounts.add(accountId);
  await storage.db.insert(user).values({
    id: accountId,
    name: "Departing group member",
    email: `${accountId}@example.test`,
  });
  const f = await fixture(accountId);
  await storage.db.delete(user).where(eq(user.id, accountId));
  const snapshot = await writer.snapshot(f.scope, f.group.id);
  expect(snapshot.messages[0]!.author).toEqual({ kind: "member", accountId });
  expect(snapshot.runs).toHaveLength(2);
  expect(snapshot.runs.every((run) => run.memberAccountId === accountId)).toBe(true);
  expect(snapshot.runs.every((run) => run.state === "cancelled")).toBe(true);
  const delegation = await storage.db
    .select()
    .from(conversationDelegations)
    .where(eq(conversationDelegations.spaceId, f.scope.spaceId));
  expect(delegation).toEqual([
    expect.objectContaining({
      parentRunId: f.parent.run.id,
      childRunId: f.child.runId,
      state: "discarded",
    }),
  ]);
  const replay = await writer.events(f.scope, f.group.id, 0, 100);
  if (replay.status !== "events") throw new Error("Expected events");
  expect(replay.events.map(({ event }) => event.sequence)).toEqual(
    Array.from({ length: replay.cursor }, (_, index) => index + 1),
  );
});

it("deletes a Space with groups, parent and child attempts, checkpoints, approvals and pending delegations", async () => {
  const f = await fixture();
  const child = (await writer.claimNext(f.scope, f.group.id, claim))!;
  expect(child.run.parentRunId).toBe(f.parent.run.id);
  await approvals.createRequest(
    f.actorScope,
    child.run,
    {
      id: "deletion-child-write",
      name: "computer_write_file",
      arguments: { path: "notes.txt", content: "Fixture" },
      target: "notes.txt",
      argumentSummary: "Write file: notes.txt",
      changes: true,
    },
    new Date(Date.now() + 60_000),
    new Date(),
  );
  const delegation = await storage.db
    .select()
    .from(conversationDelegations)
    .where(eq(conversationDelegations.spaceId, f.scope.spaceId));
  expect(delegation).toEqual([expect.objectContaining({ state: "pending" })]);
  expect((await writer.snapshot(f.scope, f.group.id)).runs).toHaveLength(2);
  await storage.db.delete(spaces).where(eq(spaces.id, f.scope.spaceId));
  for (const table of [
    conversationParticipants,
    conversationDelegations,
    conversationMessageMentions,
    conversationRuns,
    conversationRunAttempts,
    conversationRunCheckpoints,
    conversationRunBackupJobs,
    conversationMessages,
    conversations,
    approvalRequests,
  ])
    expect(await storage.db.select().from(table).where(eq(table.spaceId, f.scope.spaceId))).toEqual(
      [],
    );
  owned.delete(f.scope.spaceId);
});
