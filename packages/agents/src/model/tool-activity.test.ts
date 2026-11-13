import { expect, it } from "vitest";
import { agentIdSchema, conversationIdSchema } from "@raypx/core/agents";
import { approvalRequestIdSchema } from "@raypx/core/approvals";
import { runIdSchema, type ConversationEvent, type ToolActivity } from "@raypx/core/conversation";
import { spaceIdSchema } from "@raypx/core/spaces";
import { applyToolActivityEvent, mergeToolActivity } from "./tool-activity.js";
import { ConversationState, conversationTimelineRows } from "./conversation.js";
import type { ApprovalCardView } from "./approvals.js";

const selection = {
  spaceId: spaceIdSchema.parse("space"),
  conversationId: conversationIdSchema.parse("conversation"),
};
const startedAt = "2026-11-14T00:00:00.000Z";
const runId = runIdSchema.parse("run");
const call: ToolActivity = {
  runId,
  toolCallId: "call",
  toolName: "computer_write_file",
  target: "note.txt",
  argumentSummary: "Write file: note.txt",
  startedAt,
  finishedAt: null,
  outcome: null,
  durationMs: null,
  exitStatus: null,
};
function start(sequence: number): Extract<ConversationEvent, { kind: "tool.started" }> {
  return {
    kind: "tool.started",
    ...selection,
    sequence,
    createdAt: startedAt,
    runId,
    toolCallId: call.toolCallId,
    toolName: call.toolName,
    target: call.target,
    argumentSummary: call.argumentSummary,
  };
}
const finished: ToolActivity = {
  ...call,
  finishedAt: "2026-11-14T00:00:02.000Z",
  outcome: "succeeded",
  durationMs: 2_000,
};
const card: ApprovalCardView = {
  requestId: approvalRequestIdSchema.parse("approval"),
  runId,
  toolCallId: "call",
  toolName: "computer_write_file",
  target: "note.txt",
  argumentSummary: "Write file: note.txt",
  memberAccountId: "member",
  expiresAt: "2100-01-01T00:00:00.000Z",
  createdAt: startedAt,
  sequence: 2,
  state: "pending",
  answeredByAccountId: null,
  answering: false,
  error: null,
};

it("deduplicates resumed starts and preserves a terminal result against a late start", () => {
  let activity = applyToolActivityEvent([], start(1));
  activity = applyToolActivityEvent(activity, {
    ...start(2),
    createdAt: "2026-11-14T00:00:01.000Z",
  });
  expect(activity).toHaveLength(1);
  expect(activity[0]?.startedAt).toBe(startedAt);
  activity = mergeToolActivity(activity, [finished]);
  expect(applyToolActivityEvent(activity, start(3))).toEqual([finished]);
  expect(
    mergeToolActivity(activity, [{ ...call, runId: runIdSchema.parse("different-run") }]),
  ).toHaveLength(2);
});

it("applies lifecycle and cursor together, then restores identical history from a snapshot", () => {
  const state = new ConversationState(selection);
  const conversation = {
    ...selection,
    id: selection.conversationId,
    agentId: agentIdSchema.parse("agent"),
    kind: "direct" as const,
    createdAt: startedAt,
  };
  expect(
    state.applySnapshot({
      conversation,
      messages: [],
      segments: [],
      runs: [],
      cursor: 0,
      toolActivity: [],
    }),
  ).toBe(true);
  expect(state.applyEvent({ event: start(1) })).toBe("applied");
  expect(
    state.applyEvent({
      event: {
        ...start(2),
        kind: "tool.finished",
        createdAt: finished.finishedAt!,
        outcome: "succeeded",
        durationMs: 2_000,
        exitStatus: null,
      },
    }),
  ).toBe("applied");
  expect(state.getSnapshot().cursor).toBe(2);
  expect(state.getSnapshot().toolActivity).toEqual([finished]);
  const restored = new ConversationState(selection);
  restored.applySnapshot({
    conversation,
    messages: [],
    segments: [],
    runs: [],
    cursor: 2,
    toolActivity: [finished],
  });
  expect(restored.getSnapshot().toolActivity).toEqual(state.getSnapshot().toolActivity);
  expect(restored.applyEvent({ event: start(1) })).toBe("duplicate");
  expect(restored.getSnapshot().toolActivity).toHaveLength(1);
});

it.each(["approved", "denied", "expired", "cancelled"] as const)(
  "replaces a %s card by its tool-call row without duplicates",
  (outcome) => {
    const view = {
      messages: [],
      segments: [],
      runs: [],
      liveReplies: [],
      cursor: 4,
      toolActivity: [call],
      toolActivityTruncated: false,
    };
    const pending = conversationTimelineRows(view, [card]);
    expect(pending.filter((row) => row.kind === "approval")).toHaveLength(1);
    expect(pending.flatMap((row) => (row.kind === "activity" ? row.activity : []))).toHaveLength(0);
    const resolved = conversationTimelineRows({ ...view, toolActivity: [finished] }, [
      { ...card, state: outcome },
    ]);
    expect(resolved.filter((row) => row.kind === "approval")).toHaveLength(0);
    expect(resolved.flatMap((row) => (row.kind === "activity" ? row.activity : []))).toEqual([
      finished,
    ]);
    expect(
      conversationTimelineRows({ ...view, toolActivity: [finished] }, []).flatMap((row) =>
        row.kind === "activity" ? row.activity : [],
      ),
    ).toEqual([finished]);
  },
);

it("matches pending cards by toolCallId, preserving other reads and showing terminal calls despite a stale card", () => {
  const read = { ...call, toolCallId: "read", toolName: "computer_read_file" };
  const view = {
    messages: [],
    segments: [],
    runs: [],
    liveReplies: [],
    cursor: 4,
    toolActivity: [call, read],
    toolActivityTruncated: false,
  };
  const rows = conversationTimelineRows(view, [card]);
  expect(rows.flatMap((row) => (row.kind === "activity" ? row.activity : []))).toEqual([read]);
  const terminal = conversationTimelineRows({ ...view, toolActivity: [finished, read] }, [card]);
  expect(terminal.filter((row) => row.kind === "approval")).toHaveLength(0);
});

it("bounds retained activity to one hundred calls in start order", () => {
  const calls = Array.from({ length: 102 }, (_, index) => ({
    ...call,
    toolCallId: `call-${index}`,
    startedAt: new Date(Date.parse(startedAt) + index * 1000).toISOString(),
  }));
  const activity = mergeToolActivity([], calls);
  expect(activity).toHaveLength(100);
  expect(activity[0]?.toolCallId).toBe("call-2");
  expect(activity.at(-1)?.toolCallId).toBe("call-101");
});
