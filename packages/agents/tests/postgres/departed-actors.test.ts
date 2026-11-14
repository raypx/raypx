import { afterAll, beforeAll, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { connectDatabase, migrateDatabase } from "@raypx/database";
import {
  approvalRequests,
  conversationRunAttempts as attempts,
  conversationRunBackupJobs as backupJobs,
  conversationRuns as runs,
  spaceMembers,
  spaces,
  user,
} from "@raypx/database/schema";
import type { SpaceScope } from "@raypx/spaces/server";
import { createSpaceAccess } from "@raypx/spaces/server/postgres";
import {
  createAgentsRepository,
  createApprovalsRepository,
  createConversationsRepository,
} from "../../src/server/postgres.js";
import type { RunCheckpoint, RunClaimOptions } from "../../src/conversations.js";

const url = process.env.TEST_DATABASE_URL;
if (!url || !/_test(?:_[a-z0-9]+)?$/.test(new URL(url).pathname))
  throw new Error("A newly created disposable *_test or *_test_<lane> database is required");
const first = connectDatabase(url);
const second = connectDatabase(url);
const now = new Date("2026-11-14T00:00:00.000Z");
const writer = createConversationsRepository(first.db, undefined, { now: () => now });
const competitor = createConversationsRepository(second.db, undefined, { now: () => now });
const approvals = createApprovalsRepository(first.db);
const access = createSpaceAccess(first.db);
const owner = `remaining-${crypto.randomUUID()}`;
const accounts: string[] = [];
const owned: string[] = [];
const claim: RunClaimOptions = {
  ownerId: "cleanup-fixture",
  leaseMs: 30_000,
  timeoutMs: 300_000,
  backupMarginMs: 30_000,
};
const blank: RunCheckpoint = { continuation: [], pendingCalls: [], rounds: 0, completed: false };
beforeAll(async () => {
  await migrateDatabase(url);
  await first.db
    .insert(user)
    .values({ id: owner, name: "Remaining member", email: `${owner}@example.test` });
});
afterAll(async () => {
  try {
    for (const spaceId of owned) await first.db.delete(spaces).where(eq(spaces.id, spaceId));
    for (const accountId of accounts) await first.db.delete(user).where(eq(user.id, accountId));
    await first.db.delete(user).where(eq(user.id, owner));
  } finally {
    await Promise.all([first.close(), second.close()]);
  }
});
async function fixture() {
  const actorId = `departing-${crypto.randomUUID()}`;
  accounts.push(actorId);
  await first.db
    .insert(user)
    .values({ id: actorId, name: "Departing member", email: `${actorId}@example.test` });
  const home = await access.create(owner, { name: "Shared departure fixture" });
  owned.push(home.space.id);
  await first.db
    .insert(spaceMembers)
    .values({ spaceId: home.space.id, accountId: actorId, role: "member" });
  const scope = await access.resolve(owner, home.space.id);
  const actorScope = await access.resolve(actorId, home.space.id);
  const { conversation } = await createAgentsRepository(first.db).create(scope, {
    name: "Shared Agent",
    instructions: "Fixture",
    model: { modelId: "fixture" },
  });
  await writer.send(actorScope, conversation.id, {
    text: "Historical member prompt",
    idempotencyKey: crypto.randomUUID(),
  });
  const [row] = (await writer.snapshot(scope, conversation.id)).runs;
  return { scope, actorScope, actorId, id: conversation.id, runId: row!.id };
}
async function removeMember(scope: SpaceScope, accountId: string) {
  await first.db
    .delete(spaceMembers)
    .where(and(eq(spaceMembers.spaceId, scope.spaceId), eq(spaceMembers.accountId, accountId)));
}

it("two worker scans cancel a departed active actor once, retain cancelled approval cards and fence writes", async () => {
  const f = await fixture();
  const execution = (await writer.claimNext(f.scope, f.id, claim))!;
  await writer.beginTool(f.actorScope, execution.run, {
    toolCallId: "memory-call",
    toolName: "agent_memory_save",
    argumentSummary: "Save memory document",
    target: "Agent memory",
  });
  const request = await approvals.createRequest(
    f.actorScope,
    execution.run,
    {
      id: "memory-call",
      name: "agent_memory_save",
      arguments: { title: "Fact", text: "private fact" },
      changes: true,
      argumentSummary: "Save memory document",
      target: "Agent memory",
    },
    new Date("2099-01-01T00:00:00.000Z"),
    now,
  );
  await removeMember(f.scope, f.actorId);
  expect(
    await first.db.select().from(approvalRequests).where(eq(approvalRequests.id, request.id)),
  ).toEqual([expect.objectContaining({ id: request.id, state: "pending" })]);
  await expect(
    approvals.answer(f.actorScope, request.id, { decision: "approved" }, now),
  ).rejects.toThrow("not found");
  expect(await writer.heartbeat(f.actorScope, execution.run, claim.leaseMs)).toBe(false);
  await expect(writer.saveCheckpoint(f.actorScope, execution.run, blank)).rejects.toThrow(
    "STALE_RUN_FENCE",
  );
  await Promise.all([writer.scanRunnable(), competitor.scanRunnable()]);
  const snapshot = await writer.snapshot(f.scope, f.id);
  expect(snapshot.runs[0]!.state).toBe("cancelled");
  expect(
    await first.db.select().from(approvalRequests).where(eq(approvalRequests.id, request.id)),
  ).toEqual([expect.objectContaining({ id: request.id, state: "cancelled" })]);
  expect(snapshot.toolActivity).toEqual([
    expect.objectContaining({ toolCallId: "memory-call", outcome: "cancelled" }),
  ]);
  expect(
    (await first.db.select().from(attempts).where(eq(attempts.runId, execution.run.id)))[0]!.state,
  ).toBe("cancelled");
  expect(
    await first.db.select().from(backupJobs).where(eq(backupJobs.runId, execution.run.id)),
  ).toEqual([]);
  const stream = await writer.events(f.scope, f.id, 0, 100);
  if (stream.status !== "events") throw new Error("Expected event replay");
  expect(stream.events.map((entry) => entry.event.sequence)).toEqual(
    Array.from({ length: stream.cursor }, (_, index) => index + 1),
  );
  expect(
    stream.events.filter(
      ({ event }) => event.kind === "card.resolved" && event.requestId === request.id,
    ),
  ).toEqual([
    expect.objectContaining({
      event: expect.objectContaining({ outcome: "cancelled", memberAccountId: f.actorId }),
    }),
  ]);
  const cancelled = stream.events.filter(
    ({ event }) => event.kind === "run.state" && event.state === "cancelled",
  );
  expect(cancelled.length).toBe(1);
  await competitor.scanRunnable();
  expect((await writer.snapshot(f.scope, f.id)).cursor).toBe(snapshot.cursor);
  await writer.send(f.scope, f.id, {
    text: "Work for the remaining member",
    idempotencyKey: crypto.randomUUID(),
  });
  const next = (await writer.claimNext(f.scope, f.id, claim))!;
  expect(next.run.memberAccountId).toBe(owner);
  expect(next.run.id).not.toBe(execution.run.id);
});

it.each(["getRun", "snapshot", "events", "claimNext", "send"] as const)(
  "%s persists a departed queued actor's cancellation",
  async (operation) => {
    const f = await fixture();
    await removeMember(f.scope, f.actorId);
    if (operation === "getRun") await writer.getRun(f.scope, f.id, f.runId);
    if (operation === "snapshot") await writer.snapshot(f.scope, f.id);
    if (operation === "events") await writer.events(f.scope, f.id, 0, 100);
    const claimed =
      operation === "claimNext" ? await writer.claimNext(f.scope, f.id, claim) : undefined;
    expect(claimed).toBeUndefined();
    if (operation === "send")
      await writer.send(f.scope, f.id, {
        text: "New member Run",
        idempotencyKey: crypto.randomUUID(),
      });
    const [row] = await first.db
      .select()
      .from(runs)
      .where(and(eq(runs.spaceId, f.scope.spaceId), eq(runs.id, f.runId)));
    expect(row).toMatchObject({
      state: "cancelled",
      leaseOwner: null,
      leaseExpiresAt: null,
      fence: 1,
    });
    expect(row!.finishedAt).toEqual(now);
    const next = operation === "send" ? await writer.claimNext(f.scope, f.id, claim) : undefined;
    expect(next?.run.memberAccountId).toBe(operation === "send" ? owner : undefined);
  },
);

it("account deletion preserves historical messages, Runs and contiguous event replay in a surviving Space", async () => {
  const f = await fixture();
  await writer.claimNext(f.scope, f.id, claim);
  await first.db.delete(user).where(eq(user.id, f.actorId));
  const snapshot = await writer.snapshot(f.scope, f.id);
  expect(snapshot.messages[0]!.author).toEqual({ kind: "member", accountId: f.actorId });
  expect(snapshot.runs).toEqual([
    expect.objectContaining({ id: f.runId, memberAccountId: f.actorId, state: "cancelled" }),
  ]);
  const stream = await writer.events(f.scope, f.id, 0, 100);
  if (stream.status !== "events") throw new Error("Expected event replay");
  expect(stream.events.map(({ event }) => event.sequence)).toEqual(
    Array.from({ length: stream.cursor }, (_, index) => index + 1),
  );
});

it.each(["membership", "account"] as const)(
  "retains approved requests and card references after %s removal",
  async (target) => {
    const f = await fixture();
    const execution = (await writer.claimNext(f.scope, f.id, claim))!;
    const request = await approvals.createRequest(
      f.actorScope,
      execution.run,
      {
        id: "approved-memory-call",
        name: "agent_memory_save",
        arguments: { title: "Fact", text: "Knowledge" },
        argumentSummary: "Save memory document",
        target: "Agent memory",
        changes: true,
      },
      new Date("2099-01-01T00:00:00.000Z"),
      now,
    );
    await approvals.answer(f.actorScope, request.id, { decision: "approved" }, now);
    await writer.finish(f.actorScope, execution.run, null);
    if (target === "membership") await removeMember(f.scope, f.actorId);
    if (target === "account") await first.db.delete(user).where(eq(user.id, f.actorId));
    const snapshot = await writer.snapshot(f.scope, f.id);
    expect(snapshot.runs[0]?.state).toBe("succeeded");
    expect(
      await first.db.select().from(approvalRequests).where(eq(approvalRequests.id, request.id)),
    ).toEqual([
      expect.objectContaining({
        state: "approved",
        memberAccountId: f.actorId,
        answeredByAccountId: f.actorId,
      }),
    ]);
    const page = await writer.events(f.scope, f.id, 0, 100);
    if (page.status !== "events") throw new Error("Expected event replay");
    expect(page.events.map(({ event }) => event.sequence)).toEqual(
      Array.from({ length: page.cursor }, (_, index) => index + 1),
    );
    expect(
      page.events.filter(
        ({ event }) => event.kind === "card.resolved" && event.requestId === request.id,
      ),
    ).toEqual([
      expect.objectContaining({ event: expect.objectContaining({ outcome: "approved" }) }),
    ]);
  },
);
