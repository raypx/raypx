import { afterEach, describe, expect, it, vi } from "vitest";
import {
  approvalRequestIdSchema,
  mcpToolNameSchema,
  type ApprovalRequest,
} from "@raypx/core/approvals";
import { agentIdSchema, conversationIdSchema } from "@raypx/core/agents";
import { messageIdSchema, runIdSchema, type ConversationEvent } from "@raypx/core/conversation";
import { spaceIdSchema } from "@raypx/core/spaces";
import {
  ApprovalProjection,
  activityForRun,
  approvalRemainingSeconds,
  approvalDuration,
  approvalDeadlineProminent,
  approvalExtraSummary,
} from "./approvals.js";
import { ConversationController } from "./controller.js";
import type { ApprovalPort, ConversationSnapshot, ConversationSocketPort } from "./port.js";

const selection = {
  spaceId: spaceIdSchema.parse("space"),
  conversationId: conversationIdSchema.parse("conversation"),
};
const now = Date.parse("2026-11-14T00:00:00.000Z");
const createdAt = new Date(now).toISOString();
const requestId = approvalRequestIdSchema.parse("request");
const runId = runIdSchema.parse("run");
function request(patch: Partial<ApprovalRequest> = {}): ApprovalRequest {
  return {
    id: requestId,
    ...selection,
    runId,
    memberAccountId: "member",
    toolCallId: "tool-call",
    toolName: "computer_write_file",
    arguments: { path: "file.txt", content: "private file content" },
    argumentSummary: "Write 20 bytes",
    target: "file.txt",
    state: "pending",
    createdAt,
    expiresAt: new Date(now + 10_000).toISOString(),
    resolvedAt: null,
    answeredByAccountId: null,
    ...patch,
  };
}
function cardEvent(sequence = 1): Extract<ConversationEvent, { kind: "card.created" }> {
  const value = request();
  return {
    kind: "card.created",
    ...selection,
    requestId,
    runId,
    memberAccountId: value.memberAccountId,
    toolName: value.toolName,
    argumentSummary: value.argumentSummary,
    target: value.target,
    expiresAt: value.expiresAt,
    sequence,
    createdAt,
  };
}
function harness() {
  const connections: Array<Parameters<ConversationSocketPort["connect"]>[0]> = [];
  const approvals: ApprovalPort = {
    pending: vi.fn().mockResolvedValue([request()]),
    answer: vi
      .fn()
      .mockResolvedValue(
        request({ state: "approved", answeredByAccountId: "member", resolvedAt: createdAt }),
      ),
    effects: vi.fn().mockResolvedValue([]),
  };
  const initial: ConversationSnapshot = {
    conversation: {
      id: selection.conversationId,
      spaceId: selection.spaceId,
      agentId: agentIdSchema.parse("agent"),
      kind: "direct",
      createdAt,
    },
    messages: [],
    runs: [],
    segments: [],
    cursor: 0,
  };
  const controller = new ConversationController({
    selection,
    owner: { accountId: "member", origin: "https://raypx.test" },
    approvals,
    port: { snapshot: vi.fn().mockResolvedValue(initial), send: vi.fn(), stop: vi.fn() },
    drafts: { read: () => null, write() {}, remove() {} },
    key: () => "message-key",
    socket: {
      connect(callbacks) {
        connections.push(callbacks);
        return { send() {}, close() {} };
      },
    },
  });
  return { controller, approvals, connections };
}
afterEach(() => vi.useRealTimers());

it("projects exact remote names and keeps their additional summary", () => {
  const value = request({
    toolName: mcpToolNameSchema.parse("mcp_server__read_page"),
    argumentSummary: "Read a shared report",
  });
  const state = new ApprovalProjection(selection);
  state.receive(value, 1);
  expect(state.getSnapshot()[0]?.toolName).toBe(value.toolName);
  expect(approvalExtraSummary(value)).toBe("Read a shared report");
});

describe("approval projection", () => {
  it.each([
    [600, "minutes", 10],
    [599, "minutes", 10],
    [61, "minutes", 2],
    [60, "seconds", 60],
    [45, "seconds", 45],
    [1, "seconds", 1],
    [0, "seconds", 0],
  ] as const)("formats %i remaining seconds", (seconds, unit, value) => {
    expect(approvalDuration(seconds)).toEqual({ unit, value });
    expect(approvalDeadlineProminent(seconds)).toBe(seconds <= 60);
  });
  it.each([
    "Write file: file.txt",
    "Write a file",
    "file.txt",
    "写入文件：file.txt",
    "Path: file.txt",
  ])("omits redundant summary %s", (argumentSummary) => {
    expect(approvalExtraSummary({ ...request(), argumentSummary })).toBe("");
  });
  it("keeps additional arguments, including commands and file size", () => {
    expect(approvalExtraSummary(request())).toBe("Write 20 bytes");
    expect(
      approvalExtraSummary({
        ...request(),
        toolName: "computer_run_command",
        argumentSummary: "git status",
      }),
    ).toBe("git status");
  });
  it.each(["approved", "denied", "expired", "cancelled"] as const)(
    "converges card creation and %s resolution without keeping arguments",
    (outcome) => {
      const state = new ApprovalProjection(selection);
      state.applyEvent(cardEvent());
      state.applyEvent({
        ...cardEvent(2),
        kind: "card.resolved",
        outcome,
        answeredByAccountId: outcome === "approved" ? "member" : null,
      });
      expect(state.getSnapshot()).toHaveLength(1);
      expect(state.getSnapshot()[0]).toMatchObject({ state: outcome, sequence: 1 });
      expect(JSON.stringify(state.getSnapshot())).not.toContain("private file content");
      state.hydrate([request()], () => 3);
      expect(state.getSnapshot()[0]?.state).toBe(outcome);
    },
  );
  it("isolates conversations and groups each request once under its Run", () => {
    const state = new ApprovalProjection(selection);
    state.applyEvent({ ...cardEvent(), conversationId: conversationIdSchema.parse("other") });
    expect(state.getSnapshot()).toHaveLength(0);
    state.applyEvent(cardEvent());
    state.applyEvent(cardEvent());
    state.hydrate(
      [
        request({
          id: approvalRequestIdSchema.parse("second"),
          runId: runIdSchema.parse("another"),
        }),
      ],
      () => 2,
    );
    expect(activityForRun(state.getSnapshot(), runId)).toHaveLength(1);
    expect(activityForRun(state.getSnapshot(), runId)[0]?.target).toBe("file.txt");
  });
  it("calculates bounded expiry without starting timers or deciding the server state", () => {
    vi.useFakeTimers();
    const state = new ApprovalProjection(selection);
    state.applyEvent(cardEvent());
    const card = state.getSnapshot()[0]!;
    expect(approvalRemainingSeconds(card, now)).toBe(10);
    expect(approvalRemainingSeconds(card, now + 9_001)).toBe(1);
    expect(approvalRemainingSeconds(card, now + 10_001)).toBe(0);
    expect(card.state).toBe("pending");
    expect(vi.getTimerCount()).toBe(0);
  });
  it("does not offer a second answer after a transport uncertainty, including after refresh", () => {
    const state = new ApprovalProjection(selection);
    state.applyEvent(cardEvent());
    expect(state.begin(requestId, "another-member", now)).toBe(false);
    expect(state.begin(requestId, "member", now + 10_000)).toBe(false);
    expect(state.begin(requestId, "member", now)).toBe(true);
    state.reject(requestId, "NETWORK_ERROR");
    state.hydrate([request()], () => 1);
    expect(state.getSnapshot()[0]).toMatchObject({ answering: false, error: "unconfirmed" });
    expect(state.begin(requestId, "member", now)).toBe(false);
  });
});

describe("approval controller", () => {
  it("hydrates on load and reconnect, preserving the draft and cleaning the socket timer", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    const h = harness();
    await h.controller.start();
    await Promise.resolve();
    expect(h.approvals.pending).toHaveBeenCalledTimes(1);
    expect(h.controller.getSnapshot().cards).toHaveLength(1);
    expect(JSON.stringify(h.controller.getSnapshot().cards)).not.toContain("private file content");
    h.controller.setDraft("New message while waiting");
    h.connections[0]!.onFrame({ type: "ready", version: 1 });
    await Promise.resolve();
    h.controller.reconnect();
    h.connections[1]!.onFrame({ type: "ready", version: 1 });
    await Promise.resolve();
    expect(h.approvals.pending).toHaveBeenCalledTimes(3);
    expect(h.controller.getSnapshot().draft).toBe("New message while waiting");
    h.controller.dispose();
    expect(vi.getTimerCount()).toBe(0);
  });
  it("guards an in-flight answer and accepts the authoritative result only once", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    const h = harness();
    await h.controller.start();
    await Promise.resolve();
    let resolve: (value: ApprovalRequest) => void = () => {};
    vi.mocked(h.approvals.answer).mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const answering = h.controller.answerApproval(requestId, "approved", true);
    expect(h.controller.getSnapshot().cards[0]?.answering).toBe(true);
    expect(await h.controller.answerApproval(requestId, "denied")).toBe(false);
    resolve(request({ state: "approved", answeredByAccountId: "member", resolvedAt: createdAt }));
    expect(await answering).toBe(true);
    expect(h.controller.getSnapshot().cards[0]).toMatchObject({
      state: "approved",
      answering: false,
    });
    expect(await h.controller.answerApproval(requestId, "denied")).toBe(false);
    expect(h.approvals.answer).toHaveBeenCalledTimes(1);
    expect(h.approvals.answer).toHaveBeenCalledWith({
      spaceId: selection.spaceId,
      requestId,
      decision: "approved",
      allowTool: true,
    });
    h.controller.dispose();
  });
  it.each(["EXPIRED", "ALREADY_RESOLVED", "NETWORK_ERROR"])(
    "keeps %s rejection quiet and cannot answer twice",
    async (reason) => {
      vi.useFakeTimers();
      vi.setSystemTime(now);
      const h = harness();
      await h.controller.start();
      await Promise.resolve();
      vi.mocked(h.approvals.answer).mockRejectedValueOnce(new Error(reason));
      expect(await h.controller.answerApproval(requestId, "approved")).toBe(false);
      expect(h.controller.getSnapshot().error).toBeNull();
      expect(await h.controller.answerApproval(requestId, "approved")).toBe(false);
      expect(h.approvals.answer).toHaveBeenCalledTimes(1);
      h.controller.dispose();
    },
  );
  it("permits answering without remembering after RULE_LIMIT refuses the first operation", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    const h = harness();
    await h.controller.start();
    await Promise.resolve();
    vi.mocked(h.approvals.answer).mockRejectedValueOnce(new Error("RULE_LIMIT"));
    expect(await h.controller.answerApproval(requestId, "approved", true)).toBe(false);
    expect(h.controller.getSnapshot().cards[0]?.error).toBe("ruleLimit");
    expect(await h.controller.answerApproval(requestId, "approved")).toBe(true);
    expect(h.approvals.answer).toHaveBeenCalledTimes(2);
    h.controller.dispose();
  });
  it("ignores an old pending response after a resolution event and fences disposal", async () => {
    const h = harness();
    let resolve: (value: ApprovalRequest[]) => void = () => {};
    vi.mocked(h.approvals.pending).mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    await h.controller.start();
    h.connections[0]!.onFrame({ type: "event", entry: { event: cardEvent() } });
    h.connections[0]!.onFrame({
      type: "event",
      entry: {
        event: {
          ...cardEvent(2),
          kind: "card.resolved",
          outcome: "denied",
          answeredByAccountId: "member",
        },
      },
    });
    resolve([request()]);
    await Promise.resolve();
    expect(h.controller.getSnapshot().cards[0]?.state).toBe("denied");
    const refresh = h.controller.refreshApprovals();
    h.controller.dispose();
    const disposed = h.controller.getSnapshot();
    await refresh;
    expect(h.controller.getSnapshot()).toBe(disposed);
  });
  it("does not restore an effect-unknown failure as a retry", async () => {
    const h = harness();
    await h.controller.start();
    h.connections[0]!.onFrame({
      type: "event",
      entry: {
        event: {
          ...selection,
          kind: "message.created",
          messageId: messageIdSchema.parse("message"),
          sequence: 1,
          createdAt,
        },
        message: {
          ...selection,
          id: messageIdSchema.parse("message"),
          sequence: 1,
          createdAt,
          author: { kind: "member", accountId: "member" },
          text: "Change a file",
        },
      },
    });
    h.connections[0]!.onFrame({
      type: "event",
      entry: {
        event: {
          ...selection,
          kind: "run.state",
          runId,
          sequence: 2,
          createdAt,
          state: "failed",
          failureCode: "EFFECT_UNKNOWN",
        },
      },
    });
    expect(h.controller.getSnapshot().runs[0]?.messageId).toBe("message");
    expect(h.controller.prepareRetry(runId)).toBe(false);
    expect(h.controller.getSnapshot().draft).toBe("");
    h.controller.dispose();
  });
});
