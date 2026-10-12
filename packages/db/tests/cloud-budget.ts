import { expect } from "vite-plus/test";
import { createCloudApplication, type CloudApplication } from "@voidmix/application";
import type { CloudRepository } from "@voidmix/core";

/** Both adapters must charge the same Task across distinct requesting accounts. */
export async function exerciseSharedTaskBudget(
  service: CloudApplication,
  repository: CloudRepository,
  projectId: string,
) {
  async function claim(runId: string) {
    await service.acceptQueued({ runId });
    const claimed = (await service.claim({ runId, ownerId: "worker" }))!;
    const fence = { runId, ownerId: "worker", epoch: claimed.epoch };
    const execution = await service.startExecution({ ...fence, role: "main", prompt: "Research" });
    return { fence, execution };
  }
  async function charge(runId: string, callId: string) {
    const { fence, execution } = await claim(runId);
    await service.reserveUsage({
      ...fence,
      executionId: execution.id,
      callId,
      provider: "provider",
      model: "model",
      reservedTokens: 100,
    });
    await service.startUsage({ ...fence, callId });
    await service.settleUsage({ ...fence, callId, inputTokens: 50, outputTokens: 20 });
    return fence;
  }
  const personal = await service.createConversation({
    actorId: "bob",
    title: "Unrelated",
    idempotencyKey: "personal",
  });
  const unrelated = await service.sendTurn({
    actorId: "bob",
    conversationId: personal.id,
    prompt: "Other",
    mode: "search",
    idempotencyKey: "unrelated",
  });
  await service.finish({
    ...(await charge(unrelated.run.id, "unrelated-call")),
    status: "succeeded",
    output: "Other result",
  });
  const conversation = await service.createConversation({
    actorId: "alice",
    projectId,
    title: "Shared",
    idempotencyKey: "shared",
  });
  await expect(
    service.sendTurn({
      actorId: "bob",
      conversationId: conversation.id,
      prompt: "Unauthorized spending",
      mode: "search",
      idempotencyKey: "no-spending",
    }),
  ).rejects.toMatchObject({ code: "CLOUD_ACCESS_DENIED" });
  await service.setSpendingGrant({
    actorId: "alice",
    projectId,
    userId: "bob",
    allowed: true,
    idempotencyKey: "bob-spending",
  });
  expect(await service.listSpendingGrants({ actorId: "alice", projectId })).toEqual({
    items: [{ userId: "bob", allowed: true }],
  });
  await expect(service.listSpendingGrants({ actorId: "bob", projectId })).rejects.toMatchObject({
    code: "CLOUD_ACCESS_DENIED",
  });
  const first = await service.sendTurn({
    actorId: "alice",
    conversationId: conversation.id,
    prompt: "Task",
    mode: "computer",
    idempotencyKey: "alice-task",
  });
  await service.finish({
    ...(await charge(first.run.id, "shared-call")),
    status: "failed",
    error: "retry needed",
  });
  const next = await service.sendTurn({
    actorId: "bob",
    conversationId: conversation.id,
    taskId: first.task!.id,
    roundId: first.task!.currentRoundId,
    goalVersion: first.task!.goalVersion,
    prompt: "Retry",
    mode: "computer",
    idempotencyKey: "bob-task",
  });
  expect(next.run.ownerAccountId).toBe("user:alice");
  expect((await service.getUsage({ actorId: "alice" })).calls).toBe(1);
  expect((await service.getUsage({ actorId: "bob" })).calls).toBe(1);
  expect((await service.getUsage({ actorId: "bob", projectId })).calls).toBe(1);
  const claimed = await claim(next.run.id);
  await expect(
    service.reserveUsage({
      ...claimed.fence,
      executionId: claimed.execution.id,
      callId: "blocked-call",
      provider: "provider",
      model: "model",
      reservedTokens: 100,
    }),
  ).rejects.toMatchObject({ code: "CLOUD_BUDGET_EXCEEDED" });
  expect(
    (await repository.read((tx) => tx.list("usage", { runIds: [first.run.id] }))).map(
      (call) => call.id,
    ),
  ).toEqual(["shared-call"]);
  expect(await repository.read((tx) => tx.list("usage", { runIds: [] }))).toEqual([]);
  const cancel = await service.createCommand({
    actorId: "alice",
    runId: next.run.id,
    type: "cancel",
    idempotencyKey: "cancel-shared",
  });
  const control = createCloudApplication({
    repository: {
      read: (operation) =>
        repository.read((tx) =>
          operation({
            ...tx,
            events: async () => {
              throw new Error("Control polling must not read event history.");
            },
          }),
        ),
      transaction: (keys, operation) => repository.transaction(keys, operation),
    },
  });
  const current = await control.workerControl(claimed.fence);
  expect(current.run.cancelRequested).toBe(true);
  expect(current.commands.map((command) => command.id)).toEqual([cancel.id]);
  await service.setSpendingGrant({
    actorId: "alice",
    projectId,
    userId: "bob",
    allowed: false,
    idempotencyKey: "revoke-bob-spending",
  });
  await expect(service.validateFence(claimed.fence)).rejects.toMatchObject({
    code: "CLOUD_ACCESS_DENIED",
  });
  const cancelled = await service.finish({ ...claimed.fence, status: "cancelled" });
  expect(cancelled.status).toBe("cancelled");
}
