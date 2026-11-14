import { expect, it, vi } from "vitest";
import { z } from "zod";
import { createApiClient } from "@raypx/client/api";
import { conversationIdSchema, conversationSchema } from "@raypx/core/agents";
import type { AuthSession } from "@raypx/core/auth";
import {
  conversationHistoryCursorSchema,
  InvalidConversationCursor,
  messageSchema,
  replySegmentSchema,
  runSchema,
} from "@raypx/core/conversation";
import { SpaceNotFound, spaceIdSchema, spaceMemberSchema } from "@raypx/core/spaces";
import type { ConversationSnapshot, ConversationsRepository } from "@raypx/agents/server";
import { resolveSpaceScope, type SpaceScope } from "@raypx/spaces/server";
import { createApiApp } from "../helpers/app.js";

type ConversationHistory = Awaited<ReturnType<NonNullable<ConversationsRepository["history"]>>>;

function fixture(kind: "direct" | "group" = "direct") {
  const accountId = `history-reader-${crypto.randomUUID()}`;
  const departedId = `history-departed-${crypto.randomUUID()}`;
  const spaceId = spaceIdSchema.parse(`history-space-${crypto.randomUUID()}`);
  const conversationId = conversationIdSchema.parse(crypto.randomUUID());
  const instant = "2026-11-14T00:00:00.000Z";
  const scope = resolveSpaceScope(
    spaceMemberSchema.parse({ spaceId, accountId, role: "member", createdAt: instant }),
    accountId,
    spaceId,
  );
  const conversation = conversationSchema.parse({
    id: conversationId,
    spaceId,
    agentId: "history-agent",
    kind,
    createdAt: instant,
    ...(kind === "group"
      ? { name: "Research", agentIds: ["history-agent", "research-agent"] }
      : {}),
  });
  const messages = [1, 4, 8].map((sequence) =>
    messageSchema.parse({
      id: `history-message-${sequence}`,
      spaceId,
      conversationId,
      sequence,
      author: { kind: "member", accountId: departedId },
      text: `Message ${sequence}`,
      createdAt: instant,
    }),
  );
  const run = runSchema.parse({
    id: "history-parent-run",
    spaceId,
    conversationId,
    agentId: conversation.agentId,
    trigger: "message",
    parentRunId: null,
    messageId: messages[2]!.id,
    memberAccountId: departedId,
    model: { modelId: "history-model" },
    state: "succeeded",
    failureCode: null,
    createdAt: instant,
    startedAt: instant,
    firstResponseAt: instant,
    finishedAt: instant,
  });
  const child = runSchema.parse({
    ...run,
    id: "history-child-run",
    trigger: "agent",
    parentRunId: run.id,
  });
  const segment = replySegmentSchema.parse({
    id: "history-segment",
    spaceId,
    conversationId,
    runId: run.id,
    agentId: run.agentId,
    parentRunId: null,
    sequence: 10,
    text: "Research result",
    createdAt: instant,
  });
  const expectedSnapshot: ConversationSnapshot = {
    conversation,
    messages,
    runs: [run, child],
    segments: [segment],
    cursor: 12,
    toolActivity: [
      {
        runId: child.id,
        agentId: child.agentId,
        parentRunId: run.id,
        toolCallId: "historical-call",
        toolName: "computer_read_file",
        target: "workspace",
        argumentSummary: "Read one file",
        startedAt: instant,
        finishedAt: instant,
        outcome: "succeeded",
        durationMs: 10,
        exitStatus: null,
      },
    ],
    toolActivityTruncated: false,
    participants: [
      { accountId, displayName: "Current reader", isMember: true },
      { accountId: departedId, displayName: "Retained participant", isMember: false },
    ],
    participantsTruncated: false,
    resolvedApprovals: [
      {
        requestId: "historical-request",
        runId: child.id,
        toolCallId: "historical-call",
        outcome: "approved",
        answeredByAccountId: departedId,
        resolvedAt: instant,
      },
    ],
    resolvedApprovalsTruncated: false,
  };
  const expectedHistory: ConversationHistory = {
    ...expectedSnapshot,
    messages: messages.slice(-1),
    olderCursor: { spaceId, conversationId, beforeSequence: 8 },
    runsTruncated: false,
    segmentsTruncated: false,
  };
  function requireSelection(current: SpaceScope, selected: string) {
    expect(current).toBe(scope);
    expect(conversationIdSchema.parse(selected)).toBe(conversationId);
  }
  const snapshot = vi.fn<ConversationsRepository["snapshot"]>(async (current, selected) => {
    requireSelection(current, selected);
    return expectedSnapshot;
  });
  const history = vi.fn<NonNullable<ConversationsRepository["history"]>>(
    async (current, selected, limit, before) => {
      requireSelection(current, selected);
      z.number().int().min(1).max(100).parse(limit);
      if (before) {
        conversationHistoryCursorSchema.parse(before);
        if (before.spaceId !== spaceId || before.conversationId !== conversationId)
          throw new InvalidConversationCursor();
      }
      return expectedHistory;
    },
  );
  const conversations: ConversationsRepository = {
    snapshot,
    history,
    stop: async () => {
      throw new Error("Unused stop");
    },
    send: async () => {
      throw new Error("Unused send");
    },
    events: async () => {
      throw new Error("Unused events");
    },
    retainAfter: async () => {
      throw new Error("Unused retention");
    },
  };
  let admitted = true;
  const resolve = vi.fn(async (owner: string, selected: typeof spaceId) => {
    expect(owner).toBe(accountId);
    expect(selected).toBe(spaceId);
    if (!admitted) throw new SpaceNotFound();
    return scope;
  });
  const auth: AuthSession = {
    user: {
      id: accountId,
      name: "Current reader",
      email: "reader@example.test",
      emailVerified: true,
    },
    session: {
      id: crypto.randomUUID(),
      userId: accountId,
      expiresAt: new Date(Date.now() + 60_000),
    },
  };
  const app = createApiApp({
    conversations,
    spaces: {
      resolve,
      list: async () => [],
      create: async () => {
        throw new Error("Unused create");
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
  return {
    client,
    spaceId,
    conversationId,
    accountId,
    scope,
    snapshot,
    history,
    resolve,
    expectedSnapshot,
    expectedHistory,
    removeMember() {
      admitted = false;
    },
  };
}

it.each(["direct", "group"] as const)(
  "retains additive attribution and answerers on the existing %s snapshot RPC",
  async (kind) => {
    const f = fixture(kind);
    const result = await f.client.conversations.snapshot({
      spaceId: f.spaceId,
      conversationId: f.conversationId,
    });
    expect(result).toEqual(f.expectedSnapshot);
    expect(result.messages).toHaveLength(3);
    expect(result).not.toHaveProperty("olderCursor");
    expect(JSON.stringify(result)).not.toContain("reader@example.test");
    expect(f.snapshot).toHaveBeenCalledExactlyOnceWith(f.scope, f.conversationId);
    expect(f.resolve).toHaveBeenCalledExactlyOnceWith(f.accountId, f.spaceId);
  },
);

it.each(["direct", "group"] as const)(
  "passes bounded history and its independent cursor through the %s RPC",
  async (kind) => {
    const f = fixture(kind);
    const selected = { spaceId: f.spaceId, conversationId: f.conversationId };
    expect(await f.client.conversations.history(selected)).toEqual(f.expectedHistory);
    expect(f.history).toHaveBeenNthCalledWith(1, f.scope, f.conversationId, 50, undefined);
    const before = { ...selected, beforeSequence: 8 };
    const result = await f.client.conversations.history({ ...selected, before, limit: 25 });
    expect(result).toEqual(f.expectedHistory);
    expect(f.history).toHaveBeenNthCalledWith(2, f.scope, f.conversationId, 25, before);
    expect(result.cursor).toBe(12);
    expect(result.runs[1]?.parentRunId).toBe(result.runs[0]?.id);
    expect(JSON.stringify(result)).not.toContain("reader@example.test");
    expect(f.resolve.mock.calls).toEqual([
      [f.accountId, f.spaceId],
      [f.accountId, f.spaceId],
    ]);
  },
);

it("validates history bounds and Space-bound cursors and resolves fresh membership", async () => {
  const f = fixture();
  const selected = { spaceId: f.spaceId, conversationId: f.conversationId };
  for (const limit of [0, 101])
    await expect(f.client.conversations.history({ ...selected, limit })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  await expect(
    f.client.conversations.history({ ...selected, before: { ...selected, beforeSequence: 0 } }),
  ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  expect(f.history).not.toHaveBeenCalled();
  await expect(
    f.client.conversations.history({
      ...selected,
      before: {
        spaceId: spaceIdSchema.parse("other-space"),
        conversationId: f.conversationId,
        beforeSequence: 8,
      },
    }),
  ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  f.removeMember();
  await expect(f.client.conversations.history(selected)).rejects.toMatchObject({
    code: "NOT_FOUND",
  });
  await expect(f.client.conversations.snapshot(selected)).rejects.toMatchObject({
    code: "NOT_FOUND",
  });
  expect(f.history).toHaveBeenCalledTimes(1);
  expect(f.snapshot).not.toHaveBeenCalled();
});
