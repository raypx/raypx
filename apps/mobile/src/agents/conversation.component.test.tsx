import * as Clipboard from "expo-clipboard";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ConversationClientFrame, ConversationServerFrame } from "@raypx/contracts/api";
import { agentSchema, conversationIdSchema, directConversation } from "@raypx/core/agents";
import { protectedInputRequestSchema } from "@raypx/core/protected-input";
import {
  approvalRequestSchema,
  type ApprovalRequest,
  type EffectiveApprovalMode,
} from "@raypx/core/approvals";
import {
  messageIdSchema,
  runIdSchema,
  type Message,
  type Run,
  type RunFailure,
  type ToolActivity,
} from "@raypx/core/conversation";
import {
  ComputerController,
  ConversationController,
  type DeviceComputersController,
  type ComputerPort,
  type ApprovalPort,
  type ProtectedInputsPort,
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
import { useLocales } from "../../tests/mocks/localization.js";
import en from "@raypx/agents/messages/en";
import { createTranslator } from "@raypx/i18n";
import zh from "@raypx/agents/messages/zh";
import { messages } from "../../locales/index.js";
import { deviceComputerFixture } from "../../tests/fixtures/device-computer.js";

afterEach(() => useLocales.mockReset());

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

function toolCall(): ToolActivity {
  const request = pendingRequest();
  return {
    runId: request.runId,
    toolCallId: request.toolCallId,
    toolName: request.toolName,
    target: request.target,
    argumentSummary: request.argumentSummary,
    startedAt: time,
    finishedAt: null,
    outcome: null,
    durationMs: null,
    exitStatus: null,
  };
}

function toolRows(root: import("react-test-renderer").ReactTestInstance) {
  return root.findAll(
    (node) => typeof node.type === "string" && node.props.testID === "tool:run:tool-call",
  );
}

async function harness(
  initial: Partial<ConversationSnapshot> = {},
  requests: ApprovalRequest[] = [],
  historyPort?: ConversationPort["history"],
  effective?: EffectiveApprovalMode,
  devices?: DeviceComputersController,
  protectedInputsPort?: ProtectedInputsPort,
) {
  const frames: ConversationClientFrame[] = [];
  const connections: Parameters<ConversationSocketPort["connect"]>[0][] = [];
  const stored = new Map<string, string>();
  const port: ConversationPort = {
    ...(historyPort ? { history: historyPort } : {}),
    snapshot: vi.fn(async () => ({
      conversation,
      messages: [],
      segments: [],
      runs: [],
      cursor: 0,
      toolActivity: [],
      toolActivityTruncated: false,
      ...initial,
    })),
    send: vi.fn(async (input) => message(input.message.text, 3)),
    stop: vi.fn(async () => run("cancelled")),
  };
  const approvals: ApprovalPort = {
    ...(effective ? { effectiveMode: async () => effective } : {}),
    pending: vi.fn(async () => requests),
    answer: vi.fn(async (input) => ({
      ...pendingRequest(),
      state: input.decision,
      answeredByAccountId: accountId,
      resolvedAt: time,
    })),
    effects: vi.fn(async () => []),
  };
  const computerPort: ComputerPort = {
    get: vi.fn<ComputerPort["get"]>(async () =>
      devices ? { status: "available", computer: null } : { status: "not-configured" },
    ),
    start: vi.fn<ComputerPort["start"]>(async () => ({ status: "not-configured" })),
    stop: vi.fn<ComputerPort["stop"]>(async () => ({ status: "not-configured" })),
  };
  const computer = new ComputerController(agent.spaceId, computerPort);
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
      origin="https://app.example.test"
      item={item}
      controller={controller}
      computer={computer}
      devices={devices}
      protectedInputsPort={protectedInputsPort}
      accountId={accountId}
      onBack={onBack}
      onEdit={onEdit}
    />,
  );
  return {
    view,
    controller,
    port,
    computerPort,
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
      devices?.dispose();
    },
  };
}

describe("mobile Agent conversation", () => {
  it("keeps one masked protected-input card with pending approvals across all tabs and preserves normal sending", async () => {
    const request = protectedInputRequestSchema.parse({
      ...selection,
      id: crypto.randomUUID(),
      runId: run().id,
      memberAccountId: accountId,
      toolCallId: "protected-call",
      toolName: "computer_run_command",
      target: ".",
      input: {
        name: "Access token",
        purpose: "Authenticate once",
        destination: { kind: "environment", variable: "TOKEN" },
      },
      untrustedInput: false,
      provenanceKind: null,
      state: "pending",
      createdAt: time,
      expiresAt: "2100-01-01T00:00:00.000Z",
      resolvedAt: null,
    });
    const protectedInputs = {
      pending: vi.fn(async () => [request]),
      answer: vi.fn(async () => ({ ...request, state: "declined" as const })),
    } satisfies ProtectedInputsPort;
    const h = await harness(
      { messages: [message()], runs: [run("waiting")], toolActivity: [toolCall()] },
      [pendingRequest()],
      undefined,
      undefined,
      undefined,
      protectedInputs,
    );
    const input = findByLabel(h.view.root, "Protected input: Access token");
    expect(input.props.secureTextEntry).toBe(true);
    const value = crypto.randomUUID();
    await changeText(input, value);
    for (const label of ["Activity tab", "Files tab", "Conversation tab"]) {
      await press(findByLabel(h.view.root, label));
      expect(
        h.view.root.findAll(
          (node) =>
            typeof node.type === "string" &&
            node.props.accessibilityLabel === "Protected input: Access token",
        ),
      ).toHaveLength(1);
      expect(findByLabel(h.view.root, "Approve")).toBeDefined();
      expect(findByLabel(h.view.root, "Message").props.editable).toBe(true);
    }
    expect(textContent(h.view.root)).not.toContain(value);
    expect(h.controller.getSnapshot().draft).toBe("");
    expect([...h.stored.values()].join("")).not.toContain(value);
    await changeText(findByLabel(h.view.root, "Message"), "Continue with a question");
    await press(findByLabel(h.view.root, "Send"));
    expect(h.port.send).toHaveBeenCalledExactlyOnceWith({
      ...selection,
      message: { idempotencyKey: "mobile-receipt", text: "Continue with a question" },
    });
    expect(protectedInputs.answer).not.toHaveBeenCalled();
    await press(findByLabel(h.view.root, "Decline"));
    expect(protectedInputs.answer).toHaveBeenCalledExactlyOnceWith({
      spaceId: agent.spaceId,
      requestId: request.id,
      answer: { decision: "decline" },
    });
    await h.close();
  });

  it("keeps device selection reachable from the floating composer without starting the sandbox", async () => {
    const devices = await deviceComputerFixture(agent.spaceId, conversation.id);
    const h = await harness({}, [], undefined, undefined, devices.controller);
    await press(findByLabel(h.view.root, "Computer: Work machine"));
    expect(h.computerPort.start).not.toHaveBeenCalled();
    expect(h.view.root.findAllByProps({ accessibilityLabel: "Start computer" })).toHaveLength(0);
    expect(textContent(h.view.root)).toContain(en.agents.devices.warning);
    expect(findByLabel(h.view.root, "Work machine · /work/project")).toBeDefined();
    await press(findByLabel(h.view.root, "Team sandbox"));
    expect(devices.port.select).toHaveBeenCalledExactlyOnceWith({ ...selection, selection: null });
    await press(findByLabel(h.view.root, "Close computer panel"));
    await press(findByLabel(h.view.root, "Computer: Stopped"));
    expect(h.computerPort.start).toHaveBeenCalledOnce();
    await h.close();
  });

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
    const h = await harness(
      { messages: [message()], runs: [run("waiting")], cursor: 2, toolActivity: [toolCall()] },
      [pendingRequest()],
    );
    expect(textContent(h.view.root)).toContain("Waiting for approval");
    expect(findByLabel(h.view.root, "Approve")).toBeDefined();
    expect(
      h.view.root.findAll(
        (node) => typeof node.type === "string" && node.props.accessibilityLabel === "Approve",
      ),
    ).toHaveLength(1);
    expect(
      findByLabel(h.view.root, "1 step · Waiting for approval").props.accessibilityState.expanded,
    ).toBe(false);
    await press(findByLabel(h.view.root, "1 step · Waiting for approval"));
    expect(toolRows(h.view.root)).toHaveLength(0);
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

  it("replaces a pending card with its event-driven tool row and restores the same activity after reload", async () => {
    const h = await harness({ messages: [message()], runs: [run()], cursor: 2 });
    const request = pendingRequest();
    const fields = {
      ...selection,
      runId: request.runId,
      toolCallId: request.toolCallId,
      toolName: request.toolName,
      target: request.target,
      argumentSummary: request.argumentSummary,
    };
    await h.frame({
      type: "event",
      entry: { event: { ...fields, kind: "tool.started", sequence: 3, createdAt: time } },
    });
    expect(findByLabel(h.view.root, "1 step · Running")).toBeDefined();
    const cardFields = {
      ...fields,
      requestId: request.id,
      memberAccountId: accountId,
      expiresAt: request.expiresAt,
    };
    await h.frame({
      type: "event",
      entry: { event: { ...cardFields, kind: "card.created", sequence: 4, createdAt: time } },
    });
    await h.frame({
      type: "event",
      entry: {
        event: {
          ...selection,
          kind: "run.state",
          runId: request.runId,
          state: "waiting",
          failureCode: null,
          sequence: 5,
          createdAt: time,
        },
      },
    });
    expect(
      h.view.root.findAll(
        (node) => typeof node.type === "string" && node.props.accessibilityLabel === "Approve",
      ),
    ).toHaveLength(1);
    await press(findByLabel(h.view.root, "1 step · Waiting for approval"));
    expect(toolRows(h.view.root)).toHaveLength(0);
    await h.frame({
      type: "event",
      entry: {
        event: {
          ...cardFields,
          kind: "card.resolved",
          outcome: "approved",
          answeredByAccountId: accountId,
          sequence: 6,
          createdAt: time,
        },
      },
    });
    await h.frame({
      type: "event",
      entry: {
        event: {
          ...selection,
          kind: "run.state",
          runId: request.runId,
          state: "running",
          failureCode: null,
          sequence: 7,
          createdAt: time,
        },
      },
    });
    const finish: ConversationServerFrame = {
      type: "event",
      entry: {
        event: {
          ...fields,
          kind: "tool.finished",
          outcome: "succeeded",
          durationMs: 2_000,
          exitStatus: null,
          sequence: 8,
          createdAt: "2026-11-14T00:00:02.000Z",
        },
      },
    };
    await h.frame(finish);
    await h.frame(finish);
    expect(
      h.view.root.findAll(
        (node) => typeof node.type === "string" && node.props.accessibilityLabel === "Approve",
      ),
    ).toHaveLength(0);
    expect(toolRows(h.view.root)).toHaveLength(1);
    const activityText = textContent(toolRows(h.view.root)[0]!);
    expect(activityText).toContain("Write a file");
    expect(activityText).toContain("notes.md");
    expect(activityText).toContain("Succeeded");
    expect(activityText).toContain("2.0 s");
    expect(h.frames.at(-1)).toEqual({ type: "ack", version: 1, ...selection, sequence: 8 });
    const toolActivity = h.controller.getSnapshot().toolActivity;
    const resolvedApprovals: NonNullable<ConversationSnapshot["resolvedApprovals"]> = [
      {
        requestId: request.id,
        runId: request.runId,
        toolCallId: request.toolCallId,
        outcome: "approved",
        answeredByAccountId: accountId,
        resolvedAt: time,
      },
    ];
    await h.close();
    const restored = await harness({
      messages: [message()],
      runs: [run()],
      cursor: 8,
      toolActivity,
      resolvedApprovals,
    });
    expect(
      findByLabel(restored.view.root, "1 step · Running").props.accessibilityState.expanded,
    ).toBe(false);
    await press(findByLabel(restored.view.root, "1 step · Running"));
    expect(toolRows(restored.view.root)).toHaveLength(1);
    expect(textContent(toolRows(restored.view.root)[0]!)).toBe(activityText);
    expect(restored.port.send).not.toHaveBeenCalled();
    await restored.close();
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

it("opens only the recent window and loads older messages through the native control and top scroll", async () => {
  const entries = Array.from({ length: 90 }, (_, index) =>
    message(`History ${index + 1}`, index + 1),
  );
  const history = vi.fn<NonNullable<ConversationPort["history"]>>(async ({ before }) => {
    const end = before ? before.beforeSequence - 1 : 90;
    const start = Math.max(0, end - 30);
    return {
      conversation,
      messages: entries.slice(start, end),
      runs: [],
      segments: [],
      cursor: 90,
      olderCursor: start ? { ...selection, beforeSequence: start + 1 } : null,
      runsTruncated: false,
      segmentsTruncated: false,
    };
  });
  const h = await harness({}, [], history);
  expect(textContent(h.view.root)).toContain("History 90");
  expect(textContent(h.view.root)).not.toContain("History 1");
  expect(h.controller.getSnapshot().messages[0]?.sequence).toBe(61);
  expect(h.controller.getSnapshot().messages).toHaveLength(30);
  await press(findByLabel(h.view.root, "Load earlier messages"));
  expect(h.controller.getSnapshot().messages[0]?.sequence).toBe(31);
  const list = findByLabel(h.view.root, "Conversation");
  await act(async () =>
    list.props.onScroll({
      nativeEvent: {
        contentSize: { height: 3000 },
        layoutMeasurement: { height: 400 },
        contentOffset: { y: 0 },
      },
    }),
  );
  expect(h.controller.getSnapshot().messages[0]?.sequence).toBe(1);
  expect(list.props.maintainVisibleContentPosition).toEqual({ minIndexForVisible: 0 });
  expect(textContent(h.view.root)).toContain("Start of conversation");
  await h.close();
});

it.each(["en", "zh"] as const)(
  "restores participant names, departed answerers and first-event origin on native in %s",
  async (language) => {
    useLocales.mockReturnValue([{ languageTag: language, languageCode: language }]);
    const copy = language === "en" ? en.agents : zh.agents;
    const request = pendingRequest();
    const h = await harness({
      messages: [{ ...message(), author: { kind: "member", accountId: "departed" } }],
      runs: [run("succeeded")],
      cursor: 4,
      participants: [
        { accountId: "departed", displayName: "Mei", isMember: false },
        { accountId, displayName: "Alex", isMember: true },
      ],
      toolActivity: [{ ...toolCall(), finishedAt: time, outcome: "succeeded", durationMs: 3 }],
      resolvedApprovals: [
        {
          requestId: request.id,
          runId: request.runId,
          toolCallId: request.toolCallId,
          outcome: "approved",
          answeredByAccountId: "departed",
          resolvedAt: time,
        },
      ],
    });
    const departedName = copy.departedMember.replace("{name}", "Mei");
    expect(textContent(h.view.root)).toContain(departedName);
    const t = createTranslator({ locale: language, messages: messages[language] });
    const activity = findByLabel(
      h.view.root,
      `${t("mobile.steps", { count: 1 })} · ${t("agents.succeeded")}`,
    );
    await press(activity);
    expect(textContent(h.view.root)).toContain(
      copy.approval.answeredBy.replace("{member}", departedName),
    );
    await h.frame({
      type: "event",
      entry: {
        event: {
          ...selection,
          sequence: 5,
          createdAt: time,
          kind: "run.state",
          runId: runIdSchema.parse("inbound"),
          state: "queued",
          failureCode: null,
          trigger: "webhook",
          provenanceKind: "repository",
          untrustedInput: true,
        },
      },
    });
    expect(textContent(h.view.root)).toContain(copy.origins.repository);
    expect(textContent(h.view.root)).toContain(copy.untrustedInput);
    await h.close();
  },
);

it.each([
  ["en", "ask", "account_default"],
  ["zh", "ask", "account_default"],
  ["en", "never", "space_override"],
  ["zh", "never", "space_override"],
  ["en", "auto", "space_override"],
  ["zh", "auto", "account_default"],
] as const)(
  "shows the native viewer's effective approval mode in %s from %s %s",
  async (language, mode, source) => {
    useLocales.mockReturnValue([{ languageTag: language, languageCode: language }]);
    const t = createTranslator({ locale: language, messages: language === "en" ? en : zh });
    const effective: EffectiveApprovalMode = {
      spaceId: agent.spaceId,
      mode,
      source,
      availableModes: [
        { mode: "ask", available: true, reasonCode: null },
        { mode: "never", available: true, reasonCode: null },
        { mode: "auto", available: false, reasonCode: "REVIEW_MODEL_NOT_CONFIGURED" },
      ],
    };
    const h = await harness({}, [], undefined, effective);
    const sourceKey =
      source === "space_override"
        ? "agents.spaceSettings.overridesDefault"
        : "agents.spaceSettings.followsDefault";
    expect(textContent(h.view.root)).toContain(
      `${t("agents.spaceSettings.effectiveMode")}: ${t(`agents.approvalSettings.${mode}`)} · ${t(sourceKey)}`,
    );
    expect(h.port.send).not.toHaveBeenCalled();
    await h.close();
  },
);

it.each(["en", "zh"] as const)(
  "omits sender labels for a single-member native conversation in %s",
  async (language) => {
    useLocales.mockReturnValue([{ languageTag: language, languageCode: language }]);
    const copy = language === "en" ? en.agents : zh.agents;
    const h = await harness({
      messages: [message()],
      cursor: 1,
      participants: [{ accountId, displayName: "Alex", isMember: true }],
    });
    expect(textContent(h.view.root)).toContain("Member question");
    expect(
      h.view.root.findAll(
        (node) => typeof node.type === "string" && textContent(node) === copy.you,
      ),
    ).toHaveLength(0);
    await h.close();
  },
);

it.each(["en", "zh"] as const)(
  "shows old active work and accepts approval without loading history in %s",
  async (language) => {
    useLocales.mockReturnValue([{ languageTag: language, languageCode: language }]);
    const translator = createTranslator({
      locale: language,
      messages: language === "en" ? en : zh,
    });
    const request = pendingRequest();
    const active = {
      run: { ...run("waiting"), untrustedInput: true },
      triggerMessage: { id: message().id, sequence: 1 },
      pendingApprovals: [
        {
          requestId: request.id,
          runId: request.runId,
          toolCallId: request.toolCallId,
          toolName: request.toolName,
          argumentSummary: request.argumentSummary,
          target: request.target,
          memberAccountId: accountId,
          createdAt: time,
          expiresAt: request.expiresAt,
        },
      ],
      pendingApprovalsTruncated: false,
      latestCommittedSegment: null,
    };
    const historyPort = vi.fn<NonNullable<ConversationPort["history"]>>(async (input) => ({
      conversation,
      messages: input.before ? [message()] : [message("Recent", 100)],
      runs: input.before ? [active.run] : [],
      segments: [],
      cursor: 100,
      olderCursor: input.before ? null : { ...selection, beforeSequence: 100 },
      runsTruncated: false,
      segmentsTruncated: false,
      activeRuns: [active],
    }));
    const h = await harness({}, [request], historyPort);
    expect(textContent(h.view.root)).toContain(translator("agents.stillWorking.title"));
    expect(textContent(h.view.root)).not.toContain("Member question");
    await press(findByLabel(h.view.root, translator("agents.stillWorking.steer")));
    expect(textContent(h.view.root)).toContain(
      translator("agents.stillWorking.targeted", { name: agent.name }),
    );
    await changeText(findByLabel(h.view.root, translator("agents.message")), "Steer this old work");
    await press(findByLabel(h.view.root, translator("agents.send")));
    expect(h.port.send).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.objectContaining({
          steerRunId: active.run.id,
          text: "Steer this old work",
        }),
      }),
    );
    await press(findByLabel(h.view.root, translator("agents.approval.approve")));
    expect(h.approvals.answer).toHaveBeenCalledWith({
      spaceId: agent.spaceId,
      requestId: request.id,
      decision: "approved",
    });
    expect(historyPort).toHaveBeenCalledTimes(1);
    await press(findByLabel(h.view.root, translator("agents.stillWorking.showRun")));
    expect(historyPort).toHaveBeenLastCalledWith({
      ...selection,
      limit: 30,
      before: { ...selection, beforeSequence: 2 },
    });
    expect(textContent(h.view.root)).not.toContain(translator("agents.stillWorking.title"));
    await h.close();
  },
);

it("steers a visible direct Run only after explicit selection and send", async () => {
  const h = await harness({ messages: [message()], runs: [run()], cursor: 1 });
  await press(findByLabel(h.view.root, "Steer"));
  expect(textContent(h.view.root)).toContain("Steering Reader");
  expect(h.port.send).not.toHaveBeenCalled();
  await changeText(findByLabel(h.view.root, "Message"), "Keep it brief");
  await press(findByLabel(h.view.root, "Send"));
  expect(h.port.send).toHaveBeenCalledWith({
    ...selection,
    message: { text: "Keep it brief", idempotencyKey: "mobile-receipt", steerRunId: run().id },
  });
  await h.close();
});

it.each([
  ["en", "approve", "approved"],
  ["zh", "approve", "approved"],
  ["en", "deny", "denied"],
  ["zh", "deny", "denied"],
] as const)(
  "shows %s automatic %s decisions after history hydration",
  async (language, verdict, outcome) => {
    useLocales.mockReturnValue([{ languageTag: language, languageCode: language }]);
    const copy = { en, zh }[language].agents;
    const request = pendingRequest();
    const reason = "Matches the requested note. <b>quoted data</b>";
    const h = await harness({
      messages: [message()],
      runs: [run("succeeded")],
      cursor: 5,
      toolActivity: [
        {
          ...toolCall(),
          finishedAt: time,
          outcome: outcome === "approved" ? "succeeded" : "refused",
          durationMs: 0,
        },
      ],
      resolvedApprovals: [
        {
          requestId: request.id,
          runId: request.runId,
          toolCallId: request.toolCallId,
          outcome,
          answeredByAccountId: null,
          resolvedAt: time,
          review: {
            modelId: "review-model",
            verdict,
            reason,
            startedAt: time,
            completedAt: time,
            durationMs: 0,
            fence: 1,
          },
        },
      ],
    });
    const t = createTranslator({ locale: language, messages: messages[language] });
    let summary = `${t("mobile.steps", { count: 1 })} · ${t("agents.succeeded")}`;
    if (outcome === "denied") summary += ` · ${t("agents.activity.failedCount", { count: 1 })}`;
    await press(findByLabel(h.view.root, summary));
    const text = textContent(toolRows(h.view.root)[0]!);
    expect(text).toContain(copy.approval.automatic[outcome]);
    expect(text).toContain(reason);
    expect(h.port.send).not.toHaveBeenCalled();
    await h.close();
  },
);
it("switches the main native column between Conversation, Activity and Files without losing its draft", async () => {
  const h = await harness({
    messages: [message()],
    runs: [run()],
    cursor: 2,
    toolActivity: [toolCall()],
  });
  await changeText(findByLabel(h.view.root, "Message"), "Keep this draft");
  await press(findByLabel(h.view.root, "Activity tab"));
  expect(findByLabel(h.view.root, "Activity tab").props.accessibilityState.selected).toBe(true);
  expect(textContent(h.view.root)).not.toContain("Member question");
  expect(findByLabel(h.view.root, "1 step · Running")).toBeDefined();
  await press(findByLabel(h.view.root, "Files tab"));
  expect(textContent(h.view.root)).toContain("not configured");
  await press(findByLabel(h.view.root, "Conversation tab"));
  expect(textContent(h.view.root)).toContain("Member question");
  expect(findByLabel(h.view.root, "Message").props.value).toBe("Keep this draft");
  expect(h.port.send).not.toHaveBeenCalled();
  await h.close();
});

it("copies a completed reply and prepares its question for an explicit retry", async () => {
  const h = await harness({
    messages: [message()],
    runs: [run("succeeded")],
    cursor: 3,
    segments: [
      {
        ...selection,
        id: "reply",
        runId: run().id,
        sequence: 3,
        text: "A completed reply",
        createdAt: time,
      },
    ],
  });
  vi.mocked(Clipboard.setStringAsync).mockClear();
  expect(Clipboard.setStringAsync).not.toHaveBeenCalled();
  await press(findByLabel(h.view.root, "Copy reply"));
  expect(Clipboard.setStringAsync).toHaveBeenCalledExactlyOnceWith("A completed reply");
  await press(findByLabel(h.view.root, "Prepare retry"));
  expect(h.controller.getSnapshot().draft).toBe("Member question");
  expect(h.port.send).not.toHaveBeenCalled();
  await changeText(findByLabel(h.view.root, "Message"), "A different draft");
  expect(findByLabel(h.view.root, "Prepare retry").props.isDisabled).toBe(true);
  await h.close();
});

it("keeps addressed approvals above the native composer while Activity is selected", async () => {
  const h = await harness(
    { messages: [message()], runs: [run("waiting")], cursor: 2, toolActivity: [toolCall()] },
    [pendingRequest()],
  );
  await press(findByLabel(h.view.root, "Activity tab"));
  expect(
    h.view.root.findAll(
      (node) => typeof node.type === "string" && node.props.accessibilityLabel === "Approve",
    ),
  ).toHaveLength(1);
  await changeText(findByLabel(h.view.root, "Message"), "I can keep writing");
  expect(h.controller.getSnapshot().draft).toBe("I can keep writing");
  await press(findByLabel(h.view.root, "Approve"));
  expect(h.approvals.answer).toHaveBeenCalledExactlyOnceWith({
    spaceId: agent.spaceId,
    requestId: pendingRequest().id,
    decision: "approved",
  });
  await h.close();
});

it.each(["cancelled", "waiting"] as const)(
  "shows the %s Run state only once inline with its native steps",
  async (state) => {
    const h = await harness({
      messages: [message()],
      runs: [run(state)],
      cursor: 3,
      toolActivity: [{ ...toolCall(), finishedAt: time, outcome: "succeeded" }],
    });
    const status = en.agents[state];
    const trigger = findByLabel(h.view.root, `1 step · ${status}`);
    expect(trigger.props.accessibilityState.expanded).toBe(false);
    expect(textContent(h.view.root).split(status)).toHaveLength(2);
    const live = h.view.root.findAll(
      (node) => typeof node.type === "string" && node.props.accessibilityLiveRegion === "polite",
    );
    expect(live.some((node) => textContent(node).includes(status))).toBe(true);
    await h.close();
  },
);
