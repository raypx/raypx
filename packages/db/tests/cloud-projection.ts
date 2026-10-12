import { expect } from "vite-plus/test";
import { createCloudApplication } from "@voidmix/application";
import type { CloudRepository } from "@voidmix/core";

export async function exerciseMessageProjection(repository: CloudRepository) {
  const service = createCloudApplication({ repository });
  const conversation = await service.createConversation({
    actorId: "alice",
    title: "History",
    idempotencyKey: "history-c",
  });
  const { run } = await service.sendTurn({
    actorId: "alice",
    conversationId: conversation.id,
    prompt: "Research",
    mode: "search",
    idempotencyKey: "history-turn",
  });
  await service.acceptQueued({ runId: run.id });
  const claimed = (await service.claim({ runId: run.id, ownerId: "worker" }))!;
  const fence = { runId: run.id, ownerId: "worker", epoch: claimed.epoch };
  for (let i = 0; i < 205; i++)
    await service.appendEvent({
      ...fence,
      eventId: `delta-${i}`,
      type: "message.delta",
      payload: { messageId: "stable-message", text: "x" },
    });
  await service.appendEvent({
    ...fence,
    eventId: "complete",
    type: "message.completed",
    payload: { messageId: "stable-message", text: "Authoritative complete message" },
  });
  const snapshot = await service.getRunSnapshot({ actorId: "alice", runId: run.id });
  expect(snapshot.events).toHaveLength(200);
  expect(snapshot.historyTruncated).toBe(true);
  expect(snapshot.cursor).toBe(snapshot.run.lastSequence);
  expect(snapshot.messages).toMatchObject([
    { messageId: "stable-message", text: "Authoritative complete message", completed: true },
  ]);
  expect(snapshot.messages[0]!.createdAt).toBeInstanceOf(Date);
  const older = await service.listEvents({
    actorId: "alice",
    runId: run.id,
    afterSequence: 0,
    beforeSequence: snapshot.historyCursor!,
    limit: 100,
  });
  expect(older.items.map((event) => event.sequence)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  expect(older.hasMore).toBe(false);
  await service.appendEvent({
    ...fence,
    eventId: "late-delta",
    type: "message.delta",
    payload: { messageId: "stable-message", text: "must not overwrite complete" },
  });
  const tail = await service.listEvents({
    actorId: "alice",
    runId: run.id,
    afterSequence: snapshot.cursor,
    limit: 100,
  });
  expect(tail.items.map((event) => event.sequence)).toEqual([snapshot.cursor + 1]);
  expect(
    (await service.getRunSnapshot({ actorId: "alice", runId: run.id })).messages[0]!.text,
  ).toBe("Authoritative complete message");
}

export async function exerciseActiveRunRace(repository: CloudRepository) {
  const service = createCloudApplication({ repository });
  const conversation = await service.createConversation({
    actorId: "alice",
    title: "Race",
    idempotencyKey: "race-c",
  });
  const task = await service.createTask({
    actorId: "alice",
    title: "Race",
    goal: "One active",
    idempotencyKey: "race-task",
  });
  const input = {
    actorId: "alice",
    conversationId: conversation.id,
    taskId: task.id,
    roundId: task.currentRoundId,
    goalVersion: task.goalVersion,
    prompt: "Go",
    mode: "computer" as const,
  };
  const attempts = await Promise.allSettled([
    service.sendTurn({ ...input, idempotencyKey: "race-one" }),
    service.sendTurn({ ...input, idempotencyKey: "race-two" }),
  ]);
  expect(attempts.filter((item) => item.status === "fulfilled")).toHaveLength(1);
  expect(attempts.find((item) => item.status === "rejected")).toMatchObject({
    reason: { code: "CLOUD_RUN_ACTIVE" },
  });
  const active = (await service.getTask({ actorId: "alice", taskId: task.id })).runs[0]!;
  await service.acceptQueued({ runId: active.id });
  await Promise.all([
    service.createCommand({
      actorId: "alice",
      runId: active.id,
      type: "cancel",
      idempotencyKey: "race-cancel",
    }),
    service.claim({ runId: active.id, ownerId: "race-host" }),
  ]);
  const final = (await service.getRunSnapshot({ actorId: "alice", runId: active.id })).run;
  expect(final.cancelRequested).toBe(true);
  expect(["cancelled", "running"]).toContain(final.status);
  if (final.status === "running")
    await service.finish({
      runId: final.id,
      ownerId: final.ownerId!,
      epoch: final.epoch,
      status: "cancelled",
    });
  expect((await service.getRunSnapshot({ actorId: "alice", runId: active.id })).run.status).toBe(
    "cancelled",
  );
}
