import { expect, it, vi } from "vitest";
import { createApiClient } from "@raypx/client/api";
import { controlAuth } from "@raypx/control/testing";
import type { AgentsRepository, ConversationsRepository } from "@raypx/agents/server";
import {
  agentSchema,
  agentIdSchema,
  agentInputSchema,
  conversationSchema,
} from "@raypx/core/agents";
import { conversationEventSchema, runSchema } from "@raypx/core/conversation";
import { resolveSpaceScope, type SpaceScope } from "@raypx/spaces/server";
import { spaceIdSchema } from "@raypx/core/spaces";
import { createApiApp } from "../helpers/app.js";

function fixture(lastActivityAt: string | null = "2026-11-14T09:00:00.000Z") {
  const accountId = `activity-${crypto.randomUUID()}`;
  const spaceId = spaceIdSchema.parse(`space-${crypto.randomUUID()}`);
  const now = "2026-11-14T08:00:00.000Z";
  const eventTime = lastActivityAt ?? now;
  const scope = resolveSpaceScope(
    { spaceId, accountId, role: "member", createdAt: now },
    accountId,
    spaceId,
  );
  const auth = controlAuth(accountId);
  const agent = agentSchema.parse({
    id: "agent-support",
    spaceId,
    name: "Support",
    instructions: "",
    model: { modelId: "model" },
    createdAt: now,
    updatedAt: now,
    lastActivityAt,
  });
  const conversation = conversationSchema.parse({
    id: "direct-support",
    spaceId,
    agentId: agent.id,
    kind: "direct",
    createdAt: now,
    lastActivityAt,
  });
  const group = conversationSchema.parse({
    ...conversation,
    id: "group-support",
    kind: "group",
    name: "Support team",
    agentIds: [agent.id, agentIdSchema.parse("agent-research")],
    defaultResponderAgentId: null,
  });
  const run = runSchema.parse({
    id: "run-support",
    spaceId,
    conversationId: conversation.id,
    agentId: agent.id,
    trigger: "message",
    messageId: "message-support",
    memberAccountId: accountId,
    model: agent.model,
    state: "queued",
    failureCode: null,
    createdAt: eventTime,
    startedAt: null,
    firstResponseAt: null,
    finishedAt: null,
    untrustedInput: false,
  });
  const event = {
    ...conversationEventSchema.parse({
      kind: "run.state",
      spaceId,
      conversationId: conversation.id,
      sequence: 2,
      createdAt: eventTime,
      runId: run.id,
      state: "queued",
      failureCode: null,
      trigger: "message",
      routineId: null,
      provenanceKind: null,
      untrustedInput: false,
    }),
  };
  const admitted = vi.fn((current: SpaceScope) => expect(current).toBe(scope));
  async function groupResult(current: SpaceScope) {
    admitted(current);
    return group;
  }
  const agents: AgentsRepository = {
    async list(current, limit) {
      admitted(current);
      expect(limit).toBe(20);
      return [{ agent, conversation }];
    },
    async get(current, id) {
      admitted(current);
      expect(id).toBe(agent.id);
      return { agent, conversation };
    },
    async create(current, input) {
      admitted(current);
      agentInputSchema.parse(input);
      return {
        agent: { ...agent, ...input, lastActivityAt: null },
        conversation: { ...conversation, lastActivityAt: null },
      };
    },
    async update(current, id, input) {
      admitted(current);
      expect(id).toBe(agent.id);
      agentInputSchema.parse(input);
      return { agent: { ...agent, ...input }, conversation };
    },
    async delete() {
      throw new Error("Unused");
    },
  };
  const conversations: ConversationsRepository = {
    async send() {
      throw new Error("Unused");
    },
    async stop() {
      throw new Error("Unused");
    },
    async retainAfter() {
      throw new Error("Unused");
    },
    async events(current, id, after, limit) {
      admitted(current);
      expect([id, after, limit]).toEqual([conversation.id, 0, 20]);
      return { status: "events", events: [{ event }], cursor: 2, hasMore: false };
    },
    async snapshot(current, id) {
      admitted(current);
      expect(id).toBe(conversation.id);
      return { conversation, messages: [], runs: [run], segments: [], cursor: 2 };
    },
    async history(current, id, limit, before) {
      admitted(current);
      expect([id, limit, before]).toEqual([conversation.id, 20, undefined]);
      return {
        conversation,
        messages: [],
        runs: [run],
        segments: [],
        cursor: 2,
        olderCursor: null,
        runsTruncated: false,
        segmentsTruncated: false,
      };
    },
    async listGroups(current, limit) {
      admitted(current);
      expect(limit).toBe(20);
      return [group];
    },
    getGroup: groupResult,
    createGroup: groupResult,
    renameGroup: groupResult,
    addGroupAgent: groupResult,
    removeGroupAgent: groupResult,
    setGroupDefaultResponder: groupResult,
  };
  const app = createApiApp({
    agents,
    conversations,
    spaces: {
      async resolve(caller, selector) {
        expect([caller, selector]).toEqual([accountId, spaceId]);
        return scope;
      },
      async list() {
        return [];
      },
      async create() {
        throw new Error("Unused");
      },
    },
    readSession: async () => auth,
    allowedOrigins: ["https://web.example.test"],
  });
  const client = createApiClient({
    baseUrl: "https://api.example.test",
    headers: { origin: "https://web.example.test" },
    fetch: async (url, init) => app.fetch(new Request(url, init)),
  });
  return { client, spaceId, agent, conversation, group, run, event, lastActivityAt };
}

it("preserves Agent list and detail activity fields through the RPC output validator", async () => {
  const f = fixture();
  const input = { spaceId: f.spaceId, id: f.agent.id };
  expect((await f.client.agents.list({ spaceId: f.spaceId, limit: 20 }))[0]).toMatchObject({
    agent: { lastActivityAt: f.lastActivityAt },
    conversation: { lastActivityAt: f.lastActivityAt },
  });
  expect(await f.client.agents.get(input)).toMatchObject({
    agent: { lastActivityAt: f.lastActivityAt },
    conversation: { lastActivityAt: f.lastActivityAt },
  });
});

it.each([null, "2026-11-14T09:00:00.000Z"])(
  "keeps activity fields present across Agent CRUD and conversation reads (%s)",
  async (lastActivityAt) => {
    const f = fixture(lastActivityAt);
    const definition = {
      name: f.agent.name,
      instructions: f.agent.instructions,
      model: f.agent.model,
    };
    const created = await f.client.agents.create({ spaceId: f.spaceId, agent: definition });
    expect(created.agent.lastActivityAt).toBeNull();
    expect(created.conversation.lastActivityAt).toBeNull();
    const selected = { spaceId: f.spaceId, id: f.agent.id };
    const results = [
      await f.client.agents.get(selected),
      await f.client.agents.update({ ...selected, agent: definition }),
      ...(await f.client.agents.list({ spaceId: f.spaceId, limit: 20 })),
    ];
    for (const result of results) {
      expect(Object.keys(result.agent).sort()).toEqual(Object.keys(created.agent).sort());
      expect(Object.keys(result.conversation).sort()).toEqual(
        Object.keys(created.conversation).sort(),
      );
      expect(result.agent).toMatchObject({
        ...definition,
        id: f.agent.id,
        spaceId: f.spaceId,
        lastActivityAt,
      });
      expect(result.conversation).toMatchObject({
        id: f.conversation.id,
        spaceId: f.spaceId,
        agentId: f.agent.id,
        lastActivityAt,
      });
    }
    const conversationSelection = { spaceId: f.spaceId, conversationId: f.conversation.id };
    const windows = [
      await f.client.conversations.snapshot(conversationSelection),
      await f.client.conversations.history({ ...conversationSelection, limit: 20 }),
    ];
    for (const result of windows) {
      expect(Object.keys(result.conversation).sort()).toEqual(
        Object.keys(created.conversation).sort(),
      );
      expect(result.conversation).toMatchObject({
        id: f.conversation.id,
        spaceId: f.spaceId,
        agentId: f.agent.id,
        lastActivityAt,
      });
    }
  },
);

it("preserves activity on group reads and every group mutation returning a projection", async () => {
  const f = fixture();
  const selected = { spaceId: f.spaceId, conversationId: f.group.id };
  const results = [
    ...(await f.client.conversations.listGroups({ spaceId: f.spaceId, limit: 20 })),
    await f.client.conversations.getGroup(selected),
    await f.client.conversations.createGroup({
      spaceId: f.spaceId,
      name: "Support team",
      agentIds: f.group.agentIds!,
    }),
    await f.client.conversations.renameGroup({ ...selected, name: "Support team" }),
    await f.client.conversations.addGroupAgent({ ...selected, agentId: f.agent.id }),
    await f.client.conversations.removeGroupAgent({ ...selected, agentId: f.agent.id }),
    await f.client.conversations.setGroupDefaultResponder({ ...selected, agentId: null }),
  ];
  for (const result of results) expect(result.lastActivityAt).toBe(f.lastActivityAt);
});

it.each([
  ["message", null, false],
  ["routine", null, false],
  ["webhook", "webhook", true],
  ["email", "email", true],
  ["routine", "repository", true],
  ["agent", null, true],
] as const)(
  "preserves first-event origin fields for %s/%s through RPC",
  async (trigger, provenanceKind, untrustedInput) => {
    const f = fixture();
    if (f.event.kind !== "run.state") throw new Error("Expected Run state");
    Object.assign(f.event, {
      trigger,
      provenanceKind,
      untrustedInput,
      routineId: trigger === "message" || trigger === "agent" ? null : "routine-support",
    });
    Object.assign(f.run, {
      trigger,
      routineId: f.event.routineId,
      inboundProvenance: provenanceKind
        ? { kind: provenanceKind, routineId: "routine-support", deliveryId: "delivery-support" }
        : null,
      untrustedInput,
    });
    const selected = { spaceId: f.spaceId, conversationId: f.conversation.id };
    expect(await f.client.conversations.events({ ...selected, after: 0, limit: 20 })).toMatchObject(
      {
        events: [
          { event: { trigger, provenanceKind, untrustedInput, routineId: f.event.routineId } },
        ],
      },
    );
    expect(await f.client.conversations.snapshot(selected)).toMatchObject({
      runs: [{ trigger, routineId: f.event.routineId, untrustedInput }],
    });
  },
);
