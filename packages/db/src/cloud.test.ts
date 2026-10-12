import { describe, expect, it } from "vite-plus/test";
import { createCloudApplication } from "@voidmix/application";
import { InMemoryCloudRepository } from "./cloud-memory.js";
import { exerciseSharedTaskBudget } from "../tests/cloud-budget.js";
import type { CloudApplicationOptions } from "@voidmix/application";
import { exerciseRoundAndLease, exercisePublicationCAS } from "../tests/cloud-rounds.js";
import { exerciseMessageProjection, exerciseActiveRunRace } from "../tests/cloud-projection.js";
import {
  exerciseUTCMonthBudget,
  exerciseSearchBudget,
  exerciseComputerRunDuration,
} from "../tests/cloud-usage-limits.js";
const checksum = "a".repeat(64);
function fixture(limits: CloudApplicationOptions["limits"] = {}) {
  const repository = new InMemoryCloudRepository({ users: [{ id: "alice" }, { id: "bob" }] });
  let sequence = 0;
  const service = createCloudApplication({
    repository,
    now: () => new Date("2026-10-06T00:00:00Z"),
    id: () => `cloud-${++sequence}`,
    limits,
  });
  async function start(mode: "search" | "computer" = "computer") {
    const conversation = await service.createConversation({
      actorId: "alice",
      title: "Research",
      idempotencyKey: `conversation-${++sequence}`,
    });
    const result = await service.sendTurn({
      actorId: "alice",
      conversationId: conversation.id,
      prompt: "Create a report",
      mode,
      idempotencyKey: `turn-${++sequence}`,
    });
    await service.acceptQueued({ runId: result.run.id });
    const claim = (await service.claim({ runId: result.run.id, ownerId: "worker" }))!;
    const fence = { runId: result.run.id, ownerId: "worker", epoch: claim.epoch };
    const execution = await service.startExecution({
      ...fence,
      role: "main",
      prompt: result.run.prompt,
    });
    return { ...result, fence, execution };
  }
  return { service, repository, start };
}
describe("cloud application guarantees", () => {
  it("derives personal ownership, denies other accounts and checks live account status", async () => {
    const { service, repository, start } = fixture();
    const run = await start();
    expect(run.run.scope).toEqual({ type: "personal", ownerUserId: "alice" });
    await expect(
      service.getRunSnapshot({ actorId: "bob", runId: run.run.id }),
    ).rejects.toMatchObject({ code: "CLOUD_ACCESS_DENIED" });
    repository.setUserActive("alice", false);
    await expect(service.heartbeat(run.fence)).rejects.toMatchObject({
      code: "CLOUD_ACCESS_DENIED",
    });
    await service.interrupt(run.fence);
    expect((await repository.read((tx) => tx.get("runs", run.run.id)))?.status).toBe("failed");
  });
  it("atomically queues one task run and replays an idempotent turn without extra outbox entries", async () => {
    const { service, repository } = fixture();
    const conversation = await service.createConversation({
      actorId: "alice",
      title: "Same",
      idempotencyKey: "c",
    });
    const input = {
      actorId: "alice",
      conversationId: conversation.id,
      prompt: "Report",
      mode: "computer" as const,
      idempotencyKey: "turn",
    };
    const [first, duplicate] = await Promise.all([
      service.sendTurn(input),
      service.sendTurn(input),
    ]);
    expect(first).toEqual(duplicate);
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
    expect(await repository.outboxItems()).toHaveLength(1);
    const next = {
      ...input,
      taskId: first.task!.id,
      roundId: first.task!.currentRoundId,
      goalVersion: first.task!.goalVersion,
      idempotencyKey: "next",
    };
    await expect(service.sendTurn(next)).rejects.toMatchObject({ code: "CLOUD_RUN_ACTIVE" });
    expect(await repository.outboxItems()).toHaveLength(1);
    await expect(service.sendTurn({ ...input, prompt: "Changed" })).rejects.toMatchObject({
      code: "CLOUD_IDEMPOTENCY_CONFLICT",
    });
  });
  it("commits delivery, run result, task review and notification together; acceptance completes task", async () => {
    const { service, repository, start } = fixture();
    const result = await start();
    const asset = await service.createWorkerAsset({
      ...result.fence,
      name: "report.pdf",
      mediaType: "application/pdf",
      byteSize: 10,
      checksum,
      idempotencyKey: "file",
    });
    await expect(
      service.finishWithRevision({
        ...result.fence,
        assetVersionIds: [asset.id],
        summary: "report",
        output: "Done",
      }),
    ).rejects.toMatchObject({ code: "CLOUD_REVISION_INVALID" });
    expect(
      (await service.getTask({ actorId: "alice", taskId: result.task!.id })).revisions,
    ).toHaveLength(0);
    await service.completeWorkerAsset({
      ...result.fence,
      assetVersionId: asset.id,
      byteSize: 10,
      checksum,
    });
    const published = await service.finishWithRevision({
      ...result.fence,
      assetVersionIds: [asset.id],
      summary: "report",
      output: "Done",
    });
    expect(published.run.status).toBe("succeeded");
    expect(
      (await service.getTask({ actorId: "alice", taskId: result.task!.id })).revisions,
    ).toHaveLength(1);
    expect((await service.getTask({ actorId: "alice", taskId: result.task!.id })).task.status).toBe(
      "review",
    );
    expect((await service.listNotifications({ actorId: "alice" })).items).toHaveLength(1);
    expect(
      (await repository.outboxItems()).filter((e) => e.type === "cloud.notification.created"),
    ).toHaveLength(1);
    const task = await service.acceptRevision({
      actorId: "alice",
      taskId: result.task!.id,
      revisionId: published.revision.id,
      roundId: published.revision.roundId,
      goalVersion: published.revision.goalVersion,
      idempotencyKey: "accept",
    });
    expect(task.status).toBe("completed");
    expect(
      await service.acceptRevision({
        actorId: "alice",
        taskId: task.id,
        revisionId: published.revision.id,
        roundId: published.revision.roundId,
        goalVersion: published.revision.goalVersion,
        idempotencyKey: "accept",
      }),
    ).toEqual(task);
  });
  it("cancellation wins before completion and a late cancellation cannot replace success", async () => {
    const first = fixture();
    const result = await first.start("search");
    await first.service.createCommand({
      actorId: "alice",
      runId: result.run.id,
      type: "cancel",
      idempotencyKey: "cancel",
    });
    expect(
      (await first.service.finish({ ...result.fence, status: "succeeded", output: "too late" }))
        .status,
    ).toBe("cancelled");
    await expect(
      first.service.appendEvent({
        ...result.fence,
        type: "message.delta",
        eventId: "late",
        payload: { text: "late" },
      }),
    ).rejects.toMatchObject({ code: "CLOUD_OWNER_INVALID" });
    const second = fixture();
    const done = await second.start("search");
    await second.service.finish({ ...done.fence, status: "succeeded", output: "done" });
    expect(
      (
        await second.service.createCommand({
          actorId: "alice",
          runId: done.run.id,
          type: "cancel",
          idempotencyKey: "late",
        })
      ).status,
    ).toBe("rejected");
    expect(
      (await second.service.getRunSummary({ actorId: "alice", runId: done.run.id })).status,
    ).toBe("succeeded");
  });
  it("serializes child reservations under the shared budget and preserves unknown actual consumption", async () => {
    const { service, start } = fixture({ taskCalls: 1 });
    const result = await start();
    const child = await service.startExecution({
      ...result.fence,
      parentId: result.execution.id,
      role: "research",
      prompt: "read",
    });
    const request = {
      ...result.fence,
      provider: "provider",
      model: "model",
      reservedTokens: 100,
      pricing: { inputPerMillion: 2, outputPerMillion: 4 },
    };
    const attempts = await Promise.allSettled([
      service.reserveUsage({ ...request, callId: "main", executionId: result.execution.id }),
      service.reserveUsage({ ...request, callId: "child", executionId: child.id }),
    ]);
    expect(attempts.filter((a) => a.status === "fulfilled")).toHaveLength(1);
    expect(attempts.find((a) => a.status === "rejected")).toMatchObject({
      reason: { code: "CLOUD_BUDGET_EXCEEDED" },
    });
    const callId = attempts[0]!.status === "fulfilled" ? "main" : "child";
    await service.startUsage({ ...result.fence, callId });
    const usage = await service.settleUsage({ ...result.fence, callId });
    expect(usage.state).toBe("unknown");
    expect(usage.inputTokens).toBeNull();
    expect(usage.estimatedCost).toBeGreaterThan(0);
    expect((await service.getUsage({ actorId: "alice" })).unknownCalls).toBe(1);
  });
  it("deduplicates source/tool events and allocates a continuous sequence", async () => {
    const { service, start } = fixture();
    const result = await start();
    const source = {
      ...result.fence,
      eventId: "source",
      type: "source.created" as const,
      payload: { id: "source-1", url: "https://example.com", title: "Example", excerpt: "Source" },
    };
    const first = await service.appendEvent(source);
    expect(await service.appendEvent(source)).toEqual(first);
    await service.startTool({
      ...result.fence,
      executionId: result.execution.id,
      callId: "tool",
      name: "read_source",
      input: { url: "https://example.com" },
    });
    await service.finishTool({
      ...result.fence,
      callId: "tool",
      status: "succeeded",
      output: { body: "large output ".repeat(1_000) },
    });
    expect((await service.getToolDetail({ actorId: "alice", callId: "tool" })).status).toBe(
      "succeeded",
    );
    const snapshot = await service.getRunSnapshot({ actorId: "alice", runId: result.run.id });
    expect(snapshot.sources).toHaveLength(1);
    const toolEvent = snapshot.events.find((event) => event.type === "tool.completed")!;
    expect(toolEvent.payload["summary"]).toHaveLength(300);
    expect(toolEvent.payload).not.toHaveProperty("output");
    expect((await service.getToolDetail({ actorId: "alice", callId: "tool" })).output).toEqual({
      body: "large output ".repeat(1_000),
    });
    expect(
      (await service.workerSnapshot(result.fence)).events.find(
        (event) => event.type === "tool.completed",
      )!.payload,
    ).toHaveProperty("output");
    expect(
      (
        await service.listEvents({
          actorId: "alice",
          runId: result.run.id,
          afterSequence: toolEvent.sequence - 1,
          limit: 1,
        })
      ).items[0]!.payload,
    ).toEqual(toolEvent.payload);
    expect(snapshot.events.map((e) => e.sequence)).toEqual(snapshot.events.map((_, i) => i + 1));
  });
  it("replays mutable commands and rechecks opt-in and permissions before sending email", async () => {
    const { service, repository, start } = fixture();
    const preferences = {
      actorId: "alice",
      emailEnabled: true,
      locale: "zh" as const,
      idempotencyKey: "prefs",
    };
    const initial = await service.updatePreferences(preferences);
    await service.updatePreferences({
      ...preferences,
      emailEnabled: false,
      idempotencyKey: "prefs-2",
    });
    expect(await service.updatePreferences(preferences)).toEqual(initial);
    expect((await service.getPreferences({ actorId: "alice" })).emailEnabled).toBe(false);
    await service.updatePreferences({ ...preferences, idempotencyKey: "prefs-3" });
    const result = await start();
    await service.finish({ ...result.fence, status: "failed", error: "error" });
    const notification = (await service.listNotifications({ actorId: "alice" })).items[0]!;
    expect(await service.getDeliveryContext({ notificationId: notification.id })).toMatchObject({
      email: "alice@example.com",
      locale: "zh",
    });
    repository.setUserActive("alice", false);
    expect(await service.getDeliveryContext({ notificationId: notification.id })).toBeNull();
  });
});

it("publishes a complete file collection atomically and reclaims only terminal abandoned output", async () => {
  let time = new Date("2026-10-06T00:00:00Z");
  const repository = new InMemoryCloudRepository({ users: [{ id: "alice" }] });
  const service = createCloudApplication({ repository, now: () => time });
  const conversation = await service.createConversation({
    actorId: "alice",
    title: "Collection",
    idempotencyKey: "collection",
  });
  const { run, task } = await service.sendTurn({
    actorId: "alice",
    conversationId: conversation.id,
    prompt: "Two files",
    mode: "computer",
    idempotencyKey: "two",
  });
  await service.acceptQueued({ runId: run.id });
  const claimed = (await service.claim({ runId: run.id, ownerId: "worker" }))!;
  const fence = { runId: run.id, ownerId: "worker", epoch: claimed.epoch };
  const first = await service.createWorkerAsset({
    ...fence,
    name: "first.pdf",
    mediaType: "application/pdf",
    byteSize: 10,
    checksum,
    idempotencyKey: "first",
  });
  const second = await service.createWorkerAsset({
    ...fence,
    name: "second.pdf",
    mediaType: "application/pdf",
    byteSize: 10,
    checksum,
    idempotencyKey: "second",
  });
  const verified = await service.completeWorkerAsset({
    ...fence,
    assetVersionId: first.id,
    byteSize: 10,
    checksum,
  });
  expect(verified.published).toBe(false);
  expect(verified.verifiedAt).toBeInstanceOf(Date);
  await expect(
    service.completeUpload({
      actorId: "alice",
      assetVersionId: first.id,
      byteSize: 10,
      checksum,
      idempotencyKey: "bypass",
    }),
  ).rejects.toMatchObject({ code: "CLOUD_INVALID_INPUT" });
  await expect(
    service.finishWithRevision({
      ...fence,
      assetVersionIds: [first.id, second.id],
      summary: "Both",
      output: "Done",
    }),
  ).rejects.toMatchObject({ code: "CLOUD_REVISION_INVALID" });
  expect((await service.listAssets({ actorId: "alice" })).items).toHaveLength(0);
  expect((await service.getAsset({ actorId: "alice", assetVersionId: first.id })).published).toBe(
    false,
  );
  expect((await service.getTask({ actorId: "alice", taskId: task!.id })).revisions).toHaveLength(0);
  time = new Date(time.getTime() + 16 * 60 * 1000);
  expect(await service.listExpiredUploads({ limit: 10 })).toHaveLength(0);
  expect(await service.claimExpiredUpload({ assetVersionId: first.id })).toBeNull();
  await service.recoverInterrupted();
  expect(await service.listExpiredUploads({ limit: 10 })).toHaveLength(2);
  const claim = await service.claimExpiredUpload({ assetVersionId: first.id });
  expect(claim).toMatchObject({ id: first.id, cleanupClaimed: true });
  expect(await service.claimExpiredUpload({ assetVersionId: first.id })).toEqual(claim);
  await service.removeExpiredUpload({ assetVersionId: first.id });
  expect((await service.getUsage({ actorId: "alice" })).storageBytes).toBe(10);
});

it("binds list cursors to the account and keeps old turn retries reachable through capped history", async () => {
  let sequence = 0;
  let time = new Date("2026-10-06T00:00:00Z");
  let admitted = true;
  const repository = new InMemoryCloudRepository({ users: [{ id: "alice" }, { id: "bob" }] });
  const service = createCloudApplication({
    repository,
    now: () => time,
    id: () => `p-${++sequence}`,
    limits: { accountConcurrentRuns: 200 },
    admitRun: async () => {
      if (!admitted) throw new Error("disabled");
    },
  });
  const conversation = await service.createConversation({
    actorId: "alice",
    title: "History",
    idempotencyKey: "history",
  });
  const other = await service.createConversation({
    actorId: "alice",
    title: "Other",
    idempotencyKey: "other",
  });
  const listed = await service.listConversations({ actorId: "alice", limit: 1 });
  expect(listed.nextCursor).toEqual(expect.any(String));
  expect(
    (await service.listConversations({ actorId: "alice", limit: 1, cursor: listed.nextCursor! }))
      .items,
  ).toHaveLength(1);
  await expect(
    service.listConversations({ actorId: "bob", limit: 1, cursor: listed.nextCursor! }),
  ).rejects.toMatchObject({ code: "CLOUD_INVALID_INPUT" });
  const firstInput = {
    actorId: "alice",
    conversationId: conversation.id,
    prompt: "First",
    mode: "search" as const,
    idempotencyKey: "first",
  };
  const first = await service.sendTurn(firstInput);
  await service.acceptQueued({ runId: first.run.id });
  const claim = (await service.claim({ runId: first.run.id, ownerId: "worker" }))!;
  await service.finish({
    runId: first.run.id,
    ownerId: "worker",
    epoch: claim.epoch,
    status: "succeeded",
    output: "Answer",
  });
  for (let index = 0; index < 101; index++) {
    time = new Date(time.getTime() + 1_000);
    await service.sendTurn({
      ...firstInput,
      prompt: `Next ${index}`,
      idempotencyKey: `next-${index}`,
    });
  }
  const retry = await service.retryRun({
    actorId: "alice",
    runId: first.run.id,
    idempotencyKey: "retry",
  });
  const snapshot = await service.getConversation({
    actorId: "alice",
    conversationId: conversation.id,
  });
  expect(snapshot.turns).toHaveLength(100);
  expect(snapshot.historyCursor).toEqual(expect.any(String));
  expect(snapshot.turns).not.toContainEqual(first.turn);
  const older = await service.conversationHistory({
    actorId: "alice",
    conversationId: conversation.id,
    limit: 100,
    cursor: snapshot.historyCursor!,
  });
  expect(older.items).toHaveLength(2);
  expect(older.runs.map((run) => run.id)).toContain(first.run.id);
  expect(older.runs.map((run) => run.id)).toContain(retry.id);
  expect(older.nextCursor).toBeNull();
  await expect(
    service.conversationHistory({
      actorId: "alice",
      conversationId: other.id,
      cursor: snapshot.historyCursor!,
    }),
  ).rejects.toMatchObject({ code: "CLOUD_INVALID_INPUT" });
  admitted = false;
  expect((await service.sendTurn(firstInput)).run.id).toBe(first.run.id);
  expect(
    (await service.retryRun({ actorId: "alice", runId: first.run.id, idempotencyKey: "retry" })).id,
  ).toBe(retry.id);
});

it("commits Search failure notifications with the parent Run scope and Conversation target", async () => {
  const { service, repository, start } = fixture();
  await service.updatePreferences({
    actorId: "alice",
    emailEnabled: true,
    locale: "zh",
    idempotencyKey: "search-email",
  });
  const result = await start("search");
  await service.finish({ ...result.fence, status: "failed", error: "search unavailable" });
  const notification = (await service.listNotifications({ actorId: "alice" })).items[0]!;
  expect(notification).toMatchObject({
    scope: result.run.scope,
    recipientId: "alice",
    type: "run.failed",
    taskId: null,
    conversationId: result.run.conversationId,
    runId: result.run.id,
    emailEnabled: true,
  });
  expect(await service.getDeliveryContext({ notificationId: notification.id })).toMatchObject({
    email: "alice@example.com",
    locale: "zh",
  });
  expect((await service.listNotifications({ actorId: "bob" })).items).toHaveLength(0);
  expect(
    (await repository.outboxItems()).filter((event) => event.type === "cloud.notification.created"),
  ).toHaveLength(1);
});

it("pages redacted Admin diagnostics and counts unread notifications independently of the visible window", async () => {
  const repository = new InMemoryCloudRepository({
    users: [{ id: "alice" }, { id: "admin", role: "admin" }],
  });
  const service = createCloudApplication({ repository });
  const conversation = await service.createConversation({
    actorId: "alice",
    title: "Failures",
    idempotencyKey: "failures",
  });
  for (let index = 0; index < 2; index++) {
    const { run } = await service.sendTurn({
      actorId: "alice",
      conversationId: conversation.id,
      prompt: `PRIVATE ${index}`,
      mode: "search",
      idempotencyKey: `fail-${index}`,
    });
    await service.acceptQueued({ runId: run.id });
    const claimed = (await service.claim({ runId: run.id, ownerId: "worker" }))!;
    await service.finish({
      runId: run.id,
      ownerId: "worker",
      epoch: claimed.epoch,
      status: "failed",
      error: "SECRET ERROR",
    });
  }
  const first = await service.adminListRuns({ actorId: "admin", status: "failed", limit: 1 });
  const second = await service.adminListRuns({
    actorId: "admin",
    status: "failed",
    limit: 1,
    cursor: first.nextCursor!,
  });
  expect(first.items).toHaveLength(1);
  expect(second.items).toHaveLength(1);
  expect(second.items[0]!.id).not.toBe(first.items[0]!.id);
  expect(second.nextCursor).toBeNull();
  expect(JSON.stringify(first)).not.toContain("PRIVATE");
  await expect(
    service.adminListRuns({
      actorId: "admin",
      status: "queued",
      limit: 1,
      cursor: first.nextCursor!,
    }),
  ).rejects.toMatchObject({ code: "CLOUD_INVALID_INPUT" });
  const notifications = await service.listNotifications({ actorId: "alice", limit: 1 });
  expect(notifications.items).toHaveLength(1);
  expect(notifications.unreadCount).toBe(2);
  await service.markNotificationRead({
    actorId: "alice",
    notificationId: notifications.items[0]!.id,
    idempotencyKey: "read",
  });
  expect((await service.listNotifications({ actorId: "alice", limit: 1 })).unreadCount).toBe(1);
});

it("enforces public input formats while allowing generated deliverables and accounts for cached model usage", async () => {
  const { service, start } = fixture();
  await expect(
    service.createUpload({
      actorId: "alice",
      name: "page.html",
      mediaType: "text/html",
      byteSize: 10,
      checksum,
      idempotencyKey: "html",
    }),
  ).rejects.toMatchObject({ code: "CLOUD_INVALID_INPUT" });
  await expect(
    service.createUpload({
      actorId: "alice",
      name: "page.html",
      mediaType: "text/plain",
      byteSize: 10,
      checksum,
      idempotencyKey: "disguised",
    }),
  ).rejects.toMatchObject({ code: "CLOUD_INVALID_INPUT" });
  const result = await start();
  expect(
    await service.createWorkerAsset({
      ...result.fence,
      name: "slides.pptx",
      mediaType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      byteSize: 10,
      checksum,
      idempotencyKey: "presentation",
    }),
  ).toMatchObject({ name: "slides.pptx", published: false });
  const call = await service.reserveUsage({
    ...result.fence,
    executionId: result.execution.id,
    callId: "priced",
    provider: "provider",
    model: "model",
    reservedTokens: 100,
    pricing: {
      inputPerMillion: 2,
      outputPerMillion: 4,
      cacheReadPerMillion: 0.5,
      cacheWritePerMillion: 3,
    },
  });
  await service.startUsage({ ...result.fence, callId: call.id });
  const settled = await service.settleUsage({
    ...result.fence,
    callId: call.id,
    inputTokens: 100,
    outputTokens: 50,
    cacheReadTokens: 200,
    cacheWriteTokens: 100,
  });
  expect(settled.estimatedCost).toBeCloseTo((200 + 200 + 100 + 300) / 1_000_000);
  expect((await service.getUsage({ actorId: "alice" })).estimatedCost).toBe(settled.estimatedCost);
});

it("replays completed uploads and notification reads with their original native timestamps", async () => {
  let time = new Date("2026-10-06T00:00:00Z");
  const repository = new InMemoryCloudRepository({ users: [{ id: "alice" }] });
  const service = createCloudApplication({ repository, now: () => time });
  const asset = await service.createUpload({
    actorId: "alice",
    name: "notes.txt",
    mediaType: "text/plain",
    byteSize: 10,
    checksum,
    idempotencyKey: "upload",
  });
  const args = {
    actorId: "alice",
    assetVersionId: asset.id,
    byteSize: 10,
    checksum,
    idempotencyKey: "finish-upload",
  };
  const completed = await service.completeUpload(args);
  time = new Date(time.getTime() + 1_000);
  expect(await service.completeUpload(args)).toEqual(completed);
  const conversation = await service.createConversation({
    actorId: "alice",
    title: "Notify",
    idempotencyKey: "notify",
  });
  const { run } = await service.sendTurn({
    actorId: "alice",
    conversationId: conversation.id,
    prompt: "Search",
    mode: "search",
    idempotencyKey: "search",
  });
  await service.acceptQueued({ runId: run.id });
  const claim = (await service.claim({ runId: run.id, ownerId: "worker" }))!;
  await service.finish({
    runId: run.id,
    ownerId: "worker",
    epoch: claim.epoch,
    status: "failed",
    error: "unavailable",
  });
  const notification = (await service.listNotifications({ actorId: "alice" })).items[0]!;
  const readArgs = {
    actorId: "alice",
    notificationId: notification.id,
    idempotencyKey: "read-once",
  };
  const firstRead = await service.markNotificationRead(readArgs);
  time = new Date(time.getTime() + 1_000);
  expect(await service.markNotificationRead(readArgs)).toEqual(firstRead);
});

it("restricts administration to stored identity roles and excludes private content from diagnostics", async () => {
  const repository = new InMemoryCloudRepository({
    users: [{ id: "alice" }, { id: "admin", role: "admin" }],
  });
  const service = createCloudApplication({ repository });
  const conversation = await service.createConversation({
    actorId: "alice",
    title: "PRIVATE TITLE",
    idempotencyKey: "admin-c",
  });
  const { run } = await service.sendTurn({
    actorId: "alice",
    conversationId: conversation.id,
    prompt: "PRIVATE PROMPT",
    mode: "search",
    idempotencyKey: "admin-turn",
  });
  await expect(service.adminListRuns({ actorId: "alice" })).rejects.toMatchObject({
    code: "CLOUD_ACCESS_DENIED",
  });
  const list = await service.adminListRuns({ actorId: "admin" });
  expect(list.items).toHaveLength(1);
  const detail = await service.adminInspectRun({ actorId: "admin", runId: run.id });
  expect(JSON.stringify(detail)).not.toContain("PRIVATE");
  expect(detail.run.status).toBe("queued");
  await expect(service.getRunSnapshot({ actorId: "admin", runId: run.id })).rejects.toMatchObject({
    code: "CLOUD_ACCESS_DENIED",
  });
});

it("releases abandoned uploads after expiry and preserves committed input files", async () => {
  let time = new Date("2026-10-06T00:00:00Z");
  const repository = new InMemoryCloudRepository({ users: [{ id: "alice" }] });
  const service = createCloudApplication({ repository, now: () => time });
  const input = {
    actorId: "alice",
    name: "notes.txt",
    mediaType: "text/plain",
    byteSize: 10,
    checksum,
    idempotencyKey: "orphan",
  };
  const orphan = await service.createUpload(input);
  const kept = await service.createUpload({ ...input, idempotencyKey: "kept" });
  await service.completeUpload({
    actorId: "alice",
    assetVersionId: kept.id,
    byteSize: 10,
    checksum,
    idempotencyKey: "complete",
  });
  time = new Date(time.getTime() + 16 * 60 * 1000);
  expect((await service.listExpiredUploads({ limit: 10 })).map((a) => a.id)).toEqual([orphan.id]);
  await expect(
    service.completeUpload({
      actorId: "alice",
      assetVersionId: orphan.id,
      byteSize: 10,
      checksum,
      idempotencyKey: "late",
    }),
  ).rejects.toMatchObject({ code: "CLOUD_INVALID_INPUT" });
  expect(await service.claimExpiredUpload({ assetVersionId: kept.id })).toBeNull();
  await service.claimExpiredUpload({ assetVersionId: orphan.id });
  await service.removeExpiredUpload({ assetVersionId: orphan.id });
  expect((await service.getUsage({ actorId: "alice" })).storageBytes).toBe(10);
  expect((await service.listAssets({ actorId: "alice" })).items.map((a) => a.id)).toEqual([
    kept.id,
  ]);
});

it("filters usage by parent Runs and shares a Task budget across project collaborators", async () => {
  const now = new Date("2026-10-06T00:00:00Z");
  const repository = new InMemoryCloudRepository({
    users: [{ id: "alice" }, { id: "bob" }],
    projects: [
      {
        id: "shared-project",
        createdByUserId: "alice",
        personalOwnerId: "alice",
        organizationId: null,
        title: "Shared",
        description: null,
        stage: "draft",
        archived: false,
        deadline: null,
        createdAt: now,
        updatedAt: now,
      },
    ],
    projectMembers: [
      { projectId: "shared-project", userId: "bob", role: "editor", status: "active" },
    ],
  });
  const service = createCloudApplication({ repository, limits: { taskCalls: 1 } });
  await exerciseSharedTaskBudget(service, repository, "shared-project");
});

it("preserves immutable round budgets, dispatch uniqueness and expiring execution grants", async () => {
  await exerciseRoundAndLease(new InMemoryCloudRepository({ users: [{ id: "alice" }] }));
});

it("compares the current goal on acceptance and blocks cancelled publication", async () => {
  await exercisePublicationCAS(new InMemoryCloudRepository({ users: [{ id: "alice" }] }));
});
it("projects complete messages across bounded snapshots and older history", async () => {
  await exerciseMessageProjection(new InMemoryCloudRepository({ users: [{ id: "alice" }] }));
});
it("serializes competing task runs and claim versus queued cancellation", async () => {
  await exerciseActiveRunRace(new InMemoryCloudRepository({ users: [{ id: "alice" }] }));
});
it("resets account admission at the UTC month boundary while preserving round usage", async () => {
  await exerciseUTCMonthBudget(new InMemoryCloudRepository({ users: [{ id: "alice" }] }));
});
it("enforces six calls and sixty seconds for each Search Run", async () => {
  await exerciseSearchBudget(new InMemoryCloudRepository({ users: [{ id: "alice" }] }));
});
it("renews Computer duration per Run while retaining the shared round call budget", async () => {
  await exerciseComputerRunDuration(new InMemoryCloudRepository({ users: [{ id: "alice" }] }));
});
