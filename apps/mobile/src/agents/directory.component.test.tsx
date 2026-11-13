import { describe, expect, it, vi } from "vitest";
import { agentSchema, conversationIdSchema, directConversation } from "@raypx/core/agents";
import { spaceSchema, spaceMemberSchema } from "@raypx/core/spaces";
import { applyAgents, applySpaces, createAgentsPageState } from "@raypx/agents/model";
import { changeText, findByLabel, press, renderNative, textContent } from "../../tests/native.js";
import { AgentDirectory, AgentEditor } from "./directory.js";

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
    state: { ...state, models: [{ modelId: "model-one", name: "Offered model" }] },
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
  };
}

describe("mobile Agent directory", () => {
  it("opens conversations and management actions and omits a one-Space switcher", async () => {
    const props = directoryProps();
    const view = await renderNative(<AgentDirectory {...props} />);
    expect(textContent(view.root)).toContain("Offered model");
    expect(textContent(view.root)).toContain("Last edited");
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
        node.props.data === props.state.agents,
    );
    list.props.onRefresh();
    expect(props.onRefresh).toHaveBeenCalledOnce();
    await view.unmount();
  });

  it("shows the no-model state and cannot create an Agent without an offered model", async () => {
    const onSave = vi.fn();
    const view = await renderNative(
      <AgentEditor models={[]} busy={false} error={false} onSave={onSave} onCancel={vi.fn()} />,
    );
    await changeText(findByLabel(view.root, "Name"), "New Agent");
    expect(textContent(view.root)).toContain("No models are available on this server.");
    await press(findByLabel(view.root, "Create Agent"));
    expect(onSave).not.toHaveBeenCalled();
    await view.unmount();
  });

  it("preserves instructions and submits the selected offered model", async () => {
    const onSave = vi.fn();
    const view = await renderNative(
      <AgentEditor
        item={item}
        models={[{ modelId: "model-one", name: "Offered model" }]}
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

  it("shows catalog sources subtly and submits the chosen model identity", async () => {
    const onSave = vi.fn();
    const view = await renderNative(
      <AgentEditor
        item={item}
        models={[
          { modelId: "model-one", name: "Hosted model", source: "deployment" },
          { modelId: "model-two", name: "Connected model", source: "connection" },
        ]}
        busy={false}
        error={false}
        onSave={onSave}
        onCancel={vi.fn()}
      />,
    );
    expect(textContent(findByLabel(view.root, "Model"))).toContain("Deployment");
    await press(findByLabel(view.root, "Connected model, Connection"));
    expect(textContent(findByLabel(view.root, "Model"))).toContain("Connection");
    await press(findByLabel(view.root, "Save"));
    expect(onSave).toHaveBeenCalledWith({
      name: item.agent.name,
      instructions: item.agent.instructions,
      model: { modelId: "model-two" },
    });
    await view.unmount();
  });
});
