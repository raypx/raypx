import { expect, it } from "vitest";
import {
  conversationEventSchema,
  eventCursorStatus,
  memberMessageInputSchema,
  runSchema,
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
    { trigger: "routine" },
    { apiKey: "secret" },
    { state: "failed", failureCode: "raw provider failure" },
    { state: "failed" },
    { failureCode: "MODEL_FAILED" },
  ])
    expect(runSchema.safeParse({ ...base, ...change }).success).toBe(false);
  expect(
    runSchema.safeParse({ ...base, state: "failed", failureCode: "MODEL_UNAVAILABLE" }).success,
  ).toBe(true);
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
  for (const extra of [
    { arguments: { path: "private" } },
    { output: "private" },
    { target: "x".repeat(1025) },
    { argumentSummary: "x".repeat(1025) },
    { durationMs: -1 },
  ])
    expect(conversationEventSchema.safeParse({ ...finished, ...extra }).success).toBe(false);
});
