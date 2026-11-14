import type { ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { agentSchema, conversationIdSchema, directConversation } from "@raypx/core/agents";
import { spaceSchema, spaceMemberSchema } from "@raypx/core/spaces";
import { applyAgents, applySpaces, createAgentsPageState } from "@raypx/agents/model";
import { changeText, findByLabel, press, renderNative, textContent } from "../../tests/native.js";
import { AgentDirectory, AgentEditor } from "./directory.js";
import { useLocales } from "../../tests/mocks/localization.js";

afterEach(() => {
  useLocales.mockReset();
  vi.useRealTimers();
});

const date = "2026-11-14T00:00:00.000Z";
const agent = agentSchema.parse({
  id: "agent-one",
  spaceId: "space-one",
  name: "Ray",
  instructions: "Help with reading",
  model: { modelId: "model-one" },
  createdAt: date,
  updatedAt: date,
});
const item = {
  agent,
  conversation: directConversation(agent, conversationIdSchema.parse("conversation-one")),
};
const membership = {
  space: spaceSchema.parse({ id: "space-one", name: "My Space", createdAt: date, updatedAt: date }),
  member: spaceMemberSchema.parse({
    spaceId: "space-one",
    accountId: "account",
    role: "owner",
    createdAt: date,
  }),
};
const otherMembership = {
  space: spaceSchema.parse({ id: "space-two", name: "Team", createdAt: date, updatedAt: date }),
  member: spaceMemberSchema.parse({
    spaceId: "space-two",
    accountId: "account",
    role: "member",
    createdAt: date,
  }),
};

function directoryProps() {
  const state = applyAgents(applySpaces(createAgentsPageState(), [membership]), "space-one", [
    item,
  ]);
  return {
    state: {
      ...state,
      models: [{ modelId: "model-one", name: "Offered model", source: "deployment" as const }],
    },
    loading: false,
    error: false,
    refreshing: false,
    onRefresh: vi.fn(),
    onSelectSpace: vi.fn(),
    onOpen: vi.fn(),
    onCreate: vi.fn(),
    onEdit: vi.fn(),
    onDelete: vi.fn(),
    onAccount: vi.fn(),
    onCreateSpace: vi.fn(),
  } satisfies ComponentProps<typeof AgentDirectory>;
}

describe("mobile Agent directory", () => {
  it("opens conversations and management actions and omits a one-Space switcher", async () => {
    const props = directoryProps();
    const view = await renderNative(<AgentDirectory {...props} />);
    expect(textContent(view.root)).toContain("Offered model");
    expect(textContent(view.root)).toContain("No activity yet");
    expect(view.root.findAll((node) => node.props.accessibilityLabel === "Space")).toHaveLength(0);
    await press(findByLabel(view.root, "Ray"));
    await press(findByLabel(view.root, "Edit Agent: Ray"));
    await press(findByLabel(view.root, "Delete Agent: Ray"));
    await press(findByLabel(view.root, "Account"));
    expect(props.onOpen).toHaveBeenCalledWith(item);
    expect(props.onEdit).toHaveBeenCalledWith(item);
    expect(props.onDelete).toHaveBeenCalledWith(item);
    expect(props.onAccount).toHaveBeenCalledOnce();
    await view.unmount();
  });

  it("offers a switcher for several Spaces and refreshes the native list", async () => {
    const props = directoryProps();
    props.state.spaces = [membership, otherMembership];
    const view = await renderNative(<AgentDirectory {...props} />);
    expect(findByLabel(view.root, "Space")).toBeDefined();
    const list = view.root.find(
      (node) =>
        typeof node.type === "string" &&
        typeof node.props.onRefresh === "function" &&
        node.props.onRefresh === props.onRefresh,
    );
    list.props.onRefresh();
    expect(props.onRefresh).toHaveBeenCalledOnce();
    await view.unmount();
  });

  it.each([
    { language: "en", name: "Name", create: "Create Agent", empty: "No models are available." },
    { language: "zh", name: "名称", create: "创建智能体", empty: "暂无可用模型。" },
  ])(
    "shows the no-model state and cannot create an Agent without an offered model in $language",
    async ({ language, name, create, empty }) => {
      useLocales.mockReturnValue([{ languageTag: language, languageCode: language }]);
      const onSave = vi.fn();
      const view = await renderNative(
        <AgentEditor models={[]} busy={false} error={false} onSave={onSave} onCancel={vi.fn()} />,
      );
      await changeText(findByLabel(view.root, name), "New Agent");
      expect(textContent(view.root)).toContain(empty);
      expect(findByLabel(view.root, create).props.isDisabled).toBe(true);
      await press(findByLabel(view.root, create));
      expect(onSave).not.toHaveBeenCalled();
      await view.unmount();
    },
  );

  it("preserves instructions and submits the selected offered model", async () => {
    const onSave = vi.fn();
    const view = await renderNative(
      <AgentEditor
        item={item}
        models={[{ modelId: "model-one", name: "Offered model", source: "deployment" }]}
        busy={false}
        error={false}
        onSave={onSave}
        onCancel={vi.fn()}
      />,
    );
    await changeText(findByLabel(view.root, "Name"), "  Reader  ");
    await changeText(findByLabel(view.root, "Instructions"), "Read carefully");
    await press(findByLabel(view.root, "Save"));
    expect(onSave).toHaveBeenCalledWith({
      name: "Reader",
      instructions: "Read carefully",
      model: { modelId: "model-one" },
    });
    await view.unmount();
  });

  it.each([
    {
      language: "en",
      model: "Model",
      connection: "Connection",
      deployment: "Deployment",
      memberGroup: "Your connections",
      serverGroup: "Server models",
      save: "Save",
    },
    {
      language: "zh",
      model: "模型",
      connection: "连接",
      deployment: "部署",
      memberGroup: "你的连接",
      serverGroup: "服务器模型",
      save: "保存",
    },
  ])(
    "groups catalog sources and submits the chosen model identity in $language",
    async ({ language, model, connection, deployment, memberGroup, serverGroup, save }) => {
      useLocales.mockReturnValue([{ languageTag: language, languageCode: language }]);
      const onSave = vi.fn();
      const view = await renderNative(
        <AgentEditor
          item={item}
          models={[
            { modelId: "model-one", name: "Hosted model", source: "deployment" },
            {
              modelId: "opaque-member-model",
              name: "Personal / Connected model",
              source: "connection",
            },
          ]}
          busy={false}
          error={false}
          onSave={onSave}
          onCancel={vi.fn()}
        />,
      );
      const groupHeadings = view.root
        .findAll(
          (node) => typeof node.type === "string" && node.props.accessibilityRole === "header",
        )
        .map(textContent)
        .filter((text) => text === memberGroup || text === serverGroup);
      expect(groupHeadings).toEqual([memberGroup, serverGroup]);
      expect(textContent(findByLabel(view.root, model))).toContain(deployment);
      await press(findByLabel(view.root, `Personal / Connected model, ${connection}`));
      expect(textContent(findByLabel(view.root, model))).toContain(connection);
      await press(findByLabel(view.root, save));
      expect(onSave).toHaveBeenCalledWith({
        name: item.agent.name,
        instructions: item.agent.instructions,
        model: { modelId: "opaque-member-model" },
      });
      await view.unmount();
    },
  );
});

it.each([
  ["en", "Active 5 min. ago"],
  ["zh", "5分钟前活跃"],
] as const)(
  "shows activity rather than metadata edits and sorts the mobile directory in %s",
  async (language, label) => {
    vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
    vi.setSystemTime(new Date("2026-11-14T12:00:00Z"));
    useLocales.mockReturnValue([{ languageTag: language, languageCode: language }]);
    const props = directoryProps();
    const active = {
      ...item,
      agent: {
        ...item.agent,
        id: "active-agent" as typeof agent.id,
        name: "Active Agent",
        lastActivityAt: "2026-11-14T11:55:00Z",
      },
    };
    props.state.agents = [item, active];
    const view = await renderNative(<AgentDirectory {...props} />);
    expect(textContent(view.root)).toContain(label);
    const rows = view.root.findAll(
      (node) =>
        typeof node.type === "string" &&
        ["Ray", "Active Agent"].includes(node.props.accessibilityLabel),
    );
    expect(rows.map((node) => node.props.accessibilityLabel)).toEqual(["Active Agent", "Ray"]);
    await view.unmount();
  },
);
