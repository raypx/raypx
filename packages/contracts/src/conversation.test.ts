import { expect, it } from "vitest";
import {
  apiContract,
  conversationClientFrameSchema,
  conversationServerFrameSchema,
  getRpcAccess,
} from "./api.js";

it("admits conversation operations only with a session and rejects forged scope or author", async () => {
  for (const procedure of Object.values(apiContract.conversations))
    expect(getRpcAccess(procedure)).toBe("session");
  const schema = apiContract.conversations.send["~orpc"].inputSchemas![0]!;
  const input = {
    spaceId: "space",
    conversationId: "conversation",
    message: { text: "Hello", idempotencyKey: "retry" },
  };
  expect((await schema["~standard"].validate(input)).issues).toBeUndefined();
  for (const forged of [
    { accountId: "other" },
    { scope: { spaceId: "other" } },
    { message: { ...input.message, author: "other" } },
  ])
    expect((await schema["~standard"].validate({ ...input, ...forged })).issues).toBeDefined();
});
it("requires the current stream version and bounded acknowledged cursors", () => {
  const frame = {
    version: 1,
    type: "subscribe",
    spaceId: "space",
    conversationId: "conversation",
    after: 0,
  };
  expect(conversationClientFrameSchema.safeParse(frame).success).toBe(true);
  for (const change of [
    { version: 2 },
    { version: undefined },
    { after: -1 },
    { after: Number.MAX_SAFE_INTEGER + 1 },
  ])
    expect(conversationClientFrameSchema.safeParse({ ...frame, ...change }).success).toBe(false);
});

it("separates transient prefix/appends from acknowledged durable events", () => {
  const base = {
    spaceId: "space",
    conversationId: "conversation",
    runId: "run",
    segmentId: "segment",
    text: "Hello",
  };
  expect(
    conversationServerFrameSchema.safeParse({ ...base, type: "reply.prefix", offset: 0 }).success,
  ).toBe(true);
  expect(
    conversationServerFrameSchema.safeParse({ ...base, type: "reply.prefix", offset: 5 }).success,
  ).toBe(false);
  expect(
    conversationServerFrameSchema.safeParse({ ...base, type: "reply.delta", offset: 5 }).success,
  ).toBe(true);
  expect(
    conversationServerFrameSchema.safeParse({ ...base, type: "reply.delta", offset: -1 }).success,
  ).toBe(false);
  expect(
    conversationServerFrameSchema.safeParse({
      ...base,
      type: "reply.delta",
      offset: 0,
      sequence: 1,
    }).success,
  ).toBe(false);
});

it("adds independently bounded active work without requiring it from existing snapshot consumers", async () => {
  const time = "2026-11-14T00:00:00.000Z";
  const base = {
    conversation: {
      id: "conversation",
      spaceId: "space",
      agentId: "agent",
      kind: "direct",
      createdAt: time,
    },
    messages: [],
    runs: [],
    segments: [],
    cursor: 2,
  };
  const active = {
    run: {
      id: "run",
      spaceId: "space",
      conversationId: "conversation",
      agentId: "agent",
      trigger: "message",
      messageId: "message",
      memberAccountId: "member",
      model: { modelId: "fixture" },
      state: "running",
      failureCode: null,
      createdAt: time,
      startedAt: time,
      firstResponseAt: null,
      finishedAt: null,
    },
    triggerMessage: { id: "message", sequence: 1 },
    pendingApprovals: [],
    pendingApprovalsTruncated: false,
    latestCommittedSegment: null,
  };
  for (const [name, extra] of [
    ["snapshot", {}],
    ["history", { olderCursor: null, runsTruncated: false, segmentsTruncated: false }],
  ] as const) {
    const schema = apiContract.conversations[name]["~orpc"].outputSchemas![0]!;
    expect((await schema["~standard"].validate({ ...base, ...extra })).issues).toBeUndefined();
    expect(
      (
        await schema["~standard"].validate({
          ...base,
          ...extra,
          activeRuns: [active],
          activeRunsTruncated: false,
        })
      ).issues,
    ).toBeUndefined();
    expect(
      (
        await schema["~standard"].validate({
          ...base,
          ...extra,
          activeRuns: Array.from({ length: 101 }, () => active),
        })
      ).issues,
    ).toBeDefined();
  }
});

it("binds screen subscriptions to a viewer and keeps their pixels outside conversation events", () => {
  const viewerId = "b887ca11-696d-4316-a182-94b7bd4da319";
  expect(
    conversationClientFrameSchema.safeParse({
      type: "screen.subscribe",
      version: 1,
      spaceId: "space",
      viewerId,
    }).success,
  ).toBe(true);
  expect(
    conversationClientFrameSchema.safeParse({
      type: "screen.ack",
      version: 1,
      spaceId: "space",
      viewerId,
      sequence: 1,
    }).success,
  ).toBe(true);
  expect(
    conversationClientFrameSchema.safeParse({
      type: "screen.subscribe",
      version: 1,
      spaceId: "space",
      viewerId,
      providerUrl: "http://private",
    }).success,
  ).toBe(false);
  expect(
    conversationServerFrameSchema.safeParse({
      type: "screen.event",
      spaceId: "space",
      viewerId,
      sequence: 1,
      event: { kind: "closed", reason: "SPACE_MEMBER_REMOVED" },
    }).success,
  ).toBe(true);
  expect(
    conversationServerFrameSchema.safeParse({
      type: "screen.event",
      spaceId: "space",
      viewerId,
      sequence: 1,
      event: { kind: "closed", reason: "unbounded-private-diagnostic" },
    }).success,
  ).toBe(false);
});
