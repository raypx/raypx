import { expect, it } from "vitest";
import {
  activeRunSchema,
  conversationEventSchema,
  eventCursorStatus,
  memberMessageInputSchema,
  runSchema,
  toolActivitySchema,
} from "./conversation.js";

it("accepts only implemented immutable event variants and references message content", () => {
  const input = {
    spaceId: "space",
    conversationId: "conversation",
    sequence: 1,
    kind: "message.created",
    messageId: "message",
    createdAt: new Date().toISOString(),
  };
  const event = conversationEventSchema.parse(input);
  expect(Object.isFrozen(event)).toBe(true);
  expect(conversationEventSchema.safeParse({ ...input, kind: "run.state" }).success).toBe(false);
  expect(conversationEventSchema.safeParse({ ...input, text: "duplicate content" }).success).toBe(
    false,
  );
  for (const sequence of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])
    expect(conversationEventSchema.safeParse({ ...input, sequence }).success).toBe(false);
});
it("validates member input without accepting an author chosen by the client", () => {
  expect(memberMessageInputSchema.parse({ idempotencyKey: "retry", text: "  hello  " }).text).toBe(
    "  hello  ",
  );
  for (const text of ["", "  ", "x".repeat(32_001)])
    expect(memberMessageInputSchema.safeParse({ idempotencyKey: "retry", text }).success).toBe(
      false,
    );
  expect(
    memberMessageInputSchema.safeParse({
      idempotencyKey: "retry",
      text: "hello",
      accountId: "other",
    }).success,
  ).toBe(false);
});
it("distinguishes retained boundaries, caught-up cursors and invalid future cursors", () => {
  expect(eventCursorStatus(0, 0, 0)).toBe("ready");
  expect(eventCursorStatus(4, 5, 10)).toBe("snapshot-required");
  expect(eventCursorStatus(5, 5, 10)).toBe("ready");
  expect(eventCursorStatus(10, 10, 10)).toBe("ready");
  for (const cursor of [-1, 1.5, 11, NaN])
    expect(eventCursorStatus(cursor, 0, 10)).toBe("invalid-cursor");
});

it("models only current Run states and pins opaque model/member identity without credentials", () => {
  const base = {
    id: "run",
    spaceId: "space",
    conversationId: "conversation",
    agentId: "agent",
    trigger: "message",
    messageId: "message",
    memberAccountId: "member",
    model: { modelId: "opaque-model" },
    state: "queued",
    failureCode: null,
    createdAt: new Date().toISOString(),
    startedAt: null,
    firstResponseAt: null,
    finishedAt: null,
  };
  expect(runSchema.parse(base).model).toEqual({ modelId: "opaque-model" });
  expect(runSchema.parse({ ...base, state: "waiting" }).state).toBe("waiting");
  for (const change of [
    { state: "recovering" },
    { trigger: "unsupported" },
    { apiKey: "secret" },
    { state: "failed", failureCode: "raw provider failure" },
    { state: "failed" },
    { failureCode: "MODEL_FAILED" },
  ])
    expect(runSchema.safeParse({ ...base, ...change }).success).toBe(false);
  expect(
    runSchema.safeParse({ ...base, state: "failed", failureCode: "MODEL_UNAVAILABLE" }).success,
  ).toBe(true);
  for (const trigger of ["routine", "webhook", "email"])
    expect(runSchema.safeParse({ ...base, trigger }).success).toBe(true);
});
it("accepts completed reply and run state events while rejecting reasoning and placeholders", () => {
  const base = {
    spaceId: "space",
    conversationId: "conversation",
    sequence: 2,
    createdAt: new Date().toISOString(),
  };
  expect(
    conversationEventSchema.safeParse({
      ...base,
      kind: "run.state",
      runId: "run",
      state: "failed",
      failureCode: "MODEL_FAILED",
    }).success,
  ).toBe(true);
  const segment = { ...base, id: "segment", runId: "run", text: "Reply" };
  expect(conversationEventSchema.parse({ ...base, kind: "reply.segment", segment }).kind).toBe(
    "reply.segment",
  );
  for (const kind of ["reasoning", "placeholder"])
    expect(conversationEventSchema.safeParse({ ...base, kind, text: "Hidden" }).success).toBe(
      false,
    );
});

it("bounds lifecycle metadata and excludes raw arguments, contents and tool output", () => {
  const base = {
    spaceId: "space",
    conversationId: "conversation",
    runId: "run",
    toolCallId: "call",
    toolName: "computer_read_file",
    target: "notes.txt",
    argumentSummary: "Path: notes.txt",
    sequence: 1,
    createdAt: new Date().toISOString(),
  };
  expect(conversationEventSchema.parse({ ...base, kind: "tool.started" }).kind).toBe(
    "tool.started",
  );
  const finished = {
    ...base,
    kind: "tool.finished",
    outcome: "succeeded",
    durationMs: 1,
    exitStatus: null,
  };
  expect(conversationEventSchema.parse(finished).kind).toBe("tool.finished");
  expect(conversationEventSchema.parse(finished)).not.toHaveProperty("page");
  expect(conversationEventSchema.parse({ ...finished, page: null })).toHaveProperty("page", null);
  expect(
    conversationEventSchema.parse({ ...finished, page: { id: "page", version: 2 } }),
  ).toHaveProperty("page", { id: "page", version: 2 });
  const {
    kind: _kind,
    sequence: _sequence,
    createdAt,
    spaceId: _space,
    conversationId: _conversation,
    ...activity
  } = finished;
  for (const page of [undefined, null, { id: "page", version: 2 }])
    expect(
      toolActivitySchema.safeParse({
        ...activity,
        startedAt: createdAt,
        finishedAt: createdAt,
        ...(page === undefined ? {} : { page }),
      }).success,
    ).toBe(true);
  for (const page of [
    { id: "", version: 1 },
    { id: "x".repeat(129), version: 1 },
    { id: "page", version: 0 },
    { id: "page", version: 1.5 },
    { id: "page" },
    { id: "page", version: 1, body: "private" },
  ]) {
    expect(conversationEventSchema.safeParse({ ...finished, page }).success).toBe(false);
    expect(
      toolActivitySchema.safeParse({
        ...activity,
        startedAt: createdAt,
        finishedAt: createdAt,
        page,
      }).success,
    ).toBe(false);
  }
  expect(
    conversationEventSchema.safeParse({
      ...base,
      kind: "tool.started",
      page: { id: "page", version: 1 },
    }).success,
  ).toBe(false);
  for (const extra of [
    { arguments: { path: "private" } },
    { output: "private" },
    { target: "x".repeat(1025) },
    { argumentSummary: "x".repeat(1025) },
    { durationMs: -1 },
  ])
    expect(conversationEventSchema.safeParse({ ...finished, ...extra }).success).toBe(false);
});

it("bounds active Run summaries and rejects mismatched references, terminal Runs and exact arguments", () => {
  const time = "2026-11-14T00:00:00.000Z";
  const run = {
    id: "run",
    spaceId: "space",
    conversationId: "conversation",
    agentId: "agent",
    trigger: "webhook",
    messageId: "trigger",
    memberAccountId: "member",
    model: { modelId: "fixture" },
    state: "waiting",
    failureCode: null,
    createdAt: time,
    startedAt: time,
    firstResponseAt: null,
    finishedAt: null,
    untrustedInput: true,
  };
  const approval = {
    requestId: "request",
    runId: "run",
    toolCallId: "call",
    toolName: "computer_write_file",
    argumentSummary: "Write file",
    target: "workspace",
    memberAccountId: "member",
    expiresAt: time,
    createdAt: time,
  };
  const item = {
    run,
    triggerMessage: { id: "trigger", sequence: 1 },
    pendingApprovals: [approval],
    pendingApprovalsTruncated: false,
    latestCommittedSegment: { id: "segment", sequence: 2 },
  };
  expect(activeRunSchema.parse(item).run.untrustedInput).toBe(true);
  for (const state of ["queued", "running", "waiting"])
    expect(activeRunSchema.safeParse({ ...item, run: { ...run, state } }).success).toBe(true);
  for (const change of [
    { run: { ...run, state: "succeeded" } },
    { triggerMessage: { id: "other", sequence: 1 } },
    { pendingApprovals: [{ ...approval, runId: "other" }] },
    { pendingApprovals: [{ ...approval, arguments: { text: "private" } }] },
    { pendingApprovals: Array.from({ length: 17 }, () => approval) },
    { latestCommittedSegment: { id: "segment", sequence: 0 } },
  ])
    expect(activeRunSchema.safeParse({ ...item, ...change }).success).toBe(false);
});

it("validates exact Run steering without ambiguous Agent mention routing", () => {
  const message = { text: "Continue this Run", idempotencyKey: "steer", steerRunId: "run" };
  expect(memberMessageInputSchema.parse(message).steerRunId).toBe("run");
  for (const change of [
    { steerRunId: "" },
    { steerRunId: "x".repeat(129) },
    { mentions: ["other-agent"] },
  ])
    expect(memberMessageInputSchema.safeParse({ ...message, ...change }).success).toBe(false);
});
