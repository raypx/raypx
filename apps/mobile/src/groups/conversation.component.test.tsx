import { describe, expect, it, vi } from "vitest";
import { agentSchema, conversationSchema } from "@raypx/core/agents";
import { messageSchema, replySegmentSchema, runSchema, type Run } from "@raypx/core/conversation";
import {
  ComputerController,
  ConversationController,
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
import { AgentConversation } from "../agents/conversation.js";

const time = "2026-11-14T00:00:00.000Z";
const agents = ["Reader", "Writer", "Former"].map((name) =>
  agentSchema.parse({
    id: name,
    spaceId: "space",
    name,
    instructions: "",
    model: { modelId: "model" },
    createdAt: time,
    updatedAt: time,
  }),
);
const conversation = conversationSchema.parse({
  id: "group",
  spaceId: "space",
  agentId: "Reader",
  kind: "group",
  name: "Reading room",
  agentIds: ["Reader", "Writer"],
  createdAt: time,
});
const selection = { spaceId: conversation.spaceId, conversationId: conversation.id };
const message = messageSchema.parse({
  ...selection,
  id: "message",
  sequence: 1,
  author: { kind: "member", accountId: "member" },
  text: "Read and write",
  createdAt: time,
});
const readerRun = runSchema.parse({
  ...selection,
  id: "reader-run",
  agentId: "Reader",
  trigger: "message",
  messageId: message.id,
  memberAccountId: "member",
  model: { modelId: "model" },
  state: "running",
  failureCode: null,
  createdAt: time,
  startedAt: time,
  firstResponseAt: null,
  finishedAt: null,
});
const writerRun = runSchema.parse({ ...readerRun, id: "writer-run", agentId: "Writer" });

async function harness(initial: Partial<ConversationSnapshot> = {}) {
  let callbacks: Parameters<ConversationSocketPort["connect"]>[0] | undefined;
  const port: ConversationPort = {
    snapshot: vi.fn(async () => ({
      conversation,
      messages: [],
      runs: [],
      segments: [],
      cursor: 10,
      toolActivity: [],
      toolActivityTruncated: false,
      ...initial,
    })),
    send: vi.fn(async (input) => ({ ...message, text: input.message.text, sequence: 5 })),
    stop: vi.fn(async ({ runId }) => ({
      ...(runId === readerRun.id ? readerRun : writerRun),
      state: "cancelled" as const,
    })),
  };
  const computer = new ComputerController(conversation.spaceId, {
    get: async () => ({ status: "not-configured" }),
    start: async () => ({ status: "not-configured" }),
    stop: async () => ({ status: "not-configured" }),
  });
  const controller = new ConversationController({
    selection,
    owner: { origin: "https://app.example.test", accountId: "member" },
    port,
    computer,
    socket: {
      connect: (next) => {
        callbacks = next;
        return { send() {}, close() {} };
      },
    },
    drafts: { read: () => null, write() {}, remove() {} },
    key: () => "group-send",
  });
  await controller.start();
  callbacks?.onFrame({ type: "ready", version: 1 });
  const view = await renderNative(
    <AgentConversation
      group={{ conversation, agents }}
      controller={controller}
      computer={computer}
      accountId="member"
      origin="https://app.example.test"
      onBack={vi.fn()}
      onEdit={vi.fn()}
    />,
  );
  return {
    view,
    controller,
    port,
    async stopped() {
      await act(async () => {
        callbacks?.onFrame({
          type: "event",
          entry: {
            event: {
              ...selection,
              sequence: 11,
              createdAt: time,
              kind: "run.state",
              runId: writerRun.id,
              state: "cancelled",
              failureCode: null,
            },
          },
        });
      });
    },
    async close() {
      await view.unmount();
      controller.dispose();
      computer.dispose();
    },
  };
}
function segments(runs: Run[]) {
  return runs.map((run, index) =>
    replySegmentSchema.parse({
      ...selection,
      id: `segment-${index}`,
      runId: run.id,
      agentId: run.agentId,
      sequence: index + 2,
      text: `${run.agentId} response`,
      createdAt: time,
    }),
  );
}

describe("native group conversation", () => {
  it("serializes only explicitly selected mentions from the native suggestions", async () => {
    const h = await harness();
    await changeText(findByLabel(h.view.root, "Message"), "@W");
    expect(h.port.send).not.toHaveBeenCalled();
    await press(findByLabel(h.view.root, "Writer"));
    expect(h.controller.getSnapshot().draft).toBe("@Writer ");
    expect(h.controller.getSnapshot().mentionTokens?.map((token) => token.agentId)).toEqual([
      agents[1]!.id,
    ]);
    await press(findByLabel(h.view.root, "Send"));
    expect(h.port.send).toHaveBeenCalledWith({
      ...selection,
      message: { idempotencyKey: "group-send", text: "@Writer ", mentions: [agents[1]!.id] },
    });
    await h.close();
  });
  it("does not infer mentions from names typed as ordinary text or show removed participants", async () => {
    const h = await harness();
    await changeText(findByLabel(h.view.root, "Message"), "@Former");
    expect(textContent(h.view.root)).toContain("No matching Agents");
    expect(
      h.view.root.findAll(
        (node) => typeof node.type === "string" && node.props.accessibilityLabel === "Former",
      ),
    ).toHaveLength(0);
    await changeText(findByLabel(h.view.root, "Message"), "Hello @Reader and @Writer");
    await press(findByLabel(h.view.root, "Send"));
    expect(h.port.send).toHaveBeenCalledWith({
      ...selection,
      message: { idempotencyKey: "group-send", text: "Hello @Reader and @Writer" },
    });
    await h.close();
  });
  it("attributes concurrent replies and stops only the addressed Agent's Run", async () => {
    const h = await harness({
      messages: [message],
      runs: [readerRun, writerRun],
      segments: segments([readerRun, writerRun]),
    });
    const content = textContent(h.view.root);
    expect(content).toContain("Reader response");
    expect(content).toContain("Writer response");
    expect(findByLabel(h.view.root, "Stop Reader’s reply")).toBeDefined();
    await press(findByLabel(h.view.root, "Stop Writer’s reply"));
    expect(h.port.stop).toHaveBeenCalledWith({ ...selection, runId: writerRun.id });
    await h.stopped();
    expect(h.controller.getSnapshot().runs.find((run) => run.id === readerRun.id)?.state).toBe(
      "running",
    );
    expect(h.controller.getSnapshot().runs.find((run) => run.id === writerRun.id)?.state).toBe(
      "cancelled",
    );
    await h.close();
  });
  it("steers the selected concurrent Run and freezes its exact target on send", async () => {
    const h = await harness({
      messages: [message],
      runs: [readerRun, writerRun],
      segments: segments([readerRun, writerRun]),
    });
    const steer = h.view.root.findAll(
      (node) => typeof node.type === "string" && node.props.accessibilityLabel === "Steer",
    );
    expect(steer).toHaveLength(2);
    await press(steer[1]!);
    expect(textContent(h.view.root)).toContain("Steering Writer");
    await changeText(findByLabel(h.view.root, "Message"), "Use shorter sentences");
    await press(findByLabel(h.view.root, "Send"));
    expect(h.port.send).toHaveBeenCalledWith({
      ...selection,
      message: {
        idempotencyKey: "group-send",
        text: "Use shorter sentences",
        steerRunId: writerRun.id,
      },
    });
    await h.close();
  });
  it("retains departed member names and attributes historical Agent messages", async () => {
    const departed = messageSchema.parse({
      ...message,
      author: { kind: "member", accountId: "departed" },
      text: "Earlier question",
    });
    const formerMessage = messageSchema.parse({
      ...message,
      id: "agent-message",
      sequence: 2,
      author: { kind: "agent", agentId: agents[2]!.id, accountId: "member" },
      text: "Historical Agent note",
    });
    const h = await harness({
      messages: [departed, formerMessage],
      participants: [{ accountId: "departed", displayName: "Mira", isMember: false }],
    });
    expect(textContent(h.view.root)).toContain("Mira (no longer in this Space)");
    expect(textContent(h.view.root)).toContain("Former");
    expect(textContent(h.view.root)).toContain("Historical Agent note");
    await act(async () => {
      h.controller.setDraft("Kept locally");
    });
    expect(h.port.send).not.toHaveBeenCalled();
    await h.close();
  });
});
