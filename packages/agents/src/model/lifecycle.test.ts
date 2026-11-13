import { afterEach, describe, expect, it, vi } from "vitest";
import type { ConversationClientFrame, ConversationServerFrame } from "@raypx/contracts/api";
import { agentIdSchema, conversationIdSchema } from "@raypx/core/agents";
import { approvalRequestIdSchema, type ApprovalRequest } from "@raypx/core/approvals";
import { messageIdSchema, runIdSchema, type Message } from "@raypx/core/conversation";
import { spaceIdSchema } from "@raypx/core/spaces";
import { ConversationController } from "./controller.js";
import type {
  ApprovalPort,
  ConversationPort,
  ConversationSnapshot,
  ConversationSocketPort,
} from "./port.js";

const selection = {
  spaceId: spaceIdSchema.parse("space"),
  conversationId: conversationIdSchema.parse("conversation"),
};
const createdAt = "2026-11-14T00:00:00.000Z";
const controllers: ConversationController[] = [];

function snapshot(): ConversationSnapshot {
  return {
    conversation: {
      id: selection.conversationId,
      spaceId: selection.spaceId,
      agentId: agentIdSchema.parse("agent"),
      kind: "direct",
      createdAt,
    },
    cursor: 0,
    messages: [],
    runs: [],
    segments: [],
  };
}

function event(sequence: number): Extract<ConversationServerFrame, { type: "event" }> {
  const message: Message = {
    id: messageIdSchema.parse(`message-${sequence}`),
    ...selection,
    sequence,
    author: { kind: "member", accountId: "member" },
    text: `Message ${sequence}`,
    createdAt,
  };
  return {
    type: "event",
    entry: {
      message,
      event: {
        ...selection,
        sequence,
        kind: "message.created",
        messageId: message.id,
        createdAt,
      },
    },
  };
}

function request(target = "current.txt"): ApprovalRequest {
  return {
    id: approvalRequestIdSchema.parse("request"),
    ...selection,
    runId: runIdSchema.parse("run"),
    memberAccountId: "member",
    toolCallId: "call",
    toolName: "computer_write_file",
    arguments: { path: target, content: "fixture" },
    argumentSummary: "Write file",
    target,
    state: "pending",
    createdAt,
    expiresAt: "2100-01-01T00:00:00.000Z",
    resolvedAt: null,
    answeredByAccountId: null,
  };
}

function harness() {
  const frames: ConversationClientFrame[] = [];
  const connections: Array<Parameters<ConversationSocketPort["connect"]>[0]> = [];
  const close = vi.fn();
  const port: ConversationPort = {
    snapshot: vi.fn(async () => snapshot()),
    send: vi.fn(),
    stop: vi.fn(),
  };
  const approvals: ApprovalPort = {
    pending: vi.fn(async () => []),
    answer: vi.fn(),
    effects: vi.fn(),
  };
  const controller = new ConversationController({
    owner: { origin: "https://raypx.test", accountId: "member" },
    selection,
    port,
    approvals,
    drafts: { read: () => null, write() {}, remove() {} },
    key: vi.fn(() => "new-receipt"),
    socket: {
      connect(callbacks) {
        connections.push(callbacks);
        return {
          send: (frame) => {
            frames.push(frame);
          },
          close,
        };
      },
    },
  });
  controllers.push(controller);
  return { controller, port, approvals, frames, connections, close };
}

afterEach(() => {
  for (const controller of controllers.splice(0)) controller.dispose();
  vi.useRealTimers();
});

describe("conversation platform lifecycle", () => {
  it("closes in background and resumes the applied cursor without gaps or duplicate messages", async () => {
    vi.useFakeTimers();
    const h = harness();
    await h.controller.start();
    h.connections[0]!.onFrame({ type: "ready", version: 1 });
    h.connections[0]!.onFrame(event(1));
    expect(h.frames.at(-1)).toMatchObject({ type: "ack", sequence: 1 });
    h.connections[0]!.onFrame({
      type: "reply.prefix",
      ...selection,
      runId: runIdSchema.parse("run"),
      segmentId: "segment",
      offset: 0,
      text: "Transient text",
    });
    h.controller.setDraft("Keep this unsent draft");
    expect(h.controller.getSnapshot().liveReplies).toHaveLength(1);

    h.controller.suspend();
    h.controller.suspend();
    expect(h.close).toHaveBeenCalledOnce();
    expect(h.controller.getSnapshot()).toMatchObject({
      cursor: 1,
      draft: "Keep this unsent draft",
      liveReplies: [],
    });
    h.connections[0]!.onFrame(event(2));
    h.connections[0]!.onClose(1006);
    h.controller.reconnect();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(h.connections).toHaveLength(1);
    expect(h.controller.getSnapshot().cursor).toBe(1);

    h.controller.resume();
    h.controller.resume();
    expect(h.connections).toHaveLength(2);
    h.connections[1]!.onFrame({ type: "ready", version: 1 });
    expect(h.frames.at(-1)).toEqual({ type: "subscribe", version: 1, ...selection, after: 1 });
    h.connections[1]!.onFrame(event(1));
    h.connections[1]!.onFrame(event(2));
    expect(h.controller.getSnapshot().messages.map((message) => message.id)).toEqual([
      "message-1",
      "message-2",
    ]);
    expect(h.frames.at(-1)).toEqual({ type: "ack", version: 1, ...selection, sequence: 2 });
    expect(h.port.snapshot).toHaveBeenCalledOnce();
    expect(h.port.send).not.toHaveBeenCalled();
  });

  it("cancels a scheduled reconnect while suspended", async () => {
    vi.useFakeTimers();
    const h = harness();
    await h.controller.start();
    h.connections[0]!.onFrame({ type: "ready", version: 1 });
    h.connections[0]!.onClose(1006);
    h.controller.suspend();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(h.connections).toHaveLength(1);
    h.controller.resume();
    expect(h.connections).toHaveLength(2);
  });

  it("fences a snapshot finishing in background and reads a new one on foreground", async () => {
    const h = harness();
    let finish: (value: ConversationSnapshot) => void = () => {};
    vi.mocked(h.port.snapshot).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const starting = h.controller.start();
    h.controller.suspend();
    finish({ ...snapshot(), cursor: 1, messages: [event(1).entry.message!] });
    await starting;
    expect(h.controller.getSnapshot().cursor).toBe(0);
    expect(h.connections).toHaveLength(0);
    h.controller.resume();
    await Promise.resolve();
    expect(h.port.snapshot).toHaveBeenCalledTimes(2);
    expect(h.connections).toHaveLength(1);
  });

  it("fences an old pending-approval read and refreshes requests after reconnect", async () => {
    const h = harness();
    let finish: (value: ApprovalRequest[]) => void = () => {};
    vi.mocked(h.approvals.pending).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    await h.controller.start();
    h.controller.suspend();
    finish([request("stale.txt")]);
    await Promise.resolve();
    expect(h.controller.getSnapshot()).toMatchObject({ cards: [], approvalsLoading: false });
    vi.mocked(h.approvals.pending).mockResolvedValue([request()]);
    h.controller.resume();
    h.connections[1]!.onFrame({ type: "ready", version: 1 });
    await Promise.resolve();
    expect(vi.mocked(h.approvals.pending).mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(h.controller.getSnapshot().cards).toMatchObject([
      { target: "current.txt", state: "pending" },
    ]);
  });

  it("does no startup I/O when mounted in background and never resumes after disposal", async () => {
    const h = harness();
    h.controller.suspend();
    await h.controller.start();
    expect(h.port.snapshot).not.toHaveBeenCalled();
    expect(h.connections).toHaveLength(0);
    h.controller.resume();
    await Promise.resolve();
    expect(h.port.snapshot).toHaveBeenCalledOnce();
    expect(h.connections).toHaveLength(1);
    h.controller.suspend();
    h.controller.dispose();
    h.controller.resume();
    expect(h.connections).toHaveLength(1);
  });
});
