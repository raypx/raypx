import { beforeAll, beforeEach, afterAll, describe, it, expect } from "vite-plus/test";
import { DrizzleQueryError, sql } from "drizzle-orm";
import { createCloudApplication } from "@raypx/application";
import type { CloudRepository, CloudRunEvent } from "@raypx/core";
import { PostgresCloudRepository } from "../src/repositories/cloud/postgres.js";
import { InMemoryCloudRepository } from "../src/repositories/cloud/memory.js";
import { isUniqueViolation } from "@voidmix/drizzle/errors";
import { acquireCloudWorkerLease } from "../src/repositories/cloud/worker-lease.js";
import { exerciseSharedTaskBudget } from "./cloud-budget.js";
import { exerciseRoundAndLease, exercisePublicationCAS } from "./cloud-rounds.js";
import { exerciseMessageProjection, exerciseActiveRunRace } from "./cloud-projection.js";
import {
  exerciseUTCMonthBudget,
  exerciseSearchBudget,
  exerciseComputerRunDuration,
  exerciseAccountUsageAggregation,
} from "./cloud-usage-limits.js";
import { openTestDatabase, testDatabaseUrl } from "./database.js";
import {
  users,
  cloudEvents,
  cloudRuns,
  organizations,
  organizationMembers,
} from "../src/schema.js";
import { v2Projects, v2ProjectMembers } from "../src/schema.js";
import { outboxEvents } from "../src/schema/compatibility.js";
import { PostgresProjectMemberV2Repository } from "../src/v2/projects.js";
let connection: Awaited<ReturnType<typeof openTestDatabase>>;
beforeAll(async () => {
  connection = await openTestDatabase();
}, 30_000);
afterAll(async () => {
  await connection?.close();
});
beforeEach(async () => {
  await connection.db.execute(sql`SET client_min_messages=warning`);
  await connection.db.execute(sql`TRUNCATE users CASCADE`);
  await connection.db.execute(sql`TRUNCATE outbox_events`);
  await connection.db.insert(users).values([
    { id: "alice", email: "alice@example.com", displayName: "Alice" },
    { id: "bob", email: "bob@example.com", displayName: "Bob" },
  ]);
});
function app(limits: Parameters<typeof createCloudApplication>[0]["limits"] = {}) {
  return createCloudApplication({ repository: new PostgresCloudRepository(connection.db), limits });
}
async function start(
  service: ReturnType<typeof app>,
  key: string,
  mode: "search" | "computer" = "computer",
) {
  const conversation = await service.createConversation({
    actorId: "alice",
    title: key,
    idempotencyKey: `conversation-${key}`,
  });
  const result = await service.sendTurn({
    actorId: "alice",
    conversationId: conversation.id,
    prompt: "Create report",
    mode,
    idempotencyKey: `turn-${key}`,
  });
  const claim = (await service.claim({ runId: result.run.id, ownerId: "worker" }))!;
  const fence = { runId: result.run.id, ownerId: "worker", epoch: claim.epoch };
  const execution = await service.startExecution({ ...fence, role: "main", prompt: "report" });
  return { ...result, fence, execution };
}
describe("cloud PostgreSQL guarantees", { concurrent: false }, () => {
  const adapters = [
    ["memory", () => new InMemoryCloudRepository({ users: [{ id: "alice" }] })],
    ["PostgreSQL", () => new PostgresCloudRepository(connection.db)],
  ] as const;

  async function constraintFixture(repository: CloudRepository) {
    const service = createCloudApplication({ repository });
    const conversation = await service.createConversation({
      actorId: "alice",
      title: "Constraint rollback",
      idempotencyKey: "constraint-conversation",
    });
    const initial = await service.sendTurn({
      actorId: "alice",
      conversationId: conversation.id,
      prompt: "Constraint rollback",
      mode: "computer",
      idempotencyKey: "constraint-turn",
    });
    const savedConversation = await repository.read((tx) =>
      tx.get("conversations", conversation.id),
    );
    return { conversation: savedConversation!, initial };
  }

  it.each(adapters)(
    "maps active Task run conflicts and rolls back earlier %s writes",
    async (_name, create) => {
      const repository = create();
      const { conversation, initial } = await constraintFixture(repository);
      const competing = { ...initial.run, id: "competing-run", turnId: "competing-turn" };
      await expect(
        repository.transaction([`task:${initial.task!.id}`], async (tx) => {
          await tx.save("conversations", { ...conversation, title: "Must roll back" });
          await tx.save("runs", competing);
        }),
      ).rejects.toMatchObject({ code: "CLOUD_RUN_ACTIVE", message: "Task has an active run." });
      expect(await repository.read((tx) => tx.get("conversations", conversation.id))).toEqual(
        conversation,
      );
      expect(await repository.read((tx) => tx.get("runs", competing.id))).toBeNull();
      expect(await repository.read((tx) => tx.activeTaskRun(initial.task!.id))).toEqual(
        initial.run,
      );

      await repository.transaction([`task:${initial.task!.id}`], async (tx) => {
        await tx.save("runs", { ...initial.run, status: "succeeded" });
        await tx.save("runs", competing);
      });
      expect(await repository.read((tx) => tx.activeTaskRun(initial.task!.id))).toEqual(competing);
    },
  );

  it.each(adapters)(
    "maps event sequence conflicts and rolls back earlier %s writes",
    async (_name, create) => {
      const repository = create();
      const { conversation, initial } = await constraintFixture(repository);
      const event: CloudRunEvent = {
        runId: initial.run.id,
        sequence: initial.run.lastSequence + 1,
        eventId: "accepted-event",
        occurredAt: new Date("2026-10-13T00:00:00Z"),
        type: "message.delta",
        executionId: null,
        payload: { text: "Accepted" },
      };
      await repository.transaction([], (tx) => tx.appendEvent(event));
      const before = await repository.read((tx) => tx.events(initial.run.id, 0, 100));
      await expect(
        repository.transaction([], async (tx) => {
          await tx.save("conversations", { ...conversation, title: "Must roll back" });
          await tx.appendEvent({ ...event, eventId: "rejected-event" });
        }),
      ).rejects.toMatchObject({
        code: "CLOUD_IDEMPOTENCY_CONFLICT",
        message: "Event sequence already exists.",
      });
      expect(await repository.read((tx) => tx.get("conversations", conversation.id))).toEqual(
        conversation,
      );
      expect(await repository.read((tx) => tx.events(initial.run.id, 0, 100))).toEqual(before);
      expect(
        await repository.read((tx) => tx.eventById(initial.run.id, "rejected-event")),
      ).toBeNull();
    },
  );

  it("preserves unrecognized PostgreSQL failures and rolls back their transaction", async () => {
    const repository = new PostgresCloudRepository(connection.db);
    const { conversation, initial } = await constraintFixture(repository);
    const event: CloudRunEvent = {
      runId: initial.run.id,
      sequence: initial.run.lastSequence + 1,
      eventId: "reused-event-id",
      occurredAt: new Date("2026-10-13T00:00:00Z"),
      type: "message.delta",
      executionId: null,
      payload: { text: "Accepted" },
    };
    await repository.transaction([], (tx) => tx.appendEvent(event));
    const rejected = repository.transaction([], async (tx) => {
      await tx.save("conversations", { ...conversation, title: "Must roll back" });
      await tx.appendEvent({ ...event, sequence: event.sequence + 1 });
    });
    await expect(rejected).rejects.toBeInstanceOf(DrizzleQueryError);
    const error = await rejected.catch((failure: unknown) => failure);
    expect(isUniqueViolation(error, "cloud_events_run_event_idx")).toBe(true);
    expect((error as DrizzleQueryError).cause).toHaveProperty(
      "constraint_name",
      "cloud_events_run_event_idx",
    );
    expect((error as DrizzleQueryError).cause).not.toHaveProperty("constraint");
    expect(await repository.read((tx) => tx.get("conversations", conversation.id))).toEqual(
      conversation,
    );
    expect(await repository.read((tx) => tx.events(initial.run.id, event.sequence, 100))).toEqual(
      [],
    );
  });

  it("aggregates monthly calls and lifetime storage/runs inside the current transaction", async () => {
    await exerciseAccountUsageAggregation(new PostgresCloudRepository(connection.db));
  });
  it("resets account admission at the UTC month boundary while preserving round usage", async () => {
    await exerciseUTCMonthBudget(new PostgresCloudRepository(connection.db));
  });
  it("enforces six calls and sixty seconds for each Search Run", async () => {
    await exerciseSearchBudget(new PostgresCloudRepository(connection.db));
  });
  it("renews Computer duration per Run while retaining the shared round call budget", async () => {
    await exerciseComputerRunDuration(new PostgresCloudRepository(connection.db));
  });
  it("preserves immutable round budgets, dispatch uniqueness and expiring execution grants", async () => {
    await exerciseRoundAndLease(new PostgresCloudRepository(connection.db));
  });
  it("compares the current goal on acceptance and blocks cancelled publication", async () => {
    await exercisePublicationCAS(new PostgresCloudRepository(connection.db));
  });
  it("projects complete messages across bounded snapshots and older history", async () => {
    await exerciseMessageProjection(new PostgresCloudRepository(connection.db));
  }, 30_000);
  it("serializes competing task runs and claim versus queued cancellation", async () => {
    await exerciseActiveRunRace(new PostgresCloudRepository(connection.db));
  });
  it("uses only fresh cloud tables, keeps native dates, and queues once across concurrent requests", async () => {
    const service = app();
    const conversation = await service.createConversation({
      actorId: "alice",
      title: "Concurrent",
      idempotencyKey: "conversation",
    });
    const input = {
      actorId: "alice",
      conversationId: conversation.id,
      prompt: "Research",
      mode: "computer" as const,
      idempotencyKey: "turn",
    };
    const results = await Promise.all([service.sendTurn(input), service.sendTurn(input)]);
    expect(results[0]).toEqual(results[1]);
    expect(
      (await service.getConversation({ actorId: "alice", conversationId: conversation.id })).turns,
    ).toHaveLength(1);
    expect(
      (
        await service.conversationHistory({
          actorId: "alice",
          conversationId: conversation.id,
          limit: 1,
        })
      ).items,
    ).toHaveLength(1);
    expect(await connection.db.select().from(outboxEvents)).toEqual([]);
    expect(
      (await service.getConversation({ actorId: "alice", conversationId: conversation.id }))
        .conversation.createdAt,
    ).toBeInstanceOf(Date);
    const tables = await connection.db.execute<{ name: string }>(
      sql`SELECT tablename AS name FROM pg_tables WHERE schemaname='public'`,
    );
    expect(tables.map((t) => t.name)).not.toContain("task_agent_runs");
    expect(tables.map((t) => t.name)).not.toContain("agent_runs_v2");
  });
  it("protects the task invariant with both transactions and the PostgreSQL partial unique index", async () => {
    const service = app({ accountConcurrentRuns: 10 });
    const conversation = await service.createConversation({
      actorId: "alice",
      title: "Task",
      idempotencyKey: "c",
    });
    const task = await service.createTask({
      actorId: "alice",
      title: "Goal",
      goal: "Do work",
      idempotencyKey: "task",
    });
    const results = await Promise.allSettled(
      ["a", "b"].map((key) =>
        service.sendTurn({
          actorId: "alice",
          conversationId: conversation.id,
          taskId: task.id,
          roundId: task.currentRoundId,
          goalVersion: task.goalVersion,
          prompt: "Work",
          mode: "computer",
          idempotencyKey: key,
        }),
      ),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.find((r) => r.status === "rejected")).toMatchObject({
      reason: { code: "CLOUD_RUN_ACTIVE" },
    });
    const original = (await connection.db.select().from(cloudRuns))[0]!;
    await expect(
      connection.db
        .insert(cloudRuns)
        .values({ ...original, id: "illegal-run", idempotencyKey: "illegal" }),
    ).rejects.toThrow();
    expect(await connection.db.select().from(cloudRuns)).toHaveLength(1);
  });
  it("serializes account quota reservations from independent runs and rejects stale owners", async () => {
    const service = app({ accountCalls: 1 });
    const a = await start(service, "a", "search");
    const b = await start(service, "b", "search");
    const results = await Promise.allSettled(
      [a, b].map((r) =>
        service.reserveUsage({
          ...r.fence,
          callId: `call-${r.run.id}`,
          executionId: r.execution.id,
          provider: "provider",
          model: "model",
          reservedTokens: 100,
        }),
      ),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.find((r) => r.status === "rejected")).toMatchObject({
      reason: { code: "CLOUD_BUDGET_EXCEEDED" },
    });
    expect((await service.getUsage({ actorId: "alice" })).calls).toBe(1);
    await expect(
      service.appendEvent({
        ...a.fence,
        epoch: a.fence.epoch + 1,
        type: "message.delta",
        eventId: "stale",
        payload: { text: "wrong" },
      }),
    ).rejects.toMatchObject({ code: "CLOUD_OWNER_INVALID" });
  });
  it("rolls back revision publication and status events when Run finalization fails", async () => {
    const service = app();
    const run = await start(service, "atomic");
    const checksum = "a".repeat(64);
    const asset = await service.createWorkerAsset({
      ...run.fence,
      name: "report.pdf",
      mediaType: "application/pdf",
      byteSize: 10,
      checksum,
      idempotencyKey: "file",
    });
    await service.completeWorkerAsset({
      ...run.fence,
      assetVersionId: asset.id,
      byteSize: 10,
      checksum,
    });
    await connection.db.execute(
      sql`CREATE OR REPLACE FUNCTION reject_cloud_finalization() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.status='succeeded' THEN RAISE EXCEPTION 'Run finalization failed'; END IF; RETURN NEW; END; $$`,
    );
    await connection.db.execute(
      sql`CREATE TRIGGER reject_cloud_finalization BEFORE UPDATE ON cloud_runs FOR EACH ROW EXECUTE FUNCTION reject_cloud_finalization()`,
    );
    try {
      await expect(
        service.finishWithRevision({
          ...run.fence,
          assetVersionIds: [asset.id],
          summary: "Report",
          output: "Done",
        }),
      ).rejects.toThrow();
    } finally {
      await connection.db.execute(sql`DROP TRIGGER reject_cloud_finalization ON cloud_runs`);
      await connection.db.execute(sql`DROP FUNCTION reject_cloud_finalization()`);
    }
    const task = await service.getTask({ actorId: "alice", taskId: run.task!.id });
    expect(task.revisions).toHaveLength(0);
    expect((await service.listAssets({ actorId: "alice" })).items).toHaveLength(0);
    expect(
      (await service.getRunSnapshot({ actorId: "alice", runId: run.run.id })).artifacts,
    ).toHaveLength(0);
    expect(task.task.status).toBe("in_progress");
    expect((await service.getRunSummary({ actorId: "alice", runId: run.run.id })).status).toBe(
      "running",
    );
    const result = await service.finishWithRevision({
      ...run.fence,
      assetVersionIds: [asset.id],
      summary: "Report",
      output: "Done",
    });
    expect(result.run.status).toBe("succeeded");
    expect(
      (await service.getTask({ actorId: "alice", taskId: run.task!.id })).revisions,
    ).toHaveLength(1);
    expect((await service.getTask({ actorId: "alice", taskId: run.task!.id })).task.status).toBe(
      "review",
    );
  });
  it("deduplicates concurrent event delivery and replays from a contiguous snapshot cursor", async () => {
    const service = app();
    const run = await start(service, "events", "search");
    const event = {
      ...run.fence,
      eventId: "message",
      type: "message.delta" as const,
      payload: { messageId: "m", text: "Hello" },
    };
    const [a, b] = await Promise.all([service.appendEvent(event), service.appendEvent(event)]);
    expect(a).toEqual(b);
    const snapshot = await service.getRunSnapshot({ actorId: "alice", runId: run.run.id });
    await service.startTool({
      ...run.fence,
      executionId: run.execution.id,
      callId: "dates-tool",
      name: "extract_file",
      input: { createdAt: "yesterday" },
    });
    await service.finishTool({
      ...run.fence,
      callId: "dates-tool",
      status: "succeeded",
      output: { rows: [{ updatedAt: "source text" }] },
    });
    const detail = await service.getToolDetail({ actorId: "alice", callId: "dates-tool" });
    expect(detail.input).toEqual({ createdAt: "yesterday" });
    expect(detail.output).toEqual({ rows: [{ updatedAt: "source text" }] });
    expect(detail.createdAt).toBeInstanceOf(Date);
    await service.appendEvent({ ...event, eventId: "next", payload: { text: " again" } });
    const tail = await service.listEvents({
      actorId: "alice",
      runId: run.run.id,
      afterSequence: snapshot.cursor,
      limit: 10,
    });
    expect(tail.items[0]?.sequence).toBe(snapshot.cursor + 1);
    expect(tail.items[0]?.occurredAt).toBeInstanceOf(Date);
    expect(await connection.db.select().from(cloudEvents)).toHaveLength(snapshot.events.length + 3);
    await service.finish({ ...run.fence, status: "failed", error: "search unavailable" });
  });
  it("keeps verified files private until every delivery file is ready and durably claims expired objects", async () => {
    let time = new Date("2026-10-06T00:00:00Z");
    const service = createCloudApplication({
      repository: new PostgresCloudRepository(connection.db),
      now: () => time,
    });
    const run = await start(service, "files");
    const checksum = "b".repeat(64);
    const first = await service.createWorkerAsset({
      ...run.fence,
      name: "first.pdf",
      mediaType: "application/pdf",
      byteSize: 10,
      checksum,
      idempotencyKey: "first",
    });
    const second = await service.createWorkerAsset({
      ...run.fence,
      name: "second.pdf",
      mediaType: "application/pdf",
      byteSize: 10,
      checksum,
      idempotencyKey: "second",
    });
    await service.completeWorkerAsset({
      ...run.fence,
      assetVersionId: first.id,
      byteSize: 10,
      checksum,
    });
    await expect(
      service.finishWithRevision({
        ...run.fence,
        assetVersionIds: [first.id, second.id],
        summary: "Set",
        output: "Done",
      }),
    ).rejects.toMatchObject({ code: "CLOUD_REVISION_INVALID" });
    expect(
      (await service.getAsset({ actorId: "alice", assetVersionId: first.id })).verifiedAt,
    ).toBeInstanceOf(Date);
    expect((await service.listAssets({ actorId: "alice" })).items).toHaveLength(0);
    time = new Date(time.getTime() + 16 * 60 * 1000);
    expect(await service.claimExpiredUpload({ assetVersionId: first.id })).toBeNull();
    await service.recoverInterrupted();
    expect(await service.listExpiredUploads({ limit: 10 })).toHaveLength(2);
    await service.claimExpiredUpload({ assetVersionId: first.id });
    await service.removeExpiredUpload({ assetVersionId: first.id });
    const input = await service.createUpload({
      actorId: "alice",
      name: "input.txt",
      mediaType: "text/plain",
      byteSize: 10,
      checksum,
      idempotencyKey: "input",
    });
    time = new Date(time.getTime() + 16 * 60 * 1000);
    const [claim, repeated] = await Promise.all([
      service.claimExpiredUpload({ assetVersionId: input.id }),
      service.claimExpiredUpload({ assetVersionId: input.id }),
    ]);
    expect(claim).toEqual(repeated);
    await expect(
      service.completeUpload({
        actorId: "alice",
        assetVersionId: input.id,
        byteSize: 10,
        checksum,
        idempotencyKey: "complete",
      }),
    ).rejects.toMatchObject({ code: "CLOUD_INVALID_INPUT" });
    await service.removeExpiredUpload({ assetVersionId: input.id });
    expect((await service.getUsage({ actorId: "alice" })).storageBytes).toBe(10);
  });
  it("pages published inputs and turn history with bound cursors and native dates", async () => {
    const service = app({ accountConcurrentRuns: 5 });
    const conversation = await service.createConversation({
      actorId: "alice",
      title: "History",
      idempotencyKey: "history",
    });
    const turns = [];
    for (let index = 0; index < 3; index++)
      turns.push(
        await service.sendTurn({
          actorId: "alice",
          conversationId: conversation.id,
          prompt: `Turn ${index}`,
          mode: "search",
          idempotencyKey: `turn-${index}`,
        }),
      );
    const first = await service.conversationHistory({
      actorId: "alice",
      conversationId: conversation.id,
      limit: 2,
    });
    expect(first.items).toHaveLength(2);
    expect(first.runs).toHaveLength(2);
    const second = await service.conversationHistory({
      actorId: "alice",
      conversationId: conversation.id,
      limit: 2,
      cursor: first.nextCursor!,
    });
    expect(second.items).toHaveLength(1);
    expect(second.runs).toHaveLength(1);
    expect(new Set([...first.items, ...second.items].map((turn) => turn.id)).size).toBe(3);
    expect(second.items[0]!.createdAt).toBeInstanceOf(Date);
    const checksum = "a".repeat(64);
    const kept = await service.createUpload({
      actorId: "alice",
      name: "kept.txt",
      mediaType: "text/plain",
      byteSize: 10,
      checksum,
      idempotencyKey: "kept",
    });
    await service.completeUpload({
      actorId: "alice",
      assetVersionId: kept.id,
      byteSize: 10,
      checksum,
      idempotencyKey: "confirm",
    });
    await service.createUpload({
      actorId: "alice",
      name: "pending.txt",
      mediaType: "text/plain",
      byteSize: 10,
      checksum,
      idempotencyKey: "pending",
    });
    expect(
      (await service.listAssets({ actorId: "alice", limit: 1 })).items.map((asset) => asset.id),
    ).toEqual([kept.id]);
  });
  it("serializes a newly narrowing project grant with live cloud authorization", async () => {
    const now = new Date();
    await connection.db
      .insert(organizations)
      .values({ id: "org", name: "Org", createdByUserId: "alice" });
    await connection.db
      .insert(organizationMembers)
      .values({ id: "org-bob", organizationId: "org", userId: "bob", role: "editor" });
    await connection.db.insert(v2Projects).values({
      id: "project",
      createdByUserId: "alice",
      organizationId: "org",
      title: "Project",
      createdAt: now,
      updatedAt: now,
    });
    const repository = new PostgresCloudRepository(connection.db);
    let release!: () => void;
    const hold = new Promise<void>((resolve) => {
      release = resolve;
    });
    let entered!: () => void;
    const acquired = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const cloudAuthorization = repository.transaction([], async (tx) => {
      const context = await tx.projectAccess("project", "bob");
      expect(context?.projectMember).toBeNull();
      entered();
      await hold;
    });
    await acquired;
    const narrowed = new PostgresProjectMemberV2Repository(connection.db).upsert({
      projectId: "project",
      userId: "bob",
      role: "viewer",
      now,
    });
    try {
      await expect
        .poll(
          async () => {
            const rows = await connection.db.execute<{ waiting: boolean }>(
              sql`SELECT EXISTS (SELECT 1 FROM pg_stat_activity WHERE wait_event_type='Lock' AND query LIKE '%"projects_v2"%' AND pid<>pg_backend_pid()) AS waiting`,
            );
            return rows[0]?.waiting;
          },
          { timeout: 2_000 },
        )
        .toBe(true);
    } finally {
      release();
    }
    await cloudAuthorization;
    await narrowed;
    await expect(
      app().createConversation({
        actorId: "bob",
        projectId: "project",
        title: "Forbidden",
        idempotencyKey: "denied",
      }),
    ).rejects.toMatchObject({ code: "CLOUD_ACCESS_DENIED" });
  });
  it("filters usage with the Run index and shares a Task budget across project collaborators", async () => {
    const now = new Date();
    await connection.db.insert(v2Projects).values({
      id: "shared-project",
      createdByUserId: "alice",
      personalOwnerId: "alice",
      title: "Shared",
      createdAt: now,
      updatedAt: now,
    });
    await connection.db
      .insert(v2ProjectMembers)
      .values({
        id: "shared-project-bob",
        projectId: "shared-project",
        userId: "bob",
        role: "editor",
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [v2ProjectMembers.projectId, v2ProjectMembers.userId],
        set: { role: "editor", updatedAt: now },
      });
    const repository = new PostgresCloudRepository(connection.db);
    const service = createCloudApplication({ repository, limits: { taskCalls: 1 } });
    await exerciseSharedTaskBudget(service, repository, "shared-project");
  });
  it("allows independent Worker identities and only rejects a duplicate live identity", async () => {
    const first = await acquireCloudWorkerLease(testDatabaseUrl(), "one");
    try {
      await expect(acquireCloudWorkerLease(testDatabaseUrl(), "one")).rejects.toThrow(
        "already owned",
      );
      const other = await acquireCloudWorkerLease(testDatabaseUrl(), "two");
      await other.close();
    } finally {
      await first.close();
    }
    const second = await acquireCloudWorkerLease(testDatabaseUrl(), "one");
    await second.close();
  });
});
