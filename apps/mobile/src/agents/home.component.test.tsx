import { afterEach, expect, it, vi } from "vitest";
import { agentSchema, conversationIdSchema, directConversation } from "@raypx/core/agents";
import { messageIdSchema } from "@raypx/core/conversation";
import {
  ComputerController,
  ConversationController,
  type DeviceComputersController,
  type ComputerPort,
  type ConversationPort,
} from "@raypx/agents/model";
import { changeText, findByLabel, press, renderNative, textContent } from "../../tests/native.js";
import { useLocales } from "../../tests/mocks/localization.js";
import { AgentHome } from "./home.js";
import { deviceComputerFixture } from "../../tests/fixtures/device-computer.js";

const date = "2026-11-14T00:00:00Z";
const agent = agentSchema.parse({
  id: "reader",
  spaceId: "space",
  name: "Reader",
  instructions: "Read",
  model: { modelId: "model" },
  createdAt: date,
  updatedAt: date,
});
const item = {
  agent,
  conversation: directConversation(agent, conversationIdSchema.parse("conversation")),
};
const second = {
  agent: { ...agent, id: agentSchema.shape.id.parse("writer"), name: "Writer" },
  conversation: directConversation(agent, conversationIdSchema.parse("writer-conversation")),
};
afterEach(() => useLocales.mockReset());

async function harness(stopped = false, devices?: DeviceComputersController) {
  const port: ConversationPort = {
    snapshot: vi.fn(async () => ({
      conversation: item.conversation,
      messages: [],
      segments: [],
      runs: [],
      cursor: 0,
    })),
    send: vi.fn(async (input) => ({
      id: messageIdSchema.parse("message"),
      ...input,
      sequence: 1,
      text: input.message.text,
      author: { kind: "member" as const, accountId: "member" },
      createdAt: date,
    })),
    stop: vi.fn(),
  };
  const computers: ComputerPort = {
    get: vi.fn(async () =>
      stopped
        ? { status: "available" as const, computer: null }
        : { status: "not-configured" as const },
    ),
    start: vi.fn(async () => ({ status: "not-configured" as const })),
    stop: vi.fn(async () => ({ status: "not-configured" as const })),
  };
  const computer = new ComputerController(agent.spaceId, computers);
  const controller = new ConversationController({
    selection: { spaceId: agent.spaceId, conversationId: item.conversation.id },
    owner: { origin: "https://example.test", accountId: "member" },
    port,
    computer,
    socket: { connect: () => ({ close() {}, send() {} }) },
    drafts: { read: () => null, write() {}, remove() {} },
    key: () => "home-message",
  });
  await controller.start();
  await computer.refresh();
  const callbacks = { onSelect: vi.fn(), onOpen: vi.fn(), onEdit: vi.fn(), onContext: vi.fn() };
  const view = await renderNative(
    <AgentHome
      item={item}
      agents={[item, second]}
      models={[{ modelId: "model", name: "Offered model", source: "deployment" }]}
      controller={controller}
      computer={computer}
      devices={devices}
      {...callbacks}
    />,
  );
  return {
    view,
    controller,
    port,
    computers,
    ...callbacks,
    async close() {
      await view.unmount();
      controller.dispose();
      computer.dispose();
      devices?.dispose();
    },
  };
}

it.each([
  ["en", "Message", "Send", "What would you like to work on?"],
  ["zh", "消息", "发送", "今天想做些什么？"],
] as const)(
  "sends from home only after an explicit press in %s",
  async (language, message, send, heading) => {
    useLocales.mockReturnValue([{ languageTag: language, languageCode: language }]);
    const h = await harness();
    expect(textContent(h.view.root)).toContain(heading);
    await changeText(findByLabel(h.view.root, message), "A question from home");
    expect(h.port.send).not.toHaveBeenCalled();
    await press(findByLabel(h.view.root, send));
    expect(h.port.send).toHaveBeenCalledExactlyOnceWith({
      spaceId: agent.spaceId,
      conversationId: item.conversation.id,
      message: { text: "A question from home", idempotencyKey: "home-message" },
    });
    expect(h.onOpen).toHaveBeenCalledOnce();
    await h.close();
  },
);

it("selects a target and retains context/model navigation without sending", async () => {
  const h = await harness();
  await press(findByLabel(h.view.root, "Choose Agent"));
  await press(findByLabel(h.view.root, "Writer"));
  expect(h.onSelect).toHaveBeenCalledExactlyOnceWith("writer");
  await press(findByLabel(h.view.root, "Add context"));
  await press(findByLabel(h.view.root, "Model"));
  expect(h.onContext).toHaveBeenCalledOnce();
  expect(h.onEdit).toHaveBeenCalledOnce();
  expect(h.port.send).not.toHaveBeenCalled();
  await h.close();
});

it("opens an unavailable computer without starting it", async () => {
  const h = await harness();
  const label = "Computer: Not configured on this server";
  await press(findByLabel(h.view.root, label));
  expect(h.computers.start).not.toHaveBeenCalled();
  expect(textContent(h.view.root)).toContain("Not configured");
  await h.close();
});

it("keeps an uncertain receipt and can explicitly retry delivery from home", async () => {
  const h = await harness();
  vi.mocked(h.port.send).mockRejectedValueOnce(new Error("offline"));
  await changeText(findByLabel(h.view.root, "Message"), "Keep my receipt");
  await press(findByLabel(h.view.root, "Send"));
  expect(findByLabel(h.view.root, "Message").props.editable).toBe(false);
  const receipt = h.controller.getSnapshot().pending;
  await press(findByLabel(h.view.root, "Retry delivery"));
  expect(h.port.send).toHaveBeenLastCalledWith(expect.objectContaining({ message: receipt }));
  expect(h.port.send).toHaveBeenCalledTimes(2);
  await h.close();
});

it("starts the Space computer only when its composer control is pressed", async () => {
  const h = await harness(true);
  expect(h.computers.start).not.toHaveBeenCalled();
  await press(findByLabel(h.view.root, "Computer: Stopped"));
  expect(h.computers.start).toHaveBeenCalledExactlyOnceWith({ spaceId: agent.spaceId });
  await h.close();
});

it.each(["connected", "offline", "loading", "error"] as const)(
  "opens device controls from home without starting the sandbox for a %s device projection",
  async (state) => {
    const devices = await deviceComputerFixture(agent.spaceId, item.conversation.id, state);
    const h = await harness(true, devices.controller);
    const indicator = h.view.root.find(
      (node) =>
        typeof node.type === "string" && node.props.accessibilityLabel?.startsWith("Computer:"),
    );
    await press(indicator);
    expect(h.computers.start).not.toHaveBeenCalled();
    expect(h.view.root.findAllByProps({ accessibilityLabel: "Start computer" })).toHaveLength(0);
    await h.close();
  },
);

it.each([
  ["connected", "Computer: Work machine"],
  ["offline", "Computer: Selected device unavailable"],
] as const)(
  "requires an explicit sandbox selection before starting it from the %s device",
  async (state, label) => {
    const devices = await deviceComputerFixture(agent.spaceId, item.conversation.id, state);
    const h = await harness(true, devices.controller);
    await press(findByLabel(h.view.root, label));
    expect(findByLabel(h.view.root, "Work machine · /work/project")).toBeDefined();
    await press(findByLabel(h.view.root, "Team sandbox"));
    expect(devices.port.select).toHaveBeenCalledExactlyOnceWith({
      spaceId: agent.spaceId,
      conversationId: item.conversation.id,
      selection: null,
    });
    await press(findByLabel(h.view.root, "Close computer panel"));
    await press(findByLabel(h.view.root, "Computer: Stopped"));
    expect(h.computers.start).toHaveBeenCalledOnce();
    await h.close();
  },
);
