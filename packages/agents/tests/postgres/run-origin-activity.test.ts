import { afterAll, afterEach, beforeAll, expect, it } from "vitest";
import { and, eq, inArray, sql } from "drizzle-orm";
import { connectDatabase, migrateDatabase } from "@raypx/database";
import { conversationEvents, spaceMembers, spaces, user } from "@raypx/database/schema";
import { spaceMemberSchema } from "@raypx/core/spaces";
import { routineInputSchema } from "@raypx/core/routines";
import { resolveSpaceScope } from "@raypx/spaces/server";
import { createRoutinesRepository } from "@raypx/jobs/routines/postgres";
import {
  createAgentsRepository,
  createConversationsRepository,
} from "../../src/server/postgres.js";

const url = process.env.TEST_DATABASE_URL;
if (!url || !/_test(?:_[a-z0-9]+)?$/.test(new URL(url).pathname))
  throw new Error("An isolated *_test or *_test_<lane> database is required");
const connection = connectDatabase(url);
const agents = createAgentsRepository(connection.db);
const conversations = createConversationsRepository(connection.db);
const routines = createRoutinesRepository(connection.db);
const spaceIds: string[] = [];
const accountIds: string[] = [];
const now = new Date("2026-11-14T08:00:00.000Z");
const claim = {
  ownerId: "origin-fixture",
  leaseMs: 30_000,
  timeoutMs: 300_000,
  backupMarginMs: 30_000,
};
beforeAll(() => migrateDatabase(url));
afterEach(async () => {
  if (spaceIds.length)
    await connection.db.delete(spaces).where(inArray(spaces.id, spaceIds.splice(0)));
  if (accountIds.length)
    await connection.db.delete(user).where(inArray(user.id, accountIds.splice(0)));
});
afterAll(() => connection.close());

async function fixture() {
  const accountId = `origin-${crypto.randomUUID()}`;
  const spaceId = `space-${crypto.randomUUID()}`;
  spaceIds.push(spaceId);
  accountIds.push(accountId);
  await connection.db
    .insert(user)
    .values({ id: accountId, name: "Origin member", email: `${accountId}@example.test` });
  await connection.db.insert(spaces).values({ id: spaceId, name: "Origin test" });
  const member = spaceMemberSchema.parse({
    spaceId,
    accountId,
    role: "owner",
    createdAt: now.toISOString(),
  });
  await connection.db.insert(spaceMembers).values({ ...member, createdAt: now });
  const scope = resolveSpaceScope(member, accountId, member.spaceId);
  const first = await agents.create(scope, {
    name: "First",
    instructions: "",
    model: { modelId: "fixture" },
  });
  const second = await agents.create(scope, {
    name: "Second",
    instructions: "",
    model: { modelId: "fixture" },
  });
  return { scope, first, second, accountId };
}

it("publishes message and Agent origins immediately, including delegated child state", async () => {
  const f = await fixture();
  const group = await conversations.createGroup!(f.scope, {
    name: "Origin team",
    agentIds: [f.first.agent.id, f.second.agent.id],
  });
  await conversations.send(f.scope, group.id, {
    idempotencyKey: "start",
    text: "Start",
    mentions: [f.first.agent.id],
  });
  const execution = (await conversations.claimNext(f.scope, group.id, claim))!;
  const sent = await conversations.sendAgent!(f.scope, execution.run, {
    toolCallId: "message-second",
    agentId: f.second.agent.id,
    text: "private-agent-message",
  });
  const child = await conversations.delegate!(f.scope, execution.run, {
    toolCallId: "delegate",
    task: "private-delegation-task",
  });
  const page = await conversations.events(f.scope, group.id, 0, 100);
  if (page.status !== "events") throw new Error("Expected events");
  const states = page.events
    .map((entry) => entry.event)
    .filter((event) => event.kind === "run.state")
    .filter((event) => event.state === "queued");
  expect(states.find((event) => event.runId === execution.run.id)).toMatchObject({
    trigger: "message",
    routineId: null,
    provenanceKind: null,
    untrustedInput: false,
  });
  const snapshot = await conversations.snapshot(f.scope, group.id);
  const agentRun = snapshot.runs.find((run) => run.messageId === sent.id)!;
  expect(states.find((event) => event.runId === agentRun.id)).toMatchObject({
    trigger: "agent",
    routineId: null,
    provenanceKind: null,
    untrustedInput: true,
  });
  expect(states.find((event) => event.runId === child.runId)).toMatchObject({
    trigger: "message",
    parentRunId: execution.run.id,
    provenanceKind: null,
    untrustedInput: false,
  });
  expect(JSON.stringify(states)).not.toMatch(
    /private-agent-message|private-delegation-task|example\.test/,
  );
});

it.each(["schedule", "manual", "webhook", "email", "repository"] as const)(
  "publishes %s origin and safe inbound provenance in its first committed event",
  async (kind) => {
    const f = await fixture();
    const id = crypto.randomUUID();
    const secretId = crypto.randomUUID();
    await routines.create(
      f.scope,
      id,
      routineInputSchema.parse({
        agentId: f.first.agent.id,
        name: "Origin routine",
        prompt: "private-saved-prompt",
        enabled: true,
        triggers: {
          schedule: { cron: "* * * * *", timezone: "UTC" },
          webhook: true,
          email: { allowedSender: "allowed@example.test" },
          repository: { events: ["push"] },
        },
      }),
      now,
      {
        webhookDigest: "fixture-digest",
        emailAddress: "routine@inbound.example.test",
        secret: {
          id: secretId,
          accountId: f.accountId,
          keyId: "fixture",
          wrappedDataKey: "fixture",
          ciphertext: "fixture",
        },
      },
    );
    const fired = await routines.fire(f.scope, id, {
      kind,
      id: crypto.randomUUID(),
      dueAt: now,
      now,
      bodyDigest: "fixture-body",
      expectedWebhookDigest: "fixture-digest",
      expectedSecretId: secretId,
      emailSender: "allowed@example.test",
      repositoryEvent: "push",
      untrustedText: "private-inbound-content",
    });
    const page = await conversations.events(f.scope, f.first.conversation.id, 0, 100);
    if (page.status !== "events") throw new Error("Expected events");
    const first = page.events
      .map((entry) => entry.event)
      .find((event) => event.kind === "run.state" && event.runId === fired.runId)!;
    const trigger = kind === "webhook" || kind === "email" ? kind : "routine";
    const inbound = kind !== "manual" && kind !== "schedule";
    expect(first).toMatchObject({
      trigger,
      routineId: id,
      provenanceKind: inbound ? kind : null,
      untrustedInput: inbound,
    });
    expect(JSON.stringify(first)).not.toMatch(
      /private-saved-prompt|private-inbound-content|fixture-digest|allowed@example/,
    );
    const snapshot = await conversations.snapshot(f.scope, f.first.conversation.id);
    expect(snapshot.runs[0]).toMatchObject({ trigger, routineId: id, untrustedInput: inbound });
    let inheritedProvenance;
    if (kind === "webhook") {
      const execution = (await conversations.claimNext(f.scope, f.first.conversation.id, claim))!;
      const child = await conversations.delegate!(f.scope, execution.run, {
        toolCallId: "inbound-child",
        task: "Analyze",
      });
      const delegated = await conversations.events(
        f.scope,
        f.first.conversation.id,
        page.cursor,
        100,
      );
      if (delegated.status !== "events") throw new Error("Expected events");
      inheritedProvenance = delegated.events.find(
        (entry) => entry.event.kind === "run.state" && entry.event.runId === child.runId,
      )?.event;
    }
    const expectedInherited = expect.objectContaining({
      trigger: "webhook",
      routineId: id,
      provenanceKind: "webhook",
      untrustedInput: true,
    });
    expect(inheritedProvenance).toEqual(kind === "webhook" ? expectedInherited : undefined);
  },
);

it("derives Agent and group activity from the newest event sequence, with null for an unused conversation", async () => {
  const f = await fixture();
  expect((await agents.list(f.scope, 100)).map((row) => row.agent.lastActivityAt)).toEqual([
    null,
    null,
  ]);
  const group = await conversations.createGroup!(f.scope, {
    name: "Activity team",
    agentIds: [f.first.agent.id, f.second.agent.id],
  });
  expect((await conversations.listGroups!(f.scope, 100))[0]?.lastActivityAt).toBeNull();
  await conversations.send(f.scope, f.first.conversation.id, {
    idempotencyKey: "first",
    text: "First",
  });
  await conversations.send(f.scope, f.second.conversation.id, {
    idempotencyKey: "second",
    text: "Second",
  });
  await conversations.send(f.scope, group.id, {
    idempotencyKey: "group",
    text: "Group",
    mentions: [f.first.agent.id, f.second.agent.id],
  });
  for (const [id, time] of [
    [f.first.conversation.id, "2026-11-14T10:00:00.000Z"],
    [f.second.conversation.id, "2026-11-14T11:00:00.000Z"],
    [group.id, "2026-11-14T12:00:00.000Z"],
  ] as const) {
    await connection.db
      .update(conversationEvents)
      .set({ createdAt: new Date(time) })
      .where(
        and(
          eq(conversationEvents.spaceId, f.scope.spaceId),
          eq(conversationEvents.conversationId, id),
        ),
      );
  }
  // Newest means the highest durable sequence, even when clocks moved backwards.
  await connection.db
    .update(conversationEvents)
    .set({ createdAt: new Date("2026-11-14T09:00:00.000Z") })
    .where(
      and(
        eq(conversationEvents.spaceId, f.scope.spaceId),
        eq(conversationEvents.conversationId, f.first.conversation.id),
        eq(conversationEvents.sequence, 2),
      ),
    );
  const listed = await agents.list(f.scope, 2);
  expect(listed).toHaveLength(2);
  expect(listed.find((row) => row.agent.id === f.first.agent.id)?.agent.lastActivityAt).toBe(
    "2026-11-14T09:00:00.000Z",
  );
  expect(
    listed.find((row) => row.agent.id === f.second.agent.id)?.conversation.lastActivityAt,
  ).toBe("2026-11-14T11:00:00.000Z");
  expect((await agents.get(f.scope, f.first.agent.id)).agent.lastActivityAt).toBe(
    "2026-11-14T09:00:00.000Z",
  );
  expect((await conversations.listGroups!(f.scope, 1))[0]?.lastActivityAt).toBe(
    "2026-11-14T12:00:00.000Z",
  );
  const indexes = await connection.db
    .select({ indexdef: sql<string>`indexdef` })
    .from(sql`pg_indexes`)
    .where(sql`schemaname = 'public' and indexname = 'conversation_events_activity_idx'`)
    .orderBy(sql`indexname`);
  expect(indexes[0]?.indexdef).toMatch(
    /space_id, conversation_id, sequence DESC(?: NULLS LAST)?, created_at/,
  );
});

it("keeps nullable activity present across Agent CRUD, group projections, snapshots and history", async () => {
  const f = await fixture();
  const definition = { name: "Renamed", instructions: "", model: { modelId: "fixture" } };
  expect(f.first.agent.lastActivityAt).toBeNull();
  expect(f.first.conversation.lastActivityAt).toBeNull();
  const emptyRecords = [
    await agents.get(f.scope, f.first.agent.id),
    await agents.update(f.scope, f.first.agent.id, definition),
    ...(await agents.list(f.scope, 100)),
  ];
  for (const result of emptyRecords) {
    expect(Object.keys(result.agent).sort()).toEqual(Object.keys(f.first.agent).sort());
    expect(Object.keys(result.conversation).sort()).toEqual(
      Object.keys(f.first.conversation).sort(),
    );
    expect(result.agent.lastActivityAt).toBeNull();
    expect(result.conversation.lastActivityAt).toBeNull();
  }
  const emptyWindows = [
    await conversations.snapshot(f.scope, f.first.conversation.id),
    await conversations.history!(f.scope, f.first.conversation.id, 10),
  ];
  for (const result of emptyWindows) {
    expect(Object.keys(result.conversation).sort()).toEqual(
      Object.keys(f.first.conversation).sort(),
    );
    expect(result.conversation).toMatchObject({
      id: f.first.conversation.id,
      agentId: f.first.agent.id,
      spaceId: f.scope.spaceId,
      lastActivityAt: null,
    });
  }
  await conversations.send(f.scope, f.first.conversation.id, {
    idempotencyKey: "activity-shape",
    text: "Work",
  });
  const events = await conversations.events(f.scope, f.first.conversation.id, 0, 100);
  if (events.status !== "events") throw new Error("Expected events");
  const lastActivityAt = events.events.at(-1)!.event.createdAt;
  const activeRecords = [
    await agents.get(f.scope, f.first.agent.id),
    await agents.update(f.scope, f.first.agent.id, {
      ...definition,
      name: "Edited after activity",
    }),
    (await agents.list(f.scope, 100)).find((record) => record.agent.id === f.first.agent.id)!,
  ];
  for (const result of activeRecords) {
    expect(Object.keys(result.agent).sort()).toEqual(Object.keys(f.first.agent).sort());
    expect(Object.keys(result.conversation).sort()).toEqual(
      Object.keys(f.first.conversation).sort(),
    );
    expect(result.agent).toMatchObject({
      id: f.first.agent.id,
      spaceId: f.scope.spaceId,
      lastActivityAt,
    });
    expect(result.conversation).toMatchObject({
      id: f.first.conversation.id,
      spaceId: f.scope.spaceId,
      agentId: f.first.agent.id,
      lastActivityAt,
    });
  }
  const activeWindows = [
    await conversations.snapshot(f.scope, f.first.conversation.id),
    await conversations.history!(f.scope, f.first.conversation.id, 10),
  ];
  for (const result of activeWindows)
    expect(result.conversation.lastActivityAt).toBe(lastActivityAt);

  const group = await conversations.createGroup!(f.scope, {
    name: "Group shape",
    agentIds: [f.first.agent.id, f.second.agent.id],
  });
  expect(group.lastActivityAt).toBeNull();
  const emptyGroups = [
    await conversations.getGroup!(f.scope, group.id),
    ...(await conversations.listGroups!(f.scope, 100)),
    (await conversations.snapshot(f.scope, group.id)).conversation,
    (await conversations.history!(f.scope, group.id, 10)).conversation,
  ];
  for (const result of emptyGroups) {
    expect(Object.keys(result).sort()).toEqual(Object.keys(group).sort());
    expect(result).toMatchObject({
      id: group.id,
      spaceId: f.scope.spaceId,
      kind: "group",
      name: "Group shape",
      agentIds: group.agentIds,
      defaultResponderAgentId: null,
      lastActivityAt: null,
    });
  }
  await conversations.send(f.scope, group.id, {
    idempotencyKey: "group-activity-shape",
    text: "Group work",
  });
  const groupEvents = await conversations.events(f.scope, group.id, 0, 100);
  if (groupEvents.status !== "events") throw new Error("Expected group events");
  const groupActivity = groupEvents.events.at(-1)!.event.createdAt;
  const activeGroups = [
    await conversations.getGroup!(f.scope, group.id),
    ...(await conversations.listGroups!(f.scope, 100)),
    await conversations.renameGroup!(f.scope, group.id, "Renamed group"),
    await conversations.setGroupDefaultResponder!(f.scope, group.id, f.second.agent.id),
    (await conversations.snapshot(f.scope, group.id)).conversation,
    (await conversations.history!(f.scope, group.id, 10)).conversation,
  ];
  for (const result of activeGroups) {
    expect(Object.keys(result).sort()).toEqual(Object.keys(group).sort());
    expect(result).toMatchObject({
      id: group.id,
      spaceId: f.scope.spaceId,
      kind: "group",
      lastActivityAt: groupActivity,
    });
  }
});
