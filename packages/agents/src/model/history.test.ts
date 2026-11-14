import { afterEach, describe, expect, it, vi } from "vitest";
import type { ConversationServerFrame } from "@raypx/contracts/api";
import { agentIdSchema, conversationIdSchema } from "@raypx/core/agents";
import { messageIdSchema, runIdSchema, type Message, type Run } from "@raypx/core/conversation";
import { spaceIdSchema } from "@raypx/core/spaces";
import {
  ConversationController,
  CONVERSATION_HISTORY_PAGE_SIZE,
  MAX_LOADED_CONVERSATION_MESSAGES,
} from "./controller.js";
import { activeConversationRun, ConversationState, conversationRows } from "./conversation.js";
import type {
  ApprovalPort,
  ConversationHistory,
  ConversationPort,
  ConversationSocketPort,
} from "./port.js";

const selection = {
  spaceId: spaceIdSchema.parse("space"),
  conversationId: conversationIdSchema.parse("conversation"),
};
const time = "2026-11-14T00:00:00.000Z";
const conversation = {
  ...selection,
  id: selection.conversationId,
  agentId: agentIdSchema.parse("agent"),
  kind: "direct" as const,
  createdAt: time,
};
function message(sequence: number): Message {
  return {
    ...selection,
    id: messageIdSchema.parse(`message-${sequence}`),
    sequence,
    author: { kind: "member", accountId: "viewer" },
    text: `Message ${sequence}`,
    createdAt: time,
  };
}
function run(sequence: number, state: Run["state"] = "succeeded"): Run {
  return {
    ...selection,
    id: runIdSchema.parse(`run-${sequence}`),
    agentId: conversation.agentId,
    messageId: message(sequence).id,
    trigger: "message",
    memberAccountId: "viewer",
    model: { modelId: "fixture" },
    state,
    failureCode: null,
    createdAt: time,
    startedAt: time,
    finishedAt: state === "succeeded" ? time : null,
    firstResponseAt: time,
  };
}
function page(messages: Message[], cursor: number, more = false): ConversationHistory {
  return {
    conversation,
    messages,
    runs: messages.map((item) => run(item.sequence)),
    segments: [],
    cursor,
    olderCursor:
      more && messages[0] ? { ...selection, beforeSequence: messages[0].sequence } : null,
    runsTruncated: false,
    segmentsTruncated: false,
  };
}
const controllers: ConversationController[] = [];
afterEach(() => {
  for (const controller of controllers.splice(0)) controller.dispose();
});
function harness(count = 210, approvals?: ApprovalPort) {
  const messages = Array.from({ length: count }, (_, index) => message(index + 1));
  const callbacks: Array<Parameters<ConversationSocketPort["connect"]>[0]> = [];
  const port: ConversationPort = {
    snapshot: vi.fn(async () => {
      throw new Error("Full snapshots must not be used");
    }),
    history: vi.fn(async (input) => {
      const eligible = messages.filter(
        (item) => !input.before || item.sequence < input.before.beforeSequence,
      );
      const selected = eligible.slice(-(input.limit ?? 50));
      return page(selected, messages.at(-1)?.sequence ?? 0, eligible.length > selected.length);
    }),
    send: vi.fn(async () => message(messages.length + 1)),
    stop: vi.fn(async () => run(messages.length, "cancelled")),
  };
  const controller = new ConversationController({
    selection,
    ...(approvals ? { approvals } : {}),
    owner: { origin: "https://example.com", accountId: "viewer" },
    port,
    drafts: { read: () => null, write: () => {}, remove: () => {} },
    key: () => "key",
    socket: {
      connect: (callback) => {
        callbacks.push(callback);
        return { send: () => {}, close: () => {} };
      },
    },
  });
  controllers.push(controller);
  return { controller, port, messages, callbacks };
}
function event(value: Message): ConversationServerFrame {
  return {
    type: "event",
    entry: {
      message: value,
      event: {
        ...selection,
        kind: "message.created",
        messageId: value.id,
        sequence: value.sequence,
        createdAt: time,
      },
    },
  };
}

describe("bounded conversation history", () => {
  it("jumps directly to the latest window after releasing newer pages", async () => {
    const h = harness();
    await h.controller.start();
    for (let i = 0; i < 5; i++) await h.controller.loadEarlier();
    h.controller.setReadingAnchor({ messageId: "message-31", offset: -8 });
    h.messages.push(message(211));
    await h.controller.loadLatest();
    expect(h.controller.getSnapshot().messages.map((item) => item.sequence)).toEqual(
      Array.from({ length: 30 }, (_, i) => i + 182),
    );
    expect(h.controller.getSnapshot().history).toMatchObject({ hasNewer: false, anchor: null });
    expect(h.controller.getSnapshot().cursor).toBe(211);
  });

  it("bounds confirmed send receipts even before their live event arrives", async () => {
    const h = harness(150);
    await h.controller.start();
    for (let i = 0; i < 4; i++) await h.controller.loadEarlier();
    h.controller.setDraft("A confirmed send without an event yet");
    expect(await h.controller.send()).toBe(true);
    expect(h.controller.getSnapshot().messages).toHaveLength(150);
    expect(h.controller.getSnapshot().messages[0]?.sequence).toBe(2);
    expect(h.controller.getSnapshot().messages.at(-1)?.sequence).toBe(151);
    expect(h.controller.getSnapshot().history.olderCursor?.beforeSequence).toBe(2);
  });

  it("opens the recent window and merges older pages with concurrent live messages without duplicates or gaps", async () => {
    const h = harness(100);
    await h.controller.start();
    expect(h.port.snapshot).not.toHaveBeenCalled();
    expect(h.port.history).toHaveBeenCalledWith({
      ...selection,
      limit: CONVERSATION_HISTORY_PAGE_SIZE,
    });
    expect(h.controller.getSnapshot().messages.map((item) => item.sequence)).toEqual(
      Array.from({ length: 30 }, (_, i) => i + 71),
    );
    h.callbacks[0]!.onFrame({ type: "ready", version: 1 });
    let resolve: (value: ConversationHistory) => void = () => {};
    vi.mocked(h.port.history!).mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const loading = h.controller.loadEarlier();
    const live = message(101);
    h.messages.push(live);
    h.callbacks[0]!.onFrame(event(live));
    resolve(
      page(
        Array.from({ length: 30 }, (_, i) => message(i + 41)),
        100,
        true,
      ),
    );
    expect(await loading).toBe(true);
    const sequences = h.controller.getSnapshot().messages.map((item) => item.sequence);
    expect(sequences).toEqual(Array.from({ length: 61 }, (_, i) => i + 41));
    expect(new Set(sequences).size).toBe(sequences.length);
    expect(h.controller.getSnapshot().cursor).toBe(101);
    expect(await h.controller.loadEarlier()).toBe(true);
    expect(await h.controller.loadEarlier()).toBe(true);
    expect(h.controller.getSnapshot().messages[0]?.sequence).toBe(1);
    expect(h.controller.getSnapshot().history.olderCursor).toBeNull();
  });

  it("preserves reading anchor data while releasing distant pages and reloads them in order", async () => {
    const h = harness();
    await h.controller.start();
    for (let i = 0; i < 4; i++) await h.controller.loadEarlier();
    expect(h.controller.getSnapshot().messages).toHaveLength(MAX_LOADED_CONVERSATION_MESSAGES);
    h.controller.setReadingAnchor({ messageId: "message-61", offset: -14 });
    await h.controller.loadEarlier();
    expect(h.controller.getSnapshot().history).toMatchObject({
      hasNewer: true,
      anchor: { messageId: "message-61", offset: -14 },
    });
    expect(h.controller.getSnapshot().messages[0]?.sequence).toBe(31);
    expect(h.controller.getSnapshot().messages.at(-1)?.sequence).toBe(180);
    expect(h.controller.getSnapshot().runs).toHaveLength(150);
    h.controller.setReadingAnchor({ messageId: "message-180", offset: 24 });
    await h.controller.loadLater();
    expect(h.controller.getSnapshot().messages.map((item) => item.sequence)).toEqual(
      Array.from({ length: 150 }, (_, i) => i + 61),
    );
    expect(h.controller.getSnapshot().history.hasNewer).toBe(false);
    await h.controller.loadEarlier();
    expect(h.controller.getSnapshot().messages[0]?.sequence).toBe(31);
  });

  it("keeps live Run command state without introducing orphan replies into an older window", async () => {
    const h = harness();
    await h.controller.start();
    h.callbacks[0]!.onFrame({ type: "ready", version: 1 });
    for (let i = 0; i < 5; i++) await h.controller.loadEarlier();
    h.callbacks[0]!.onFrame(event(message(211)));
    h.callbacks[0]!.onFrame({
      type: "event",
      entry: {
        event: {
          ...selection,
          kind: "run.state",
          runId: runIdSchema.parse("new-run"),
          sequence: 212,
          state: "queued",
          failureCode: null,
          trigger: "webhook",
          routineId: "routine",
          provenanceKind: "webhook",
          untrustedInput: true,
          createdAt: time,
        },
      },
    });
    const state = h.controller.getSnapshot();
    expect(state.cursor).toBe(212);
    expect(state.messages.at(-1)?.sequence).toBe(180);
    expect(activeConversationRun(state.runs)).toMatchObject({
      id: "new-run",
      outsideWindow: true,
      trigger: "webhook",
      provenanceKind: "webhook",
      untrustedInput: true,
    });
    expect(conversationRows(state).some((row) => row.id === "reply:new-run")).toBe(false);
  });

  it("recovers a snapshot at the same message and offset instead of returning to the recent window", async () => {
    const h = harness();
    await h.controller.start();
    h.callbacks[0]!.onFrame({ type: "ready", version: 1 });
    for (let i = 0; i < 5; i++) await h.controller.loadEarlier();
    h.controller.setReadingAnchor({ messageId: "message-50", offset: -9 });
    h.messages.push(message(211));
    h.callbacks[0]!.onFrame({ type: "snapshot-required", ...selection, cursor: 211 });
    await vi.waitFor(() => expect(h.callbacks).toHaveLength(2));
    const state = h.controller.getSnapshot();
    expect(state.messages.some((item) => item.id === "message-50")).toBe(true);
    expect(state.messages).toHaveLength(150);
    expect(state.history).toMatchObject({
      hasNewer: true,
      anchor: { messageId: "message-50", offset: -9 },
    });
    expect(state.cursor).toBe(211);
  });

  it("replays concurrent sends beyond a recovery cursor instead of rejecting the rebuilt window", async () => {
    const h = harness();
    await h.controller.start();
    h.callbacks[0]!.onFrame({ type: "ready", version: 1 });
    for (let i = 0; i < 4; i++) await h.controller.loadEarlier();
    h.controller.setReadingAnchor({ messageId: "message-100", offset: -5 });
    let resolve: (value: ConversationHistory) => void = () => {};
    vi.mocked(h.port.history!).mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    h.callbacks[0]!.onFrame({ type: "snapshot-required", ...selection, cursor: 210 });
    h.controller.setDraft("A send during recovery");
    expect(await h.controller.send()).toBe(true);
    h.messages.push(message(211));
    resolve(
      page(
        Array.from({ length: 30 }, (_, i) => message(i + 181)),
        210,
        true,
      ),
    );
    await vi.waitFor(() => expect(h.callbacks).toHaveLength(2));
    const recovered = h.controller.getSnapshot();
    expect(recovered.error).toBeNull();
    expect(recovered.cursor).toBe(210);
    expect(recovered.messages).toHaveLength(150);
    expect(recovered.messages.at(-1)?.id).toBe("message-211");
    expect(recovered.messages.some((item) => item.id === "message-100")).toBe(true);
    h.callbacks[1]!.onFrame({ type: "ready", version: 1 });
    h.callbacks[1]!.onFrame(event(message(211)));
    expect(h.controller.getSnapshot().cursor).toBe(211);
    expect(h.controller.getSnapshot().messages).toHaveLength(150);
  });

  it("hydrates historical names, answerers and truncation independently from the event cursor", () => {
    const state = new ConversationState(selection);
    const recent = page([message(10)], 10, true);
    recent.participants = [{ accountId: "departed", displayName: "Lin 林", isMember: false }];
    recent.resolvedApprovals = [
      {
        requestId: "answer",
        runId: run(10).id,
        toolCallId: "tool",
        outcome: "approved",
        answeredByAccountId: "departed",
        resolvedAt: time,
      },
    ];
    recent.participantsTruncated = true;
    state.applySnapshot(recent);
    const earlier = page([message(9)], 12, true);
    earlier.runsTruncated = true;
    earlier.segmentsTruncated = true;
    earlier.toolActivityTruncated = true;
    state.applyHistory(earlier);
    expect(state.getSnapshot()).toMatchObject({
      cursor: 10,
      participants: recent.participants,
      resolvedApprovals: recent.resolvedApprovals,
      participantsTruncated: true,
      runsTruncated: true,
      segmentsTruncated: true,
      toolActivityTruncated: true,
    });
  });

  it("keeps the latest Run last when loading older pages with equal timestamps", async () => {
    const h = harness(100);
    await h.controller.start();
    await h.controller.loadEarlier();
    expect(h.controller.getSnapshot().runs.at(-1)?.id).toBe("run-100");
    expect(h.controller.getSnapshot().runs[0]?.id).toBe("run-41");
  });

  it("reports local summary limits reached by merging individually complete pages", () => {
    const state = new ConversationState(selection);
    for (let index = 6; index > 0; index--) {
      const window = page([message(index)], 6);
      window.toolActivity = Array.from({ length: 100 }, (_, call) => ({
        runId: run(index).id,
        toolCallId: `call-${call}`,
        toolName: "computer_write_file",
        target: "report.txt",
        argumentSummary: "Write file",
        startedAt: time,
        finishedAt: time,
        outcome: "succeeded",
        durationMs: 1,
        exitStatus: null,
      }));
      window.participants = [{ accountId: `member-${index}`, displayName: "Lin", isMember: true }];
      const applied = index === 6 ? state.applySnapshot(window) : state.applyHistory(window);
      expect(applied).toBe(true);
    }
    expect(state.getSnapshot().toolActivity).toHaveLength(500);
    expect(state.getSnapshot().toolActivityTruncated).toBe(true);
    const directory = page([message(1)], 6);
    directory.participants = Array.from({ length: 100 }, (_, index) => ({
      accountId: `extra-${index}`,
      displayName: "Lin",
      isMember: true,
    }));
    expect(state.applyHistory(directory)).toBe(true);
    expect(state.getSnapshot().participants).toHaveLength(100);
    expect(state.getSnapshot().participantsTruncated).toBe(true);
  });

  it("releases dependent history with message bodies and restores it without duplicate rows", () => {
    const state = new ConversationState(selection);
    const loaded = page([message(1), message(2)], 10);
    loaded.toolActivity = [
      {
        runId: run(1).id,
        toolCallId: "write",
        toolName: "computer_write_file",
        target: "report.txt",
        argumentSummary: "Write file",
        startedAt: time,
        finishedAt: time,
        outcome: "succeeded",
        durationMs: 1,
        exitStatus: null,
      },
    ];
    loaded.resolvedApprovals = [
      {
        requestId: "approved",
        runId: run(1).id,
        toolCallId: "write",
        outcome: "approved",
        answeredByAccountId: "viewer",
        resolvedAt: time,
      },
    ];
    expect(state.applySnapshot(loaded)).toBe(true);
    state.retainMessages(new Set([message(2).id]));
    expect(state.getSnapshot().runs.map((item) => item.id)).toEqual([run(2).id]);
    expect(state.getSnapshot().toolActivity).toEqual([]);
    expect(state.getSnapshot().resolvedApprovals).toEqual([]);
    expect(state.applyHistory(loaded)).toBe(true);
    expect(state.applyHistory(loaded)).toBe(true);
    expect(state.getSnapshot().messages).toHaveLength(2);
    expect(state.getSnapshot().runs).toHaveLength(2);
    expect(state.getSnapshot().toolActivity).toEqual(loaded.toolActivity);
    expect(state.getSnapshot().resolvedApprovals).toEqual(loaded.resolvedApprovals);
  });

  it("retains the reader's oldest visible message when live arrivals exceed the memory limit", async () => {
    const h = harness();
    await h.controller.start();
    h.callbacks[0]!.onFrame({ type: "ready", version: 1 });
    for (let i = 0; i < 4; i++) await h.controller.loadEarlier();
    h.controller.setReadingAnchor({ messageId: "message-61", offset: -4 });
    h.callbacks[0]!.onFrame(event(message(211)));
    expect(h.controller.getSnapshot().messages[0]?.id).toBe("message-61");
    expect(h.controller.getSnapshot().messages).toHaveLength(150);
    expect(h.controller.getSnapshot().history.hasNewer).toBe(true);
  });

  it("fences a pending history page on suspension", async () => {
    const h = harness();
    await h.controller.start();
    let resolve: (value: ConversationHistory) => void = () => {};
    vi.mocked(h.port.history!).mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const loading = h.controller.loadEarlier();
    h.controller.suspend();
    resolve(
      page(
        Array.from({ length: 30 }, (_, i) => message(i + 151)),
        210,
        true,
      ),
    );
    expect(await loading).toBe(false);
    expect(h.controller.getSnapshot().messages[0]?.sequence).toBe(181);
    expect(h.controller.getSnapshot().history.loading).toBeNull();
  });

  it("stops walking released pages when the reader is suspended", async () => {
    const h = harness();
    await h.controller.start();
    for (let i = 0; i < 5; i++) await h.controller.loadEarlier();
    let resolve: (value: ConversationHistory) => void = () => {};
    vi.mocked(h.port.history!).mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const loading = h.controller.loadLater();
    const calls = vi.mocked(h.port.history!).mock.calls.length;
    h.controller.suspend();
    resolve(page([message(210)], 210, true));
    expect(await loading).toBe(false);
    expect(h.port.history).toHaveBeenCalledTimes(calls);
  });

  it("prevents a page load from racing snapshot recovery bounds", async () => {
    const h = harness();
    await h.controller.start();
    h.callbacks[0]!.onFrame({ type: "ready", version: 1 });
    let resolve: (value: ConversationHistory) => void = () => {};
    vi.mocked(h.port.history!).mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    h.callbacks[0]!.onFrame({ type: "snapshot-required", ...selection, cursor: 210 });
    expect(await h.controller.loadEarlier()).toBe(false);
    resolve(
      page(
        Array.from({ length: 30 }, (_, i) => message(i + 181)),
        210,
        true,
      ),
    );
    await vi.waitFor(() => expect(h.callbacks).toHaveLength(2));
  });

  it("clears a fenced page's loading state when snapshot recovery fails", async () => {
    const h = harness();
    await h.controller.start();
    h.callbacks[0]!.onFrame({ type: "ready", version: 1 });
    let resolve: (value: ConversationHistory) => void = () => {};
    vi.mocked(h.port.history!).mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const loading = h.controller.loadEarlier();
    vi.mocked(h.port.history!).mockRejectedValueOnce(new Error("Offline"));
    h.callbacks[0]!.onFrame({ type: "snapshot-required", ...selection, cursor: 210 });
    await vi.waitFor(() => expect(h.controller.getSnapshot().error).toBe("load"));
    resolve(page([message(180)], 210, true));
    expect(await loading).toBe(false);
    expect(h.controller.getSnapshot().history.loading).toBeNull();
    h.controller.reconnect();
    await vi.waitFor(() => expect(h.controller.getSnapshot().error).toBeNull());
    expect(await h.controller.loadEarlier()).toBe(true);
    expect(h.controller.getSnapshot().messages[0]?.sequence).toBe(151);
  });

  it("uses a delegated Run's root message and authoritative page metadata after steering", () => {
    const state = new ConversationState(selection);
    const initial = page([message(1), message(3)], 3);
    initial.runs = [run(1, "running")];
    state.applySnapshot(initial);
    state.applyEvent({
      event: {
        ...selection,
        kind: "run.state",
        runId: runIdSchema.parse("child"),
        parentRunId: run(1).id,
        state: "queued",
        failureCode: null,
        sequence: 4,
        createdAt: time,
        trigger: "agent",
        untrustedInput: true,
      },
    });
    expect(state.getSnapshot().runs.find((item) => item.id === "child")?.messageId).toBe(
      "message-1",
    );
    const authoritative = page([message(1)], 4);
    authoritative.runs = [{ ...run(1, "running"), messageId: message(3).id }];
    state.applyHistory(authoritative);
    expect(state.getSnapshot().runs.find((item) => item.id === run(1).id)?.messageId).toBe(
      "message-3",
    );
  });

  it.each(["space_override", "account_default"] as const)(
    "reads the member's effective approval mode from %s",
    async (source) => {
      const effectiveMode = {
        spaceId: selection.spaceId,
        mode: "ask" as const,
        source,
        availableModes: [
          { mode: "ask" as const, available: true as const, reasonCode: null },
          { mode: "never" as const, available: true as const, reasonCode: null },
          {
            mode: "auto" as const,
            available: false as const,
            reasonCode: "REVIEW_MODEL_NOT_CONFIGURED" as const,
          },
        ],
      };
      const approvals: ApprovalPort = {
        pending: async () => [],
        effects: async () => [],
        answer: async () => {
          throw new Error("unused");
        },
        effectiveMode: vi.fn(async () => effectiveMode),
      };
      const h = harness(1, approvals);
      await h.controller.start();
      await vi.waitFor(() =>
        expect(h.controller.getSnapshot().effectiveMode).toEqual(effectiveMode),
      );
      expect(approvals.effectiveMode).toHaveBeenCalledWith({ spaceId: selection.spaceId });
    },
  );

  it("hydrates resolved answerers into cards after reload using lifecycle summaries", async () => {
    const h = harness(1);
    vi.mocked(h.port.history!).mockImplementationOnce(async () => ({
      ...page([message(1)], 5),
      participants: [{ accountId: "departed", displayName: "Lin 林", isMember: false }],
      resolvedApprovals: [
        {
          requestId: "approved",
          runId: run(1).id,
          toolCallId: "write",
          outcome: "approved",
          answeredByAccountId: "departed",
          resolvedAt: time,
        },
      ],
      toolActivity: [
        {
          runId: run(1).id,
          toolCallId: "write",
          toolName: "computer_write_file",
          target: "report.txt",
          argumentSummary: "Write file",
          startedAt: time,
          finishedAt: time,
          outcome: "succeeded",
          durationMs: 1,
          exitStatus: null,
        },
      ],
    }));
    await h.controller.start();
    expect(h.controller.getSnapshot().cards[0]).toMatchObject({
      requestId: "approved",
      answeredByAccountId: "departed",
      state: "approved",
      toolName: "computer_write_file",
      target: "report.txt",
    });
    expect(h.controller.getSnapshot().participants).toEqual([
      { accountId: "departed", displayName: "Lin 林", isMember: false },
    ]);
  });

  it("confirms sending while newer pages are released without inserting a message across a gap", async () => {
    const h = harness();
    await h.controller.start();
    for (let i = 0; i < 5; i++) await h.controller.loadEarlier();
    h.controller.setDraft("Another instruction");
    expect(await h.controller.send()).toBe(true);
    expect(h.controller.getSnapshot()).toMatchObject({ draft: "", pending: null });
    expect(h.controller.getSnapshot().messages.at(-1)?.sequence).toBe(180);
  });

  it.each([
    [4003, "SPACE_MEMBER_REMOVED", "removed"],
    [4003, "SPACE_MEMBER_LEFT", "left"],
    [4003, "SPACE_DELETING", "deleting"],
    [4001, "SESSION_ENDED", "session-ended"],
  ] as const)("preserves subscription close %s %s", async (code, reason, expected) => {
    const h = harness(1);
    await h.controller.start();
    h.callbacks[0]!.onClose(code, reason);
    expect(h.controller.getSnapshot().subscriptionEnd).toBe(expected);
  });
});

it("reloads old active work, approves/stops/steers it and jumps directly to its trigger page", async () => {
  const request = {
    id: "old-request" as import("@raypx/core/approvals").ApprovalRequest["id"],
    ...selection,
    runId: run(1).id,
    memberAccountId: "viewer",
    toolCallId: "write",
    toolName: "computer_write_file" as const,
    arguments: { path: "report.txt", text: "private body" },
    argumentSummary: "Write file",
    target: "report.txt",
    state: "pending" as const,
    createdAt: time,
    expiresAt: "2099-11-14T00:00:00.000Z",
    resolvedAt: null,
    answeredByAccountId: null,
  };
  const approvals: ApprovalPort = {
    pending: vi.fn(async () => [request]),
    effects: async () => [],
    answer: vi.fn(async () => ({
      ...request,
      state: "approved" as const,
      answeredByAccountId: "viewer",
      resolvedAt: time,
    })),
  };
  const h = harness(100, approvals);
  const active = {
    run: { ...run(1, "waiting"), untrustedInput: true },
    triggerMessage: { id: message(1).id, sequence: 1 },
    pendingApprovals: [
      {
        requestId: request.id,
        runId: request.runId,
        toolCallId: request.toolCallId,
        toolName: request.toolName,
        argumentSummary: request.argumentSummary,
        target: request.target,
        memberAccountId: request.memberAccountId,
        createdAt: time,
        expiresAt: request.expiresAt,
      },
    ],
    pendingApprovalsTruncated: false,
    latestCommittedSegment: { id: "old-segment", sequence: 2 },
  };
  vi.mocked(h.port.history!).mockImplementation(async (input) => {
    const eligible = h.messages.filter(
      (item) => !input.before || item.sequence < input.before.beforeSequence,
    );
    const selected = eligible.slice(-(input.limit ?? 50));
    return { ...page(selected, 100, eligible.length > selected.length), activeRuns: [active] };
  });
  await h.controller.start();
  let projected = h.controller.getSnapshot();
  expect(projected.runs.find((item) => item.id === run(1).id)).toMatchObject({
    outsideWindow: true,
    triggerMessageSequence: 1,
    untrustedInput: true,
    latestCommittedSegment: { id: "old-segment", sequence: 2 },
  });
  expect(conversationRows(projected).some((row) => row.id === "reply:run-1")).toBe(false);
  expect(projected.cards[0]).toMatchObject({
    requestId: request.id,
    state: "pending",
    target: "report.txt",
  });
  expect(projected.cards[0]).not.toHaveProperty("arguments");
  expect(await h.controller.answerApproval(request.id, "approved")).toBe(true);
  expect(approvals.answer).toHaveBeenCalledWith({
    spaceId: selection.spaceId,
    requestId: request.id,
    decision: "approved",
  });
  expect(await h.controller.stop(run(1).id)).toBe(true);
  expect(h.port.stop).toHaveBeenCalledWith({ ...selection, runId: run(1).id });
  h.controller.setDraft("Continue with this instruction");
  expect(await h.controller.send()).toBe(true);
  expect(h.port.send).toHaveBeenCalledWith(
    expect.objectContaining({
      message: expect.objectContaining({ text: "Continue with this instruction" }),
    }),
  );
  expect(await h.controller.loadRun(run(1).id)).toBe(true);
  expect(h.port.history).toHaveBeenLastCalledWith({
    ...selection,
    limit: 30,
    before: { ...selection, beforeSequence: 2 },
  });
  projected = h.controller.getSnapshot();
  expect(projected.messages.some((item) => item.id === message(1).id)).toBe(true);
  expect(projected.runs.find((item) => item.id === run(1).id)?.outsideWindow).toBe(false);
  expect(projected.history.hasNewer).toBe(true);
  expect(projected.cursor).toBe(100);
});

it.each(["succeeded", "failed", "cancelled"] as const)(
  "keeps outside-window work current through queue, running, approval, committed output and %s",
  (state) => {
    const projection = new ConversationState(selection);
    const recent = page([message(10)], 10);
    recent.activeRuns = [
      {
        run: run(1, "queued"),
        triggerMessage: { id: message(1).id, sequence: 1 },
        pendingApprovals: [],
        pendingApprovalsTruncated: false,
        latestCommittedSegment: null,
      },
    ];
    expect(projection.applySnapshot(recent)).toBe(true);
    for (const [index, next] of ["running", "waiting", "running"].entries()) {
      expect(
        projection.applyEvent({
          event: {
            ...selection,
            kind: "run.state",
            runId: run(1).id,
            state: next as Run["state"],
            failureCode: null,
            sequence: index + 11,
            createdAt: time,
          },
        }),
      ).toBe("applied");
      expect(activeConversationRun(projection.getSnapshot().runs)?.state).toBe(next);
    }
    projection.applyEvent({
      event: {
        ...selection,
        kind: "reply.segment",
        sequence: 14,
        createdAt: time,
        segment: {
          ...selection,
          id: "commit",
          runId: run(1).id,
          sequence: 14,
          text: "Committed",
          createdAt: time,
        },
      },
    });
    expect(
      projection.getSnapshot().runs.find((item) => item.id === run(1).id)?.latestCommittedSegment,
    ).toEqual({ id: "commit", sequence: 14 });
    projection.applyEvent({
      event: {
        ...selection,
        kind: "run.state",
        runId: run(1).id,
        state,
        failureCode: state === "failed" ? "MODEL_FAILED" : null,
        sequence: 15,
        createdAt: time,
      },
    });
    expect(activeConversationRun(projection.getSnapshot().runs)).toBeUndefined();
    expect(projection.getSnapshot().runs.some((item) => item.id === run(1).id)).toBe(false);
    expect(projection.getSnapshot().cursor).toBe(15);
  },
);

it("uses stream trigger references when new work starts for a message older than the window", () => {
  const state = new ConversationState(selection);
  state.applySnapshot(page([message(50)], 50));
  state.applyEvent({
    event: {
      ...selection,
      kind: "run.state",
      runId: run(1).id,
      triggerMessage: { id: message(1).id, sequence: 1 },
      agentId: conversation.agentId,
      state: "queued",
      failureCode: null,
      trigger: "webhook",
      untrustedInput: true,
      sequence: 51,
      createdAt: time,
    },
  });
  expect(state.getSnapshot().runs.find((item) => item.id === run(1).id)).toMatchObject({
    messageId: message(1).id,
    triggerMessageSequence: 1,
    outsideWindow: true,
    untrustedInput: true,
  });
  expect(conversationRows(state.getSnapshot()).some((row) => row.id === "reply:run-1")).toBe(false);
});

it("freezes the selected outside-window Run in an uncertain send receipt and restores it without sending", async () => {
  const h = harness(100);
  const active = {
    run: run(1, "waiting"),
    triggerMessage: { id: message(1).id, sequence: 1 },
    pendingApprovals: [],
    pendingApprovalsTruncated: false,
    latestCommittedSegment: null,
  };
  vi.mocked(h.port.history!).mockResolvedValue({
    ...page([message(100)], 100, true),
    activeRuns: [active],
  });
  await h.controller.start();
  expect(h.controller.beginSteering(run(1).id)).toBe(true);
  h.controller.setDraft("This instruction is for old work");
  vi.mocked(h.port.send).mockRejectedValueOnce(new Error("Lost response"));
  expect(await h.controller.send()).toBe(false);
  expect(h.port.send).toHaveBeenCalledWith({
    ...selection,
    message: {
      idempotencyKey: "key",
      text: "This instruction is for old work",
      steerRunId: run(1).id,
    },
  });
  const frozen = h.controller.getSnapshot().pending;
  expect(frozen?.steerRunId).toBe(run(1).id);
  h.controller.clearSteering();
  expect(h.controller.getSnapshot().steeringRunId).toBe(run(1).id);
  const { readConversationDraft, writeConversationDraft } = await import("./drafts.js");
  expect(
    readConversationDraft(
      writeConversationDraft({ text: h.controller.getSnapshot().draft, pending: frozen }),
    ).pending?.steerRunId,
  ).toBe(run(1).id);
  expect(
    readConversationDraft(
      JSON.stringify({ version: 1, text: "text", pending: { ...frozen, steerRunId: "" } }),
    ).pending,
  ).toBeNull();
});

it("bounds streamed background Runs and their pending controls while preserving loaded Runs and the ACK cursor", async () => {
  const h = harness(1000);
  vi.mocked(h.port.history!).mockResolvedValue(page([message(1000)], 1000, true));
  await h.controller.start();
  h.callbacks[0]!.onFrame({ type: "ready", version: 1 });
  let sequence = 1000;
  for (let index = 1; index <= 120; index++) {
    const background = run(index, "queued");
    h.callbacks[0]!.onFrame({
      type: "event",
      entry: {
        event: {
          ...selection,
          kind: "run.state",
          sequence: ++sequence,
          createdAt: time,
          runId: background.id,
          state: "queued",
          failureCode: null,
          agentId: background.agentId,
          triggerMessage: { id: background.messageId, sequence: index },
          trigger: "message",
        },
      },
    });
    h.callbacks[0]!.onFrame({
      type: "event",
      entry: {
        event: {
          ...selection,
          kind: "card.created",
          sequence: ++sequence,
          createdAt: time,
          runId: background.id,
          requestId: `request-${index}` as import("@raypx/core/approvals").ApprovalRequest["id"],
          toolCallId: `call-${index}`,
          toolName: "computer_write_file",
          target: "workspace",
          argumentSummary: "Write",
          memberAccountId: "viewer",
          expiresAt: "2099-11-14T00:00:00.000Z",
        },
      },
    });
    h.callbacks[0]!.onFrame({
      type: "event",
      entry: {
        event: {
          ...selection,
          kind: "run.state",
          sequence: ++sequence,
          createdAt: time,
          runId: background.id,
          state: "waiting",
          failureCode: null,
          triggerMessage: { id: background.messageId, sequence: index },
        },
      },
    });
  }
  const view = h.controller.getSnapshot();
  expect(view.runs.filter((item) => item.outsideWindow)).toHaveLength(100);
  expect(view.runs.find((item) => item.id === run(1000).id)).toMatchObject({
    outsideWindow: false,
  });
  expect(view.runs.some((item) => item.id === run(101).id)).toBe(false);
  expect(view.activeRunsTruncated).toBe(true);
  expect(view.cards).toHaveLength(100);
  expect(view.cards.every((card) => view.runs.some((item) => item.id === card.runId))).toBe(true);
  expect(view.cursor).toBe(sequence);
  h.callbacks[0]!.onFrame({
    type: "reply.prefix",
    ...selection,
    runId: run(120).id,
    segmentId: "omitted-prefix",
    offset: 0,
    text: "Omitted reply",
  });
  expect(h.controller.getSnapshot().liveReplies).toEqual([]);
  h.callbacks[0]!.onFrame({
    type: "event",
    entry: {
      event: {
        ...selection,
        kind: "reply.segment",
        sequence: ++sequence,
        createdAt: time,
        segment: {
          ...selection,
          id: "omitted-segment",
          runId: run(120).id,
          sequence,
          text: "Omitted reply",
          createdAt: time,
        },
      },
    },
  });
  expect(h.controller.getSnapshot().segments).toEqual([]);
  expect(h.controller.getSnapshot().cursor).toBe(sequence);
  for (let index = 121; index <= 240; index++)
    h.callbacks[0]!.onFrame({
      type: "event",
      entry: {
        event: {
          ...selection,
          kind: "run.state",
          sequence: ++sequence,
          createdAt: time,
          runId: run(index).id,
          triggerMessage: { id: message(index).id, sequence: index },
          state: "succeeded",
          failureCode: null,
        },
      },
    });
  expect(h.controller.getSnapshot().runs).toHaveLength(101);
  expect(h.controller.getSnapshot().runs.filter((item) => item.outsideWindow)).toHaveLength(100);
  expect(h.controller.getSnapshot().runs.find((item) => item.id === run(1000).id)?.state).toBe(
    "succeeded",
  );
  expect(h.controller.getSnapshot().cursor).toBe(sequence);
  expect(h.controller.getSnapshot().segments).toEqual([]);
  const earlier = page([message(1)], sequence);
  earlier.runs = [run(1, "waiting")];
  expect(h.controller.state.applyHistory(earlier)).toBe(true);
  expect(
    h.controller.state.getSnapshot().runs.find((item) => item.id === run(1).id)?.outsideWindow,
  ).toBe(false);
  h.controller.state.hydrateActiveRuns(
    Array.from({ length: 150 }, (_, index) => run(index + 1, "queued")),
  );
  expect(h.controller.state.getSnapshot().runs.filter((item) => item.outsideWindow)).toHaveLength(
    100,
  );
  h.controller.state.retainMessages(new Set([message(1000).id]));
  expect(h.controller.state.getSnapshot().runs.filter((item) => item.outsideWindow)).toHaveLength(
    100,
  );
  expect(
    h.controller.state.getSnapshot().runs.find((item) => item.id === run(1000).id)?.outsideWindow,
  ).toBe(false);
  expect(h.controller.state.getSnapshot().activeRunsTruncated).toBe(true);
});
