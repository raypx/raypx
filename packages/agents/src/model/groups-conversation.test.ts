import { describe, expect, it } from "vitest";
import type { ConversationServerFrame } from "@raypx/contracts/api";
import { agentIdSchema, conversationIdSchema, type Conversation } from "@raypx/core/agents";
import { approvalRequestIdSchema } from "@raypx/core/approvals";
import {
  messageIdSchema,
  runIdSchema,
  type ConversationEvent,
  type Message,
  type Run,
  type ToolActivity,
} from "@raypx/core/conversation";
import { spaceIdSchema } from "@raypx/core/spaces";
import { ApprovalProjection } from "./approvals.js";
import {
  activeConversationRun,
  ConversationState,
  conversationRows,
  conversationSteeringTargets,
  conversationTimelineRows,
  delegatedWork,
} from "./conversation.js";
import type { ConversationSnapshot } from "./port.js";

const time = "2026-11-14T00:00:00.000Z";
const selection = {
  spaceId: spaceIdSchema.parse("space"),
  conversationId: conversationIdSchema.parse("group"),
};
const alpha = agentIdSchema.parse("alpha");
const beta = agentIdSchema.parse("beta");
const conversation: Conversation = {
  id: selection.conversationId,
  spaceId: selection.spaceId,
  agentId: alpha,
  agentIds: [alpha, beta],
  kind: "group",
  name: "Research 研究小组",
  defaultResponderAgentId: null,
  createdAt: time,
};
function message(overrides: Partial<Message> = {}): Message {
  return {
    ...selection,
    id: messageIdSchema.parse("message"),
    sequence: 1,
    author: { kind: "member", accountId: "member" },
    mentions: [alpha, beta],
    text: "Help research this",
    createdAt: time,
    ...overrides,
  };
}
function run(id: string, overrides: Partial<Run> = {}): Run {
  return {
    ...selection,
    id: runIdSchema.parse(id),
    agentId: alpha,
    parentRunId: null,
    trigger: "message",
    messageId: message().id,
    memberAccountId: "member",
    model: { modelId: "fixture" },
    state: "running",
    failureCode: null,
    createdAt: time,
    startedAt: time,
    firstResponseAt: null,
    finishedAt: null,
    ...overrides,
  };
}
function snapshot(overrides: Partial<ConversationSnapshot> = {}): ConversationSnapshot {
  return { conversation, messages: [], runs: [], segments: [], cursor: 0, ...overrides };
}
function runEvent(value: Run, sequence: number): ConversationEvent {
  return {
    ...selection,
    kind: "run.state",
    sequence,
    runId: value.id,
    agentId: value.agentId,
    parentRunId: value.parentRunId ?? null,
    state: value.state,
    failureCode: value.failureCode,
    createdAt: time,
  };
}
function prefix(
  value: Run,
  text: string,
): Extract<ConversationServerFrame, { type: "reply.prefix" }> {
  return {
    ...selection,
    type: "reply.prefix",
    runId: value.id,
    agentId: value.agentId,
    parentRunId: value.parentRunId ?? null,
    segmentId: `segment:${value.id}`,
    offset: 0,
    text,
  };
}
function apply(state: ConversationState, event: ConversationEvent, value?: Message) {
  expect(state.applyEvent({ event, ...(value ? { message: value } : {}) })).toBe("applied");
}
function call(value: Run, overrides: Partial<ToolActivity> = {}): ToolActivity {
  return {
    runId: value.id,
    agentId: value.agentId,
    parentRunId: value.parentRunId ?? null,
    toolCallId: "write-one",
    toolName: "computer_write_file",
    target: "report.txt",
    argumentSummary: "Write file: report.txt",
    startedAt: time,
    finishedAt: null,
    outcome: null,
    durationMs: null,
    exitStatus: null,
    ...overrides,
  };
}
function toolEvent(value: ToolActivity, sequence: number, finished = false): ConversationEvent {
  const fields = {
    ...selection,
    runId: value.runId,
    agentId: value.agentId,
    parentRunId: value.parentRunId,
    sequence,
    createdAt: time,
    toolCallId: value.toolCallId,
    toolName: value.toolName,
    target: value.target,
    argumentSummary: value.argumentSummary,
  };
  if (finished)
    return {
      ...fields,
      kind: "tool.finished",
      outcome: value.outcome ?? "succeeded",
      durationMs: 100,
      exitStatus: null,
    };
  return { ...fields, kind: "tool.started" };
}
function cardEvent(
  value: Run,
  sequence: number,
  resolved?: "approved" | "cancelled",
): ConversationEvent {
  const fields = {
    ...selection,
    sequence,
    runId: value.id,
    agentId: value.agentId,
    parentRunId: value.parentRunId ?? null,
    createdAt: time,
    requestId: approvalRequestIdSchema.parse("approval-child"),
    memberAccountId: "member",
    toolCallId: "write-one",
    toolName: "computer_write_file" as const,
    target: "report.txt",
    argumentSummary: "Write file: report.txt",
    expiresAt: "2100-01-01T00:00:00.000Z",
  };
  if (resolved)
    return {
      ...fields,
      kind: "card.resolved",
      outcome: resolved,
      answeredByAccountId: resolved === "approved" ? "member" : null,
    };
  return { ...fields, kind: "card.created" };
}

describe("group conversation projection", () => {
  it("keeps same-message reply order through state changes and snapshot reconstruction", () => {
    const state = new ConversationState(selection);
    const first = run("run-alpha", { state: "queued" });
    const second = run("run-beta", { agentId: beta, state: "queued" });
    expect(
      state.applySnapshot(snapshot({ messages: [message()], runs: [second, first], cursor: 3 })),
    ).toBe(true);
    const order = conversationRows(state.getSnapshot()).map((row) => row.id);
    expect(order).toEqual(["message", "reply:run-alpha", "reply:run-beta"]);
    apply(state, runEvent({ ...first, state: "running" }, 4));
    expect(conversationRows(state.getSnapshot()).map((row) => row.id)).toEqual(order);
    apply(state, runEvent({ ...second, state: "waiting" }, 5));
    expect(conversationRows(state.getSnapshot()).map((row) => row.id)).toEqual(order);
    apply(state, runEvent({ ...first, state: "cancelled" }, 6));
    expect(conversationRows(state.getSnapshot()).map((row) => row.id)).toEqual(order);
    const reloaded = new ConversationState(selection);
    expect(
      reloaded.applySnapshot(
        snapshot({
          messages: [message()],
          runs: [
            { ...first, state: "cancelled" },
            { ...second, state: "waiting" },
          ],
          cursor: 6,
        }),
      ),
    ).toBe(true);
    expect(conversationRows(reloaded.getSnapshot()).map((row) => row.id)).toEqual(order);
  });

  it("appends a later segment's live text after committed text while another Agent streams", () => {
    const state = new ConversationState(selection);
    const first = run("run-alpha");
    const second = run("run-beta", { agentId: beta });
    expect(
      state.applySnapshot(snapshot({ messages: [message()], runs: [first, second], cursor: 3 })),
    ).toBe(true);
    expect(state.applyReply(prefix(first, "First segment"))).toBe("applied");
    expect(state.applyReply(prefix(second, "Other Agent"))).toBe("applied");
    const firstSegment = {
      ...selection,
      id: "segment:run-alpha",
      runId: first.id,
      agentId: alpha,
      parentRunId: null,
      sequence: 4,
      text: "First segment",
      createdAt: time,
    };
    apply(state, {
      ...selection,
      kind: "reply.segment",
      sequence: 4,
      segment: firstSegment,
      createdAt: time,
    });
    const laterPrefix = { ...prefix(first, "Later"), segmentId: "segment:run-alpha:later" };
    expect(state.applyReply(laterPrefix)).toBe("applied");
    expect(
      state.applyReply({ ...laterPrefix, type: "reply.delta", offset: 5, text: " segment" }),
    ).toBe("applied");
    expect(
      state.applyReply({ ...prefix(second, " still streaming"), type: "reply.delta", offset: 11 }),
    ).toBe("applied");
    expect(conversationRows(state.getSnapshot()).slice(1)).toMatchObject([
      { id: "reply:run-alpha", text: "First segment\n\nLater segment", agentId: alpha },
      { id: "reply:run-beta", text: "Other Agent still streaming", agentId: beta },
    ]);
    // A replay of the committed segment cannot replace the newer live segment.
    expect(state.applyReply(prefix(first, "Outdated prefix"))).toBe("ignored");
    expect(state.getSnapshot().liveReplies).toHaveLength(2);
    const laterSegment = {
      ...firstSegment,
      id: laterPrefix.segmentId,
      sequence: 5,
      text: "Later segment",
    };
    apply(state, {
      ...selection,
      kind: "reply.segment",
      sequence: 5,
      segment: laterSegment,
      createdAt: time,
    });
    expect(conversationRows(state.getSnapshot()).slice(1)).toMatchObject([
      { id: "reply:run-alpha", text: "First segment\n\nLater segment", agentId: alpha },
      { id: "reply:run-beta", text: "Other Agent still streaming", agentId: beta },
    ]);
    expect(state.getSnapshot().liveReplies).toMatchObject([{ runId: second.id }]);
  });

  it("keeps interleaved Agent streams and committed replies independently attributed", () => {
    const state = new ConversationState(selection);
    const first = run("run-alpha");
    const second = run("run-beta", { agentId: beta });
    const initial = message();
    apply(
      state,
      {
        ...selection,
        kind: "message.created",
        sequence: 1,
        messageId: initial.id,
        createdAt: time,
      },
      initial,
    );
    apply(state, runEvent({ ...first, state: "queued" }, 2));
    apply(state, runEvent({ ...second, state: "queued" }, 3));
    expect(state.applyRunDetails([first, second])).toBe(true);
    apply(state, runEvent(first, 4));
    apply(state, runEvent(second, 5));
    expect(state.applyReply(prefix(first, "Alpha"))).toBe("applied");
    expect(state.applyReply(prefix(second, "乙"))).toBe("applied");
    expect(state.applyReply({ ...prefix(first, " reply"), type: "reply.delta", offset: 5 })).toBe(
      "applied",
    );
    const streamed = conversationRows(state.getSnapshot());
    expect(streamed.map((row) => row.id)).toEqual(["message", "reply:run-alpha", "reply:run-beta"]);
    expect(
      streamed
        .slice(1)
        .map((row) => ({ sender: row.sender, text: row.text, sequence: row.sequence })),
    ).toEqual([
      { sender: "agent:alpha", text: "Alpha reply", sequence: 1.5 },
      { sender: "agent:beta", text: "乙", sequence: 1.5 },
    ]);
    const committed = {
      ...selection,
      id: "segment:run-beta",
      runId: second.id,
      agentId: beta,
      parentRunId: null,
      sequence: 6,
      text: "乙的回复",
      createdAt: time,
    };
    apply(state, {
      ...selection,
      kind: "reply.segment",
      sequence: 6,
      segment: committed,
      createdAt: time,
    });
    apply(state, runEvent({ ...second, state: "succeeded" }, 7));
    expect(conversationRows(state.getSnapshot()).map((row) => row.id)).toEqual(
      streamed.map((row) => row.id),
    );
    expect(state.getSnapshot().liveReplies).toMatchObject([
      { runId: first.id, text: "Alpha reply" },
    ]);
    expect(activeConversationRun(state.getSnapshot().runs, alpha)?.id).toBe(first.id);
    expect(activeConversationRun(state.getSnapshot().runs, beta)).toBeUndefined();
  });

  it("routes steering only to explicitly mentioned Agents and excludes children", () => {
    const state = new ConversationState(selection);
    const first = run("run-alpha", { state: "waiting" });
    const second = run("run-beta", { agentId: beta });
    const child = run("child", { parentRunId: first.id, agentId: beta });
    expect(state.applySnapshot(snapshot({ runs: [child, first, second] }))).toBe(true);
    expect(activeConversationRun(state.getSnapshot().runs, beta)?.id).toBe(second.id);
    expect(
      conversationSteeringTargets(state.getSnapshot().runs, [beta, beta]).map((item) => item.id),
    ).toEqual([second.id]);
    expect(
      conversationSteeringTargets(state.getSnapshot().runs, [alpha, beta]).map((item) => item.id),
    ).toEqual([first.id, second.id]);
    expect(conversationSteeringTargets(state.getSnapshot().runs, [])).toEqual([]);
    expect(conversationSteeringTargets(state.getSnapshot().runs, ["unknown"])).toEqual([]);
  });

  it("keeps Agent-authored messages and their structured recipients in the flow", () => {
    const state = new ConversationState(selection);
    const sent = message({
      author: { kind: "agent", accountId: "member", agentId: alpha },
      mentions: [beta],
      text: "Please review this",
    });
    const triggered = run("from-agent", { agentId: beta, trigger: "agent" });
    expect(state.applySnapshot(snapshot({ messages: [sent], runs: [triggered], cursor: 2 }))).toBe(
      true,
    );
    expect(conversationRows(state.getSnapshot())[0]).toMatchObject({
      kind: "member",
      sender: "agent:alpha",
      agentId: alpha,
      targetAgentIds: [beta],
      text: sent.text,
    });
    expect(conversationRows(state.getSnapshot())[1]).toMatchObject({
      kind: "reply",
      agentId: beta,
      run: { trigger: "agent" },
    });
    expect(state.getSnapshot().messages[0]?.mentions).toEqual([beta]);
  });

  it("keeps an unaddressed group message without inventing a responder", () => {
    const state = new ConversationState(selection);
    const sent = message({ mentions: [] });
    expect(state.applySnapshot(snapshot({ messages: [sent], cursor: 1 }))).toBe(true);
    expect(conversationRows(state.getSnapshot())).toHaveLength(1);
    expect(state.getSnapshot().runs).toEqual([]);
  });
});

describe("delegated work projection", () => {
  it("retains a finished parent's reply row when only its delegated work has output", () => {
    const state = new ConversationState(selection);
    const parent = run("parent", { state: "succeeded" });
    const child = run("child", { parentRunId: parent.id, agentId: beta, state: "succeeded" });
    expect(
      state.applySnapshot(snapshot({ messages: [message()], runs: [parent, child], cursor: 2 })),
    ).toBe(true);
    const rows = conversationRows(state.getSnapshot());
    expect(rows.map((row) => row.id)).toEqual(["message", "reply:parent"]);
    expect(rows[1]).toMatchObject({
      kind: "reply",
      text: "",
      run: { id: parent.id, state: "succeeded" },
    });
    expect(delegatedWork(state.getSnapshot(), parent.id)).toMatchObject([
      { run: { id: child.id, state: "succeeded" } },
    ]);
    expect(
      conversationRows({ ...state.getSnapshot(), runs: [state.getSnapshot().runs[0]!] }),
    ).toHaveLength(1);
  });

  it("nests child and descendant activity under the parent from live events", () => {
    const state = new ConversationState(selection);
    const parent = run("parent");
    const child = run("child", { parentRunId: parent.id, agentId: beta });
    const grandchild = run("grandchild", { parentRunId: child.id });
    apply(state, runEvent(parent, 1));
    apply(state, runEvent(child, 2));
    apply(state, runEvent(grandchild, 3));
    expect(state.applyReply(prefix(child, "Child private output"))).toBe("applied");
    apply(state, toolEvent(call(child), 4));
    const work = delegatedWork(state.getSnapshot(), parent.id);
    expect(work.map((item) => item.run.id)).toEqual([child.id, grandchild.id]);
    expect(work[0]).toMatchObject({
      run: { agentId: beta, parentRunId: parent.id },
      task: "",
      activity: [{ runId: child.id, parentRunId: parent.id }],
    });
    expect(conversationRows(state.getSnapshot()).map((row) => row.id)).toEqual(["reply:parent"]);
    expect(
      conversationTimelineRows(state.getSnapshot(), []).some(
        (row) => row.kind === "activity" && row.runId === child.id,
      ),
    ).toBe(false);
  });

  it("reproduces the same hierarchy from a snapshot without inventing task summaries", () => {
    const state = new ConversationState(selection);
    const parent = run("parent");
    const child = run("child", { parentRunId: parent.id, agentId: beta, state: "succeeded" });
    const tool = call(child, { outcome: "succeeded", finishedAt: time, durationMs: 100 });
    expect(
      state.applySnapshot(
        snapshot({
          runs: [parent, child],
          messages: [message()],
          toolActivity: [tool],
          segments: [
            {
              ...selection,
              id: "child-text",
              runId: child.id,
              agentId: beta,
              parentRunId: parent.id,
              sequence: 3,
              text: "Child output",
              createdAt: time,
            },
          ],
          cursor: 3,
        }),
      ),
    ).toBe(true);
    expect(conversationRows(state.getSnapshot()).map((row) => row.id)).toEqual([
      "message",
      "reply:parent",
    ]);
    expect(delegatedWork(state.getSnapshot(), parent.id)).toMatchObject([
      { run: { id: child.id, state: "succeeded" }, task: "", activity: [tool] },
    ]);
    expect(
      conversationTimelineRows(state.getSnapshot(), []).some((row) => row.kind === "activity"),
    ).toBe(false);
  });

  it("shows a child approval once in the flow and folds its answer into child activity", () => {
    const state = new ConversationState(selection);
    const approvals = new ApprovalProjection(selection);
    const parent = run("parent");
    const child = run("child", { parentRunId: parent.id, agentId: beta, state: "waiting" });
    apply(state, runEvent(parent, 1));
    apply(state, runEvent(child, 2));
    apply(state, toolEvent(call(child), 3));
    const created = cardEvent(child, 4);
    apply(state, created);
    approvals.applyEvent(created);
    const pending = conversationTimelineRows(state.getSnapshot(), approvals.getSnapshot());
    expect(pending.filter((row) => row.kind === "approval")).toHaveLength(1);
    expect(pending.some((row) => row.kind === "activity" && row.runId === child.id)).toBe(false);
    expect(
      approvals.begin(
        approvalRequestIdSchema.parse("approval-child"),
        "other-member",
        Date.parse(time),
      ),
    ).toBe(false);
    const resolved = cardEvent(child, 5, "approved");
    apply(state, resolved);
    approvals.applyEvent(resolved);
    apply(state, toolEvent(call(child, { outcome: "succeeded" }), 6, true));
    expect(
      conversationTimelineRows(state.getSnapshot(), approvals.getSnapshot()).filter(
        (row) => row.kind === "approval",
      ),
    ).toEqual([]);
    expect(delegatedWork(state.getSnapshot(), parent.id)[0]?.activity).toMatchObject([
      { runId: child.id, outcome: "succeeded" },
    ]);
    expect(approvals.getSnapshot()[0]).toMatchObject({
      runId: child.id,
      state: "approved",
      answeredByAccountId: "member",
    });
  });

  it("applies the backend cancellation cascade to children, their streams and pending approval", () => {
    const state = new ConversationState(selection);
    const approvals = new ApprovalProjection(selection);
    const parent = run("parent");
    const child = run("child", { parentRunId: parent.id, agentId: beta });
    apply(state, runEvent(parent, 1));
    apply(state, runEvent(child, 2));
    const created = cardEvent(child, 3);
    apply(state, created);
    approvals.applyEvent(created);
    state.applyReply(prefix(parent, "Parent"));
    state.applyReply(prefix(child, "Child"));
    apply(state, runEvent({ ...parent, state: "cancelled" }, 4));
    apply(state, runEvent({ ...child, state: "cancelled" }, 5));
    const cancelled = cardEvent(child, 6, "cancelled");
    apply(state, cancelled);
    approvals.applyEvent(cancelled);
    expect(state.getSnapshot().liveReplies).toEqual([]);
    expect(delegatedWork(state.getSnapshot(), parent.id)[0]?.run.state).toBe("cancelled");
    expect(
      conversationTimelineRows(state.getSnapshot(), approvals.getSnapshot()).filter(
        (row) => row.kind === "approval",
      ),
    ).toEqual([]);
    expect(activeConversationRun(state.getSnapshot().runs)).toBeUndefined();
  });
});
