import { describe, expect, it, vi } from "vitest";
import type { ConversationClientFrame, ConversationServerFrame } from "@raypx/contracts/api";
import { agentSchema, conversationIdSchema, directConversation } from "@raypx/core/agents";
import { approvalRequestSchema, type ApprovalRequest } from "@raypx/core/approvals";
import {
  messageIdSchema,
  runIdSchema,
  type Message,
  type Run,
  type RunFailure,
} from "@raypx/core/conversation";
import {
  ComputerController,
  ConversationController,
  type ApprovalPort,
  type ConversationPort,
  type ConversationSnapshot,
  type ConversationSocketPort,
} from "@raypx/agents/model";
import {
  act,
  changeText,
  findByLabel,
  press,
  renderNative,
  textContent,
} from "../../tests/native.js";
import { AgentConversation } from "./conversation.js";

const time = "2026-11-14T00:00:00.000Z";
const accountId = "member";
const agent = agentSchema.parse({
  id: "agent",
  spaceId: "space",
  name: "Reader",
  instructions: "Read carefully",
  model: { modelId: "model" },
  createdAt: time,
  updatedAt: time,
});
const conversation = directConversation(agent, conversationIdSchema.parse("conversation"));
const item = { agent, conversation };
const selection = { spaceId: agent.spaceId, conversationId: conversation.id };

function message(text = "Member question", sequence = 1): Message {
  return {
    ...selection,
    id: messageIdSchema.parse(`message-${sequence}`),
    sequence,
    author: { kind: "member", accountId },
    text,
    createdAt: time,
  };
}

function run(state: Run["state"] = "running", failureCode: RunFailure | null = null): Run {
  return {
    ...selection,
    id: runIdSchema.parse("run"),
    agentId: agent.id,
    trigger: "message",
    messageId: message().id,
    memberAccountId: accountId,
    model: agent.model,
    state,
    failureCode,
    createdAt: time,
    startedAt: time,
    firstResponseAt: null,
    finishedAt: null,
  };
}

function pendingRequest(): ApprovalRequest {
  return approvalRequestSchema.parse({
    ...selection,
    id: "approval",
    runId: run().id,
    memberAccountId: accountId,
    toolCallId: "tool-call",
    toolName: "computer_write_file",
    arguments: { path: "notes.md", content: "note" },
    argumentSummary: "Save a note",
    target: "notes.md",
    state: "pending",
    createdAt: time,
    expiresAt: new Date(Date.now() + 600_000).toISOString(),
    resolvedAt: null,
    answeredByAccountId: null,
  });
}

async function harness(
  initial: Partial<ConversationSnapshot> = {},
  requests: ApprovalRequest[] = [],
) {
  const frames: ConversationClientFrame[] = [];
  const connections: Parameters<ConversationSocketPort["connect"]>[0][] = [];
  const stored = new Map<string, string>();
  const port: ConversationPort = {
    snapshot: vi.fn(async () => ({
      conversation,
      messages: [],
      segments: [],
      runs: [],
      cursor: 0,
      ...initial,
    })),
    send: vi.fn(async (input) => message(input.message.text, 3)),
    stop: vi.fn(async () => run("cancelled")),
  };
  const approvals: ApprovalPort = {
    pending: vi.fn(async () => requests),
    answer: vi.fn(async (input) => ({
      ...pendingRequest(),
      state: input.decision,
      answeredByAccountId: accountId,
      resolvedAt: time,
    })),
    effects: vi.fn(async () => []),
  };
  const computer = new ComputerController(agent.spaceId, {
    get: async () => ({ status: "not-configured" }),
    start: async () => ({ status: "not-configured" }),
    stop: async () => ({ status: "not-configured" }),
  });
  const controller = new ConversationController({
    selection,
    owner: { origin: "https://raypx.example", accountId },
    port,
    approvals,
    computer,
    socket: {
      connect(callbacks) {
        connections.push(callbacks);
        return {
          send: (frame) => {
            frames.push(frame);
          },
          close: vi.fn(),
        };
      },
    },
    drafts: {
      read: (key) => stored.get(key) ?? null,
      write: (key, value) => {
        stored.set(key, value);
      },
      remove: (key) => {
        stored.delete(key);
      },
    },
    key: () => "mobile-receipt",
  });
  await controller.start();
  await controller.refreshApprovals();
  await computer.refresh();
  connections[0]?.onFrame({ type: "ready", version: 1 });
  const onBack = vi.fn();
  const onEdit = vi.fn();
  const view = await renderNative(
    <AgentConversation
      item={item}
      controller={controller}
      computer={computer}
      accountId={accountId}
      onBack={onBack}
      onEdit={onEdit}
    />,
  );
  return {
    view,
    controller,
    port,
    approvals,
    frames,
    stored,
    onBack,
    onEdit,
    async frame(frame: ConversationServerFrame) {
      await act(async () => connections[0]?.onFrame(frame));
    },
    async close() {
      await view.unmount();
      controller.dispose();
      computer.dispose();
    },
  };
}

describe("mobile Agent conversation", () => {
  it("renders snapshot history, streams text and replaces it with one committed reply", async () => {
    const h = await harness({ messages: [message()], runs: [run()], cursor: 2 });
    expect(textContent(h.view.root)).toContain("Member question");
    expect(h.frames[0]).toEqual({ type: "subscribe", version: 1, ...selection, after: 2 });
    await h.frame({
      type: "reply.prefix",
      ...selection,
      runId: run().id,
      segmentId: "segment",
      offset: 0,
      text: "A stream",
    });
    expect(textContent(h.view.root)).toContain("A stream");
    await h.frame({
      type: "reply.delta",
      ...selection,
      runId: run().id,
      segmentId: "segment",
      offset: 8,
      text: "ed answer",
    });
    expect(textContent(h.view.root)).toContain("A streamed answer");
    const commit: ConversationServerFrame = {
      type: "event",
      entry: {
        event: {
          kind: "reply.segment",
          ...selection,
          sequence: 3,
          createdAt: time,
          segment: {
            ...selection,
            id: "segment",
            runId: run().id,
            sequence: 3,
            text: "Committed answer",
            createdAt: time,
          },
        },
      },
    };
    await h.frame(commit);
    await h.frame({
      type: "event",
      entry: {
        event: {
          kind: "run.state",
          ...selection,
          sequence: 4,
          runId: run().id,
          state: "succeeded",
          failureCode: null,
          createdAt: time,
        },
      },
    });
    await h.frame(commit);
    expect(textContent(h.view.root)).not.toContain("A streamed answer");
    expect(textContent(h.view.root).split("Committed answer")).toHaveLength(2);
    expect(h.controller.getSnapshot().cursor).toBe(4);
    expect(h.frames).toContainEqual({ type: "ack", version: 1, ...selection, sequence: 4 });
    await h.close();
  });

  it("keeps an uncertain send and explicitly retries with the same idempotency key", async () => {
    const h = await harness();
    vi.mocked(h.port.send).mockRejectedValueOnce(new Error("offline"));
    await changeText(findByLabel(h.view.root, "Message"), "A mobile message");
    await press(findByLabel(h.view.root, "Send"));
    expect(textContent(h.view.root)).toContain("Message delivery is unconfirmed.");
    expect(h.controller.getSnapshot().pending).toEqual({
      idempotencyKey: "mobile-receipt",
      text: "A mobile message",
    });
    expect(findByLabel(h.view.root, "Message").props.editable).toBe(false);
    await press(findByLabel(h.view.root, "Retry delivery"));
    const expected = {
      ...selection,
      message: { idempotencyKey: "mobile-receipt", text: "A mobile message" },
    };
    expect(h.port.send).toHaveBeenNthCalledWith(1, expected);
    expect(h.port.send).toHaveBeenNthCalledWith(2, expected);
    expect(h.controller.getSnapshot().draft).toBe("");
    expect(h.controller.getSnapshot().pending).toBeNull();
    expect(textContent(h.view.root).split("A mobile message")).toHaveLength(2);
    await h.close();
  });

  it("keeps the composer usable while waiting for approval and offers Stop", async () => {
    const h = await harness({ messages: [message()], runs: [run("waiting")], cursor: 2 }, [
      pendingRequest(),
    ]);
    expect(textContent(h.view.root)).toContain("Waiting for approval");
    expect(findByLabel(h.view.root, "Approve")).toBeDefined();
    expect(findByLabel(h.view.root, "Message").props.editable).toBe(true);
    await changeText(findByLabel(h.view.root, "Message"), "Continue with a question");
    await press(findByLabel(h.view.root, "Send"));
    expect(h.port.send).toHaveBeenCalledWith({
      ...selection,
      message: { idempotencyKey: "mobile-receipt", text: "Continue with a question" },
    });
    await press(findByLabel(h.view.root, "Stop reply"));
    expect(h.port.stop).toHaveBeenCalledExactlyOnceWith({ ...selection, runId: run().id });
    expect(h.controller.getSnapshot().cards[0]?.state).toBe("pending");
    await h.close();
  });

  it("preserves reachable Agent navigation and editing actions", async () => {
    const h = await harness();
    await press(findByLabel(h.view.root, "Back to Agents"));
    await press(findByLabel(h.view.root, "Edit Agent"));
    expect(h.onBack).toHaveBeenCalledOnce();
    expect(h.onEdit).toHaveBeenCalledOnce();
    await h.close();
  });

  const failures: [RunFailure, string][] = [
    ["MODEL_UNAVAILABLE", "The selected model is unavailable."],
    ["MODEL_NOT_CONFIGURED", "The selected model is not configured."],
    ["MODEL_AUTH_REQUIRED", "The model connection needs authorization."],
    ["MODEL_RATE_LIMITED", "The model's rate limit was reached."],
    ["MODEL_TIMEOUT", "The model took too long to reply."],
    ["MODEL_FAILED", "The model could not complete the reply."],
    ["REPLY_TOO_LARGE", "The reply exceeded the size limit."],
    ["EXECUTION_FAILED", "The reply could not complete."],
    ["TOOL_ROUND_LIMIT", "The reply used too many tool steps."],
    ["CONNECTION_UNAVAILABLE", "The connection used by this Run is unavailable."],
    ["COMPUTER_UNAVAILABLE", "The computer used by this Run is unavailable."],
  ];
  it.each(failures)("renders the distinct %s failure", async (code, copy) => {
    const h = await harness({ messages: [message()], runs: [run("failed", code)], cursor: 2 });
    expect(textContent(h.view.root)).toContain(copy);
    await press(findByLabel(h.view.root, "Prepare retry"));
    expect(h.controller.getSnapshot().draft).toBe("Member question");
    expect(h.port.send).not.toHaveBeenCalled();
    await h.close();
  });

  it("explains an unknown effect outcome and prevents a new-send retry", async () => {
    const h = await harness({
      messages: [message()],
      runs: [run("failed", "EFFECT_UNKNOWN")],
      cursor: 2,
    });
    expect(textContent(h.view.root)).toContain(
      "An action's outcome is unknown. Review it before continuing.",
    );
    expect(
      h.view.root.findAll(
        (node) =>
          typeof node.type === "string" && node.props.accessibilityLabel === "Prepare retry",
      ),
    ).toHaveLength(0);
    expect(h.port.send).not.toHaveBeenCalled();
    await h.close();
  });
});
