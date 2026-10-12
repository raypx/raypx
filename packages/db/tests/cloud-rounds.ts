import { expect } from "vite-plus/test";
import { createCloudApplication } from "@voidmix/application";
import type { CloudRepository } from "@voidmix/core";

/** Shared black-box cases run against both adapters; the clock is injected at the application seam. */
export async function exerciseRoundAndLease(repository: CloudRepository) {
  let time = new Date("2026-10-08T00:00:00Z");
  const service = createCloudApplication({ repository, now: () => time, limits: { taskCalls: 1 } });
  const conversation = await service.createConversation({
    actorId: "alice",
    title: "Rounds",
    idempotencyKey: "round-conversation",
  });
  const initial = await service.sendTurn({
    actorId: "alice",
    conversationId: conversation.id,
    prompt: "First immutable goal",
    mode: "computer",
    idempotencyKey: "round-first",
  });
  const task = initial.task!;
  const claim = async (runId: string) => {
    await service.acceptQueued({ runId });
    const claimed = (await service.claim({ runId, ownerId: "worker-a" }))!;
    const fence = { runId, ownerId: "worker-a", epoch: claimed.epoch };
    const execution = await service.startExecution({ ...fence, role: "main", prompt: "Work" });
    return { fence, execution };
  };
  const first = await claim(initial.run.id);
  await service.reserveUsage({
    ...first.fence,
    callId: "round-call-1",
    executionId: first.execution.id,
    provider: "test",
    model: "model",
    reservedTokens: 100,
  });
  const dispatches = await Promise.allSettled([
    service.startUsage({ ...first.fence, callId: "round-call-1", dispatchOnce: true }),
    service.startUsage({ ...first.fence, callId: "round-call-1", dispatchOnce: true }),
  ]);
  expect(dispatches.filter((item) => item.status === "fulfilled")).toHaveLength(1);
  expect(dispatches.find((item) => item.status === "rejected")).toMatchObject({
    reason: { code: "CLOUD_IDEMPOTENCY_CONFLICT" },
  });
  await service.reconcileUsage({ callId: "round-call-1", started: false });
  expect((await repository.read((tx) => tx.get("usage", "round-call-1")))?.state).toBe("unknown");
  await service.settleUsage({
    ...first.fence,
    callId: "round-call-1",
    inputTokens: 30,
    outputTokens: 10,
  });
  await service.finish({ ...first.fence, status: "needs_input" });
  const retried = await service.retryRun({
    actorId: "alice",
    runId: initial.run.id,
    idempotencyKey: "round-retry",
  });
  expect(retried.roundId).toBe(task.currentRoundId);
  const retry = await claim(retried.id);
  await expect(
    service.reserveUsage({
      ...retry.fence,
      callId: "round-blocked",
      executionId: retry.execution.id,
      provider: "test",
      model: "model",
      reservedTokens: 100,
    }),
  ).rejects.toMatchObject({ code: "CLOUD_BUDGET_EXCEEDED" });
  await service.createCommand({
    actorId: "alice",
    runId: retried.id,
    type: "steer",
    text: "Clarify the same goal",
    idempotencyKey: "round-steer",
  });
  expect((await service.getTask({ actorId: "alice", taskId: task.id })).rounds).toHaveLength(1);
  await service.finish({ ...retry.fence, status: "failed" });
  const newGoal = {
    actorId: "alice",
    taskId: task.id,
    expectedGoalVersion: 1,
    goal: "New immutable goal",
    idempotencyKey: "new-goal",
  };
  const [newRound, replay] = await Promise.all([
    service.startRound(newGoal),
    service.startRound(newGoal),
  ]);
  expect(replay).toEqual(newRound);
  expect(replay.round.createdAt).toBeInstanceOf(Date);
  expect(newRound.round.goalVersion).toBe(2);
  expect(newRound.round.callBudget).toBe(1);
  const oldRound = (await service.getTask({ actorId: "alice", taskId: task.id })).rounds.find(
    (round) => round.goalVersion === 1,
  )!;
  expect(oldRound.goal).toBe("First immutable goal");
  await expect(
    repository.transaction([`task:${task.id}`], (tx) =>
      tx.save("rounds", { ...oldRound, goal: "mutated" }),
    ),
  ).rejects.toMatchObject({ code: "CLOUD_INVALID_INPUT" });
  await expect(
    service.retryRun({ actorId: "alice", runId: retried.id, idempotencyKey: "obsolete-retry" }),
  ).rejects.toMatchObject({ code: "CLOUD_REVISION_INVALID" });
  const next = await service.continueRound({
    actorId: "alice",
    taskId: task.id,
    roundId: newRound.round.id,
    goalVersion: 2,
    conversationId: conversation.id,
    prompt: "Continue",
    idempotencyKey: "round-continue",
  });
  const second = await claim(next.run.id);
  await service.reserveUsage({
    ...second.fence,
    callId: "round-call-2",
    executionId: second.execution.id,
    provider: "test",
    model: "model",
    reservedTokens: 100,
  });
  await service.startUsage({ ...second.fence, callId: "round-call-2", dispatchOnce: true });
  const grant = await service.registerExecutionGrant({
    ...second.fence,
    grantId: "grant",
    tokenHash: "a".repeat(64),
    expiresAt: new Date(time.getTime() + 30_000),
    actions: ["model", "read"],
  });
  expect(
    (
      await service.validateExecutionGrant({
        grantId: grant.id,
        tokenHash: "a".repeat(64),
        action: "model",
      })
    ).run.id,
  ).toBe(next.run.id);
  await expect(
    service.validateExecutionGrant({ grantId: grant.id, tokenHash: "a".repeat(64), action: "put" }),
  ).rejects.toMatchObject({ code: "CLOUD_OWNER_INVALID" });
  time = new Date(time.getTime() + 10_000);
  const renewed = await service.heartbeat(second.fence);
  await service.renewExecutionGrant({
    ...second.fence,
    grantId: grant.id,
    expiresAt: renewed.leaseExpiresAt!,
  });
  expect(await service.recoverInterrupted({ ownerId: "other-host" })).toHaveLength(0);
  time = new Date(time.getTime() + 30_000);
  await expect(service.heartbeat(second.fence)).rejects.toMatchObject({
    code: "CLOUD_OWNER_INVALID",
  });
  await expect(
    service.validateExecutionGrant({
      grantId: grant.id,
      tokenHash: "a".repeat(64),
      action: "model",
    }),
  ).rejects.toMatchObject({ code: "CLOUD_OWNER_INVALID" });
  await expect(
    service.appendEvent({
      ...second.fence,
      eventId: "late",
      type: "message.completed",
      payload: { messageId: "late", text: "Unsafe" },
    }),
  ).rejects.toMatchObject({ code: "CLOUD_OWNER_INVALID" });
  const [recovered, concurrent] = await Promise.all([
    service.recoverInterrupted(),
    service.recoverInterrupted(),
  ]);
  expect(recovered.length + concurrent.length).toBe(1);
  const before = await service.getRunSnapshot({ actorId: "alice", runId: next.run.id });
  expect(before.run.status).toBe("failed");
  expect((await repository.read((tx) => tx.get("usage", "round-call-2")))?.state).toBe("unknown");
  await service.reconcileUsage({ callId: "round-call-2", inputTokens: 40, outputTokens: 20 });
  const after = await service.getRunSnapshot({ actorId: "alice", runId: next.run.id });
  expect(after).toEqual(before);
  expect((await repository.read((tx) => tx.get("usage", "round-call-2")))?.state).toBe("settled");
}

export async function exercisePublicationCAS(repository: CloudRepository) {
  const service = createCloudApplication({ repository });
  const conversation = await service.createConversation({
    actorId: "alice",
    title: "CAS",
    idempotencyKey: "cas-conversation",
  });
  const initial = await service.sendTurn({
    actorId: "alice",
    conversationId: conversation.id,
    prompt: "A delivery",
    mode: "computer",
    idempotencyKey: "cas-turn",
  });
  await service.acceptQueued({ runId: initial.run.id });
  const claimed = (await service.claim({ runId: initial.run.id, ownerId: "publisher" }))!;
  const fence = { runId: initial.run.id, ownerId: "publisher", epoch: claimed.epoch };
  const asset = await service.createWorkerAsset({
    ...fence,
    name: "result.txt",
    mediaType: "text/plain",
    byteSize: 10,
    checksum: "b".repeat(64),
    idempotencyKey: "cas-asset",
  });
  await service.completeWorkerAsset({
    ...fence,
    assetVersionId: asset.id,
    byteSize: 10,
    checksum: asset.checksum,
  });
  const published = await service.finishWithRevision({
    ...fence,
    assetVersionIds: [asset.id],
    summary: "Result",
    output: "Done",
  });
  const continueRun = await service.continueRound({
    actorId: "alice",
    taskId: initial.task!.id,
    roundId: initial.task!.currentRoundId,
    goalVersion: 1,
    conversationId: conversation.id,
    prompt: "Improve",
    idempotencyKey: "cas-continue",
  });
  await expect(
    service.acceptRevision({
      actorId: "alice",
      taskId: initial.task!.id,
      roundId: published.revision.roundId,
      goalVersion: 1,
      revisionId: published.revision.id,
      idempotencyKey: "active-accept",
    }),
  ).rejects.toMatchObject({ code: "CLOUD_RUN_ACTIVE" });
  await service.createCommand({
    actorId: "alice",
    runId: continueRun.run.id,
    type: "cancel",
    idempotencyKey: "cas-cancel",
  });
  await service.startRound({
    actorId: "alice",
    taskId: initial.task!.id,
    expectedGoalVersion: 1,
    goal: "Changed goal",
    idempotencyKey: "cas-new-goal",
  });
  await expect(
    service.acceptRevision({
      actorId: "alice",
      taskId: initial.task!.id,
      roundId: published.revision.roundId,
      goalVersion: 1,
      revisionId: published.revision.id,
      idempotencyKey: "stale-accept",
    }),
  ).rejects.toMatchObject({ code: "CLOUD_REVISION_INVALID" });
  const fresh = await service.sendTurn({
    actorId: "alice",
    conversationId: conversation.id,
    taskId: initial.task!.id,
    prompt: "New delivery",
    roundId: (await service.getTask({ actorId: "alice", taskId: initial.task!.id })).task
      .currentRoundId,
    goalVersion: 2,
    mode: "computer",
    idempotencyKey: "cancel-publish",
  });
  await service.acceptQueued({ runId: fresh.run.id });
  const freshClaim = (await service.claim({ runId: fresh.run.id, ownerId: "publisher" }))!;
  const freshFence = { runId: fresh.run.id, ownerId: "publisher", epoch: freshClaim.epoch };
  const lateAsset = await service.createWorkerAsset({
    ...freshFence,
    name: "late.txt",
    mediaType: "text/plain",
    byteSize: 10,
    checksum: "b".repeat(64),
    idempotencyKey: "cas-late-asset",
  });
  await service.completeWorkerAsset({
    ...freshFence,
    assetVersionId: lateAsset.id,
    byteSize: 10,
    checksum: lateAsset.checksum,
  });
  await service.createCommand({
    actorId: "alice",
    runId: fresh.run.id,
    type: "cancel",
    idempotencyKey: "cancel-before-publish",
  });
  await expect(
    service.finishWithRevision({
      ...freshFence,
      assetVersionIds: [lateAsset.id],
      summary: "Too late",
      output: "Done",
    }),
  ).rejects.toMatchObject({ code: "CLOUD_REVISION_INVALID" });
  expect(
    (await service.getAsset({ actorId: "alice", assetVersionId: lateAsset.id })).published,
  ).toBe(false);
  expect(
    (await service.getTask({ actorId: "alice", taskId: initial.task!.id })).task.currentRevisionId,
  ).toBeNull();
}
