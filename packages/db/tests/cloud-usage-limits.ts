import { expect } from "vite-plus/test";
import { createCloudApplication } from "@voidmix/application";
import type { CloudApplication } from "@voidmix/application";
import type { CloudRepository } from "@voidmix/core";

async function claim(service: CloudApplication, runId: string) {
  await service.acceptQueued({ runId });
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
