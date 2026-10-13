import { expect } from "vite-plus/test";
import { createCloudApplication } from "@raypx/application";
import type { CloudApplication } from "@raypx/application";
import type {
  CloudRepository,
  CloudUsageCall,
  CloudAssetVersion,
  CloudRunStatus,
} from "@raypx/core";

async function claim(service: CloudApplication, runId: string) {
  const claimed = (await service.claim({ runId, ownerId: "budget-host" }))!;
  const fence = { runId, ownerId: "budget-host", epoch: claimed.epoch };
  const execution = await service.startExecution({ ...fence, role: "main", prompt: "Budget" });
  return { fence, execution };
}
async function charge(
  service: CloudApplication,
  input: Awaited<ReturnType<typeof claim>>,
  callId: string,
) {
  await service.reserveUsage({
    ...input.fence,
    callId,
    executionId: input.execution.id,
    provider: "provider",
    model: "model",
    reservedTokens: 100,
  });
  await service.startUsage({ ...input.fence, callId, dispatchOnce: true });
  await service.settleUsage({ ...input.fence, callId, inputTokens: 20, outputTokens: 10 });
}
export async function exerciseAccountUsageAggregation(repository: CloudRepository) {
  const from = new Date("2026-10-01T00:00:00.000Z");
  const until = new Date("2026-11-01T00:00:00.000Z");
  const query = { ownerAccountId: "user:alice", from, until };
  const empty = {
    calls: 0,
    reservedCalls: 0,
    unknownCalls: 0,
    inputTokens: 0,
    outputTokens: 0,
    estimatedCost: 0,
    storageBytes: 0,
    activeRuns: 0,
  };
  expect(await repository.read((tx) => tx.accountUsage(query))).toEqual(empty);
  const service = createCloudApplication({ repository, now: () => from });
  const conversation = await service.createConversation({
    actorId: "alice",
    title: "Aggregate",
    idempotencyKey: "aggregate-c",
  });
  const initial = await service.sendTurn({
    actorId: "alice",
    conversationId: conversation.id,
    mode: "search",
    prompt: "Aggregate",
    idempotencyKey: "aggregate-turn",
  });
  const running = await claim(service, initial.run.id);
  const call = await service.reserveUsage({
    ...running.fence,
    callId: "aggregate-source",
    executionId: running.execution.id,
    provider: "provider",
    model: "model",
    reservedTokens: 100,
  });
  const asset = await service.createWorkerAsset({
    ...running.fence,
    name: "aggregate.txt",
    mediaType: "text/plain",
    byteSize: 10,
    checksum: "a".repeat(64),
    idempotencyKey: "aggregate-asset",
  });
  const run = (await repository.read((tx) => tx.get("runs", initial.run.id)))!;
  const expected = {
    calls: 4,
    reservedCalls: 1,
    unknownCalls: 1,
    inputTokens: 45,
    outputTokens: 66,
    estimatedCost: 1,
    storageBytes: 4_294_967_397,
    activeRuns: 2,
  };
  await repository.transaction(["account:user:alice"], async (tx) => {
    await tx.remove("usage", call.id);
    const calls: Partial<CloudUsageCall>[] = [
      { state: "reserved" },
      { state: "started", inputTokens: 10, estimatedCost: 0.1 },
      { state: "unknown", outputTokens: 20, estimatedCost: 0.2 },
      { state: "settled", inputTokens: 30, outputTokens: 40, estimatedCost: 0.3 },
      { state: "released", inputTokens: 5, outputTokens: 6, estimatedCost: 0.4 },
      { createdAt: new Date(from.getTime() - 1), inputTokens: 1000 },
      { createdAt: until, inputTokens: 1000 },
      { accountId: "user:bob", inputTokens: 1000 },
    ];
    for (const [index, changes] of calls.entries())
      await tx.save("usage", { ...call, ...changes, id: `aggregate-call-${index}` });
    const assets: Partial<CloudAssetVersion>[] = [
      { byteSize: 10, createdAt: new Date(from.getTime() - 1) },
      { byteSize: 20, verifiedAt: from },
      { byteSize: 30, verifiedAt: from, published: true },
      { byteSize: 40, expiresAt: new Date(from.getTime() - 1) },
      { byteSize: 4_294_967_297, cleanupClaimed: true },
      { byteSize: 1000, ownerAccountId: "user:bob" },
    ];
    await tx.remove("assets", asset.id);
    for (const [index, changes] of assets.entries())
      await tx.save("assets", {
        ...asset,
        ...changes,
        id: `aggregate-asset-${index}`,
        idempotencyKey: `aggregate-asset-intent-${index}`,
      });
    // A cancelled/expired lease remains active until its Run reaches a terminal state.
    await tx.save("runs", {
      ...run,
      createdAt: new Date(from.getTime() - 1),
      cancelRequested: true,
      leaseExpiresAt: new Date(from.getTime() - 1),
    });
    const statuses: CloudRunStatus[] = [
      "queued",
      "needs_input",
      "succeeded",
      "failed",
      "cancelled",
    ];
    for (const [index, status] of statuses.entries())
      await tx.save("runs", {
        ...run,
        id: `aggregate-run-${index}`,
        turnId: `aggregate-turn-${index}`,
        status,
        createdAt: until,
      });
    await tx.save("runs", {
      ...run,
      id: "aggregate-foreign-run",
      turnId: "aggregate-foreign-turn",
      ownerAccountId: "user:bob",
    });
    const totals = await tx.accountUsage(query);
    expect(totals).toEqual(expected);
    expect(Object.values(totals).every((value) => typeof value === "number")).toBe(true);
  });
  expect(await repository.read((tx) => tx.accountUsage(query))).toEqual(expected);
  expect(await service.getUsage({ actorId: "alice" })).toMatchObject(expected);
  await repository.transaction(["account:user:alice"], async (tx) => {
    await tx.remove("assets", "aggregate-asset-4");
    expect((await tx.accountUsage(query)).storageBytes).toBe(100);
  });
  expect((await service.getUsage({ actorId: "alice" })).storageBytes).toBe(100);
}

export async function exerciseUTCMonthBudget(repository: CloudRepository) {
  let time = new Date("2026-10-31T23:59:59.900Z");
  const service = createCloudApplication({
    repository,
    now: () => time,
    limits: { accountCalls: 1 },
  });
  const conversation = await service.createConversation({
    actorId: "alice",
    title: "Month",
    idempotencyKey: "month-c",
  });
  const initial = await service.sendTurn({
    actorId: "alice",
    conversationId: conversation.id,
    mode: "computer",
    prompt: "Same round across a month",
    idempotencyKey: "month-turn",
  });
  const first = await claim(service, initial.run.id);
  await charge(service, first, "october-call");
  expect((await service.getUsage({ actorId: "alice" })).calls).toBe(1);
  await service.finish({ ...first.fence, status: "failed" });
  await expect(
    service.retryRun({
      actorId: "alice",
      runId: initial.run.id,
      idempotencyKey: "october-blocked",
    }),
  ).rejects.toMatchObject({ code: "CLOUD_BUDGET_EXCEEDED" });
  time = new Date("2026-11-01T00:00:00.000Z");
  expect((await service.getUsage({ actorId: "alice" })).calls).toBe(0);
  expect((await service.getUsage({ actorId: "alice" })).inputTokens).toBe(0);
  const retry = await service.retryRun({
    actorId: "alice",
    runId: initial.run.id,
    idempotencyKey: "november-retry",
  });
  expect(retry.roundId).toBe(initial.run.roundId);
  const second = await claim(service, retry.id);
  await charge(service, second, "november-call");
  await expect(
    service.reserveUsage({
      ...second.fence,
      callId: "november-blocked",
      executionId: second.execution.id,
      provider: "provider",
      model: "model",
      reservedTokens: 100,
    }),
  ).rejects.toMatchObject({ code: "CLOUD_BUDGET_EXCEEDED" });
  expect((await service.getUsage({ actorId: "alice" })).calls).toBe(1);
  expect(
    await repository.read((tx) => tx.list("usage", { roundId: initial.run.roundId! })),
  ).toHaveLength(2);
}
export async function exerciseSearchBudget(repository: CloudRepository) {
  let time = new Date("2026-10-08T00:00:00Z");
  const service = createCloudApplication({ repository, now: () => time });
  const conversation = await service.createConversation({
    actorId: "alice",
    title: "Search",
    idempotencyKey: "search-limit-c",
  });
  const initial = await service.sendTurn({
    actorId: "alice",
    conversationId: conversation.id,
    mode: "search",
    prompt: "Search",
    idempotencyKey: "search-limit-turn",
  });
  const first = await claim(service, initial.run.id);
  for (let index = 0; index < 6; index++) await charge(service, first, `search-call-${index}`);
  await expect(
    service.reserveUsage({
      ...first.fence,
      callId: "seventh-search-call",
      executionId: first.execution.id,
      provider: "provider",
      model: "model",
      reservedTokens: 100,
    }),
  ).rejects.toMatchObject({ code: "CLOUD_BUDGET_EXCEEDED" });
  await service.finish({ ...first.fence, status: "failed" });
  const retry = await service.retryRun({
    actorId: "alice",
    runId: initial.run.id,
    idempotencyKey: "search-limit-retry",
  });
  const second = await claim(service, retry.id);
  await charge(service, second, "search-retry-call");
  for (let index = 0; index < 3; index++) {
    time = new Date(time.getTime() + 20_000);
    await service.heartbeat(second.fence);
  }
  await expect(
    service.reserveUsage({
      ...second.fence,
      callId: "expired-search-call",
      executionId: second.execution.id,
      provider: "provider",
      model: "model",
      reservedTokens: 100,
    }),
  ).rejects.toMatchObject({ code: "CLOUD_BUDGET_EXCEEDED" });
}
export async function exerciseComputerRunDuration(repository: CloudRepository) {
  let time = new Date("2026-10-08T00:00:00Z");
  const service = createCloudApplication({
    repository,
    now: () => time,
    limits: { taskCalls: 2, taskDurationMs: 1000 },
  });
  const conversation = await service.createConversation({
    actorId: "alice",
    title: "Duration",
    idempotencyKey: "duration-c",
  });
  const initial = await service.sendTurn({
    actorId: "alice",
    conversationId: conversation.id,
    mode: "computer",
    prompt: "Long-running goal",
    idempotencyKey: "duration-turn",
  });
  const first = await claim(service, initial.run.id);
  await charge(service, first, "duration-call-one");
  time = new Date(time.getTime() + 1000);
  await expect(
    service.reserveUsage({
      ...first.fence,
      callId: "expired-computer-call",
      executionId: first.execution.id,
      provider: "provider",
      model: "model",
      reservedTokens: 100,
    }),
  ).rejects.toMatchObject({ code: "CLOUD_BUDGET_EXCEEDED" });
  await service.finish({ ...first.fence, status: "failed" });
  const retry = await service.retryRun({
    actorId: "alice",
    runId: initial.run.id,
    idempotencyKey: "duration-retry",
  });
  const second = await claim(service, retry.id);
  expect(retry.roundId).toBe(initial.run.roundId);
  await charge(service, second, "duration-call-two");
  await expect(
    service.reserveUsage({
      ...second.fence,
      callId: "round-budget-exhausted",
      executionId: second.execution.id,
      provider: "provider",
      model: "model",
      reservedTokens: 100,
    }),
  ).rejects.toMatchObject({ code: "CLOUD_BUDGET_EXCEEDED" });
  expect(
    (await service.getTask({ actorId: "alice", taskId: initial.task!.id })).rounds,
  ).toHaveLength(1);
}
