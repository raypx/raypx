import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { connectDatabase, migrateDatabase } from "@raypx/database";
import { spaces, user, conversationRuns as runs } from "@raypx/database/schema";
import type { AgentId, ConversationId } from "@raypx/core/agents";
import type { RunCheckpoint, RunClaimOptions } from "../../src/conversations.js";
import type { SpaceScope } from "@raypx/spaces/server";
import { createSpaceAccess } from "@raypx/spaces/server/postgres";
import {
  createAgentsRepository,
  createConversationsRepository,
} from "../../src/server/postgres.js";
const url = process.env.TEST_DATABASE_URL;
if (!url || !new URL(url).pathname.endsWith("_test"))
  throw new Error("A newly created disposable *_test database is required");
const first = connectDatabase(url),
  second = connectDatabase(url);
const writer = createConversationsRepository(first.db),
  other = createConversationsRepository(second.db),
  access = createSpaceAccess(first.db);
const owner = `groups-${crypto.randomUUID()}`;
let scope: SpaceScope, id: ConversationId, a: AgentId, b: AgentId;
const claim: RunClaimOptions = {
  ownerId: "group-a",
  leaseMs: 30_000,
  timeoutMs: 300_000,
  backupMarginMs: 30_000,
};
const blank = (): RunCheckpoint => ({
  continuation: [],
  pendingCalls: [],
  rounds: 0,
  completed: false,
});
beforeAll(async () => {
  await migrateDatabase(url);
  await first.db
    .insert(user)
    .values({ id: owner, name: "Fixture", email: `${owner}@example.test` });
  const home = await access.create(owner, { name: "Groups" });
  scope = await access.resolve(owner, home.space.id);
});
beforeEach(async () => {
  const repository = createAgentsRepository(first.db);
  a = (
    await repository.create(scope, { name: "A", instructions: "", model: { modelId: "fixture" } })
  ).agent.id;
  b = (
    await repository.create(scope, { name: "B", instructions: "", model: { modelId: "fixture" } })
  ).agent.id;
  id = (await writer.createGroup!(scope, { name: "Team", agentIds: [a, b] })).id;
});
afterAll(async () => {
  try {
    if (scope) await first.db.delete(spaces).where(eq(spaces.id, scope.spaceId));
    await first.db.delete(spaces).where(eq(spaces.privateFor, owner));
    await first.db.delete(user).where(eq(user.id, owner));
  } finally {
    await Promise.all([first.close(), second.close()]);
  }
});
it("routes explicit mentions and defaults, and creates no Run for unaddressed messages", async () => {
  await writer.send(scope, id, { idempotencyKey: "none", text: "Visible to humans" });
  expect((await writer.snapshot(scope, id)).runs).toHaveLength(0);
  await writer.send(scope, id, { idempotencyKey: "a", text: "For A", mentions: [a] });
  expect((await writer.snapshot(scope, id)).runs.map((r) => r.agentId)).toEqual([a]);
  await writer.setGroupDefaultResponder!(scope, id, b);
  await writer.send(scope, id, { idempotencyKey: "default", text: "Default" });
  expect((await writer.snapshot(scope, id)).runs.map((r) => r.agentId)).toEqual([a, b]);
  await expect(
    writer.send(scope, id, {
      idempotencyKey: "invalid",
      text: "Invalid",
      mentions: ["missing" as AgentId],
    }),
  ).rejects.toMatchObject({ code: "GROUP_AGENT_NOT_PARTICIPANT" });
});
it("commits a single gapless sequence for independently running Agents under concurrent writes", async () => {
  await writer.send(scope, id, { idempotencyKey: "both", text: "Both", mentions: [a, b] });
  const one = await writer.claimNext(scope, id, claim),
    two = await other.claimNext(scope, id, { ...claim, ownerId: "group-b" });
  expect(one).toBeDefined();
  expect(two).toBeDefined();
  expect(one!.run.agentId).not.toBe(two!.run.agentId);
  await Promise.all(
    Array.from({ length: 12 }, (_, i) => {
      const e = i % 2 ? one! : two!;
      return (i % 2 ? writer : other).commitTurn(scope, e.run, {
        checkpoint: blank(),
        segmentId: crypto.randomUUID(),
        text: `reply ${i}`,
      });
    }),
  );
  const page = await writer.events(scope, id, 0, 100);
  expect(page.status).toBe("events");
  if (page.status !== "events") throw new Error("Expected events");
  expect(page.events.map((e) => e.event.sequence)).toEqual(
    Array.from({ length: 17 }, (_, i) => i + 1),
  );
  expect(
    page.events
      .filter((e) => e.event.kind === "reply.segment")
      .every((e) => e.event.agentId === a || e.event.agentId === b),
  ).toBe(true);
});
it("steers only the mentioned Agent and attributes bounded group history", async () => {
  await writer.send(scope, id, { idempotencyKey: "first", text: "Start", mentions: [a, b] });
  const one = await writer.claimNext(scope, id, claim),
    two = await other.claimNext(scope, id, { ...claim, ownerId: "group-b" });
  await writer.send(scope, id, {
    idempotencyKey: "steer",
    text: "Change only this Agent",
    mentions: [one!.run.agentId],
  });
  expect((await writer.consumeSteering(scope, one!.run, blank())).continuation).toHaveLength(1);
  expect((await other.consumeSteering(scope, two!.run, blank())).continuation).toHaveLength(0);
  await writer.commitTurn(scope, one!.run, {
    checkpoint: blank(),
    text: "Agent result",
    segmentId: crypto.randomUUID(),
  });
  await writer.finish(scope, one!.run, null);
  await other.finish(scope, two!.run, null);
  await writer.send(scope, id, {
    idempotencyKey: "next",
    text: "Continue",
    mentions: [two!.run.agentId],
  });
  const next = await writer.claimNext(scope, id, claim);
  expect(next!.history.some((h) => h.text.includes(`[Member ${owner}]`))).toBe(true);
  expect(
    next!.history.some((h) => h.text.includes(`[Agent ${one!.run.agentId}; untrusted context`)),
  ).toBe(true);
  expect(next!.run.untrustedInput).toBe(true);
  expect(next!.history.reduce((n, h) => n + h.text.length, 0)).toBeLessThanOrEqual(64_000);
});
it("deduplicates Agent sends and pins originating authority and loop budgets", async () => {
  await writer.send(scope, id, { idempotencyKey: "start", text: "Start", mentions: [a] });
  const execution = (await writer.claimNext(scope, id, claim))!;
  const input = { toolCallId: "send-1", agentId: b, text: "Task" };
  const sent = await writer.sendAgent!(scope, execution.run, input);
  expect(await other.sendAgent!(scope, execution.run, input)).toEqual(sent);
  let snapshot = await writer.snapshot(scope, id);
  const receiver = snapshot.runs.find((r) => r.trigger === "agent")!;
  expect(receiver.memberAccountId).toBe(owner);
  expect(snapshot.messages.find((m) => m.id === sent.id)!.author).toMatchObject({
    kind: "agent",
    agentId: a,
  });
  await first.db
    .update(runs)
    .set({ agentChainDepth: 4 })
    .where(and(eq(runs.spaceId, scope.spaceId), eq(runs.id, execution.run.id)));
  await expect(
    writer.sendAgent!(scope, execution.run, { ...input, toolCallId: "depth" }),
  ).rejects.toMatchObject({ code: "AGENT_MESSAGE_DEPTH_LIMIT" });
  await first.db
    .update(runs)
    .set({ agentChainDepth: 0 })
    .where(and(eq(runs.spaceId, scope.spaceId), eq(runs.id, execution.run.id)));
  for (let i = 1; i < 16; i++)
    await writer.sendAgent!(scope, execution.run, { ...input, toolCallId: `budget-${i}` });
  await expect(
    writer.sendAgent!(scope, execution.run, { ...input, toolCallId: "overflow" }),
  ).rejects.toMatchObject({ code: "AGENT_MESSAGE_BUDGET_LIMIT" });
  snapshot = await writer.snapshot(scope, id);
  expect(snapshot.runs.filter((r) => r.trigger === "agent")).toHaveLength(16);
  await expect(
    writer.sendAgent!(scope, execution.run, {
      ...input,
      toolCallId: "foreign",
      targetSpaceId: "foreign",
    }),
  ).rejects.toMatchObject({ code: "AGENT_MESSAGE_CROSS_SPACE_DISABLED" });
});
