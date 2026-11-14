import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { connectDatabase, migrateDatabase } from "@raypx/database";
import {
  approvalRequests,
  computers,
  conversationRuns,
  spaceAudit,
  spaceDeletionJobs,
  spaces,
  user,
  spaceMembers,
  routines,
} from "@raypx/database/schema";
import { createSpaceAccess, createSpaceManagement } from "@raypx/spaces/server/postgres";
import {
  createAgentsRepository,
  createApprovalsRepository,
  createConversationsRepository,
  cancelSpaceRuns,
} from "@raypx/agents/server/postgres";
import { createMemoryComputerProvider } from "@raypx/providers/computer";
import { createRoutinesService } from "@raypx/jobs/routines";
import { createRoutinesRepository } from "@raypx/jobs/routines/postgres";
import { createSpaceDeletionWorker } from "../../../src/spaces/deletion-worker.js";

const url = process.env.TEST_DATABASE_URL;
if (!url || !/_test(?:_[a-z0-9]+)?$/.test(new URL(url).pathname))
  throw new Error("A newly created disposable *_test or *_test_<lane> database is required");
const connection = connectDatabase(url);
const { db } = connection;
const accountId = `deletion-${crypto.randomUUID()}`;
const owned: string[] = [];
const accounts: string[] = [];
beforeAll(async () => {
  await migrateDatabase(url);
  await db
    .insert(user)
    .values({ id: accountId, name: "Deletion owner", email: `${accountId}@example.test` });
});
afterAll(async () => {
  try {
    for (const spaceId of owned) await db.delete(spaces).where(eq(spaces.id, spaceId));
    for (const id of accounts) await db.delete(user).where(eq(user.id, id));
    await db.delete(user).where(eq(user.id, accountId));
  } finally {
    await connection.close();
  }
});

it.each(["active", "terminal"] as const)(
  "removes membership, cancels pending cards and active Runs, and permits routine reassignment (%s Run)",
  async (lifecycle) => {
    const actor = `removed-${crypto.randomUUID()}`;
    accounts.push(actor);
    await db.insert(user).values({ id: actor, name: "Departing", email: `${actor}@example.test` });
    const access = createSpaceAccess(db);
    const home = await access.create(accountId, { name: "Remove member" });
    owned.push(home.space.id);
    await db
      .insert(spaceMembers)
      .values({ spaceId: home.space.id, accountId: actor, role: "member" });
    const scope = await access.resolve(accountId, home.space.id);
    const actorScope = await access.resolve(actor, home.space.id);
    const { agent, conversation } = await createAgentsRepository(db).create(scope, {
      name: "Shared Agent",
      instructions: "Fixture",
      model: { modelId: "fixture" },
    });
    const conversations = createConversationsRepository(db);
    await conversations.send(actorScope, conversation.id, {
      text: "Accepted history",
      idempotencyKey: "remove-run",
    });
    const execution = (await conversations.claimNext(scope, conversation.id, {
      ownerId: "removal-fixture",
      leaseMs: 30_000,
      timeoutMs: 300_000,
      backupMarginMs: 30_000,
    }))!;
    const request = await createApprovalsRepository(db).createRequest(
      actorScope,
      execution.run,
      {
        id: "removal-call",
        name: "agent_memory_save",
        arguments: { title: "Fact", text: "Fact" },
        changes: true,
        argumentSummary: "Save memory document",
        target: "Agent memory",
      },
      new Date(Date.now() + 60_000),
      new Date(),
    );
    // Exercise cleanup's defensive sweep without changing a completed Run's result.
    if (lifecycle === "terminal")
      await db
        .update(conversationRuns)
        .set({
          state: "succeeded",
          finishedAt: new Date(),
          leaseOwner: null,
          leaseExpiresAt: null,
        })
        .where(eq(conversationRuns.id, execution.run.id));
    const expectedState = lifecycle === "active" ? "cancelled" : "succeeded";
    const routineService = createRoutinesService(createRoutinesRepository(db), {
      dispatch() {},
      secrets: {
        async seal() {
          throw new Error("No repository secret in this fixture");
        },
        async open() {
          throw new Error("No repository secret in this fixture");
        },
      },
    });
    const routineInput = {
      agentId: agent.id,
      name: "Daily routine",
      prompt: "Saved prompt",
      enabled: true,
      triggers: { webhook: true, schedule: { cron: "0 9 * * *", timezone: "UTC" } },
    };
    const createdRoutine = await routineService.create(actorScope, routineInput);
    const routineId = createdRoutine.routine.id;
    const afterMemberRemoved = vi.fn(async () => {});
    const management = createSpaceManagement(db, {
      beforeMemberRemoved: cancelSpaceRuns,
      afterMemberRemoved,
    });
    const removed = await management.removeMember(scope, actor);
    expect(removed).toEqual({
      accountId: actor,
      pausedRoutines: [{ id: routineId, name: "Daily routine" }],
    });
    expect(afterMemberRemoved).toHaveBeenCalledExactlyOnceWith(scope, actor);
    expect(
      (await db.select().from(conversationRuns).where(eq(conversationRuns.id, execution.run.id)))[0]
        ?.state,
    ).toBe(expectedState);
    expect(
      (await db.select().from(approvalRequests).where(eq(approvalRequests.id, request.id)))[0]
        ?.state,
    ).toBe("cancelled");
    expect((await db.select().from(routines).where(eq(routines.id, routineId)))[0]).toMatchObject({
      enabled: false,
      nextDueAt: null,
      ownerAccountId: actor,
    });
    await expect(access.resolve(actor, scope.spaceId)).rejects.toThrow("Space record not found");
    await expect(
      conversations.send(actorScope, conversation.id, {
        text: "Stale scope cannot send",
        idempotencyKey: "after-removal",
      }),
    ).rejects.toThrow("Space record not found");
    expect(await conversations.heartbeat(actorScope, execution.run, 30_000)).toBe(false);
    const snapshot = await conversations.snapshot(scope, conversation.id);
    expect(snapshot.messages.map((row) => row.text)).toEqual(["Accepted history"]);
    expect(snapshot.runs[0]).toMatchObject({ memberAccountId: actor, state: expectedState });
    const reassigned = await routineService.update(scope, routineId, routineInput);
    expect(reassigned.routine).toMatchObject({ ownerAccountId: accountId, enabled: true });
    expect(reassigned.webhookKey).toMatch(/^[a-f0-9]{64}$/);
    expect(reassigned.webhookKey).not.toBe(createdRoutine.webhookKey);
    await expect(
      routineService.webhook(routineId, createdRoutine.webhookKey!, "stale-key", "{}"),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  },
);

it("resumes a claimed Space deletion across worker restarts and an interrupted object removal", async () => {
  const access = createSpaceAccess(db);
  const home = await access.create(accountId, { name: "Delete this Space" });
  owned.push(home.space.id);
  const scope = await access.resolve(accountId, home.space.id);
  // A global worker may also claim jobs left by other independently owned fixtures.
  const unrelated = await access.create(accountId, { name: "Other deletion fixture" });
  owned.push(unrelated.space.id);
  await db
    .update(spaces)
    .set({ deletionClaimedAt: new Date() })
    .where(eq(spaces.id, unrelated.space.id));
  await db.insert(spaceDeletionJobs).values({
    spaceId: unrelated.space.id,
    requestedByAccountId: accountId,
    stage: "computers_released",
  });
  const { conversation } = await createAgentsRepository(db).create(scope, {
    name: "Deletion Agent",
    instructions: "Fixture",
    model: { modelId: "fixture" },
  });
  const conversations = createConversationsRepository(db);
  await conversations.send(scope, conversation.id, { text: "Work", idempotencyKey: "delete-run" });
  const execution = (await conversations.claimNext(scope, conversation.id, {
    ownerId: "fixture",
    leaseMs: 30_000,
    timeoutMs: 300_000,
    backupMarginMs: 30_000,
  }))!;
  const request = await createApprovalsRepository(db).createRequest(
    scope,
    execution.run,
    {
      id: "deletion-call",
      name: "agent_memory_save",
      arguments: { title: "Fact", text: "Fact" },
      changes: true,
      argumentSummary: "Save memory document",
      target: "Agent memory",
    },
    new Date(Date.now() + 60_000),
    new Date(),
  );
  const provider = createMemoryComputerProvider();
  const computerId = crypto.randomUUID();
  await provider.provision({ id: computerId, generation: 1 });
  await db.insert(computers).values({
    spaceId: scope.spaceId,
    id: computerId,
    scope: "team",
    createdByAccountId: accountId,
    provider: "memory",
    state: "running",
  });
  await db.transaction(async (tx) => {
    await tx
      .update(spaces)
      .set({ deletionClaimedAt: new Date() })
      .where(eq(spaces.id, scope.spaceId));
    await tx
      .insert(spaceDeletionJobs)
      .values({ spaceId: scope.spaceId, requestedByAccountId: accountId });
  });
  await expect(access.resolve(accountId, scope.spaceId)).rejects.toThrow("Space record not found");
  const onError = vi.fn();
  let removed = false;
  const removeObjects = vi.fn(async (spaceId: string) => {
    if (spaceId !== scope.spaceId) return;
    if (!removed) {
      removed = true;
      throw new Error("Interrupted after object deletion");
    }
  });
  const options = { intervalMs: 60_000, onError, removeObjects };
  const first = createSpaceDeletionWorker(db, provider, options);
  await first.scan();
  expect(
    (
      await db.select().from(spaceDeletionJobs).where(eq(spaceDeletionJobs.spaceId, scope.spaceId))
    )[0]?.stage,
  ).toBe("runs_cancelled");
  expect(
    (await db.select().from(conversationRuns).where(eq(conversationRuns.id, execution.run.id)))[0]
      ?.state,
  ).toBe("cancelled");
  expect(
    (await db.select().from(approvalRequests).where(eq(approvalRequests.id, request.id)))[0]?.state,
  ).toBe("cancelled");
  await first.close();
  const restarted = createSpaceDeletionWorker(db, provider, options);
  await restarted.scan();
  expect((await provider.get({ id: computerId, generation: 1 })).state).toBe("destroyed");
  await restarted.scan();
  expect(onError).toHaveBeenCalledOnce();
  expect(
    (
      await db.select().from(spaceDeletionJobs).where(eq(spaceDeletionJobs.spaceId, scope.spaceId))
    )[0]?.stage,
  ).toBe("computers_released");
  expect(
    (await db.select().from(spaceAudit).where(eq(spaceAudit.spaceId, scope.spaceId))).some(
      (row) => row.outcome === "failed" && row.code === "SPACE_DELETION_FAILED",
    ),
  ).toBe(true);
  await restarted.close();
  const finalWorker = createSpaceDeletionWorker(db, provider, options);
  await finalWorker.scan();
  expect(removeObjects.mock.calls.filter(([spaceId]) => spaceId === scope.spaceId)).toHaveLength(2);
  expect(
    (
      await db.select().from(spaceDeletionJobs).where(eq(spaceDeletionJobs.spaceId, scope.spaceId))
    )[0]?.stage,
  ).toBe("objects_removed");
  await finalWorker.scan();
  expect(await db.select().from(spaces).where(eq(spaces.id, scope.spaceId))).toEqual([]);
  expect(await db.select().from(computers).where(eq(computers.spaceId, scope.spaceId))).toEqual([]);
  expect(await db.select().from(spaceAudit).where(eq(spaceAudit.spaceId, scope.spaceId))).toEqual(
    [],
  );
  expect(
    await db.select().from(spaceDeletionJobs).where(eq(spaceDeletionJobs.spaceId, scope.spaceId)),
  ).toEqual([]);
  expect(
    await db.select().from(conversationRuns).where(eq(conversationRuns.spaceId, scope.spaceId)),
  ).toEqual([]);
  await finalWorker.close();
});
