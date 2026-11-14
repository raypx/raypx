import { afterEach, describe, expect, it, vi } from "vitest";
import { agentSchema, conversationSchema } from "@raypx/core/agents";
import { spaceIdSchema } from "@raypx/core/spaces";
import type { GroupsPort } from "@raypx/agents/model";
import {
  act,
  changeText,
  findByLabel,
  press,
  renderNative,
  textContent,
} from "../../tests/native.js";
import { useLocales } from "../../tests/mocks/localization.js";
import { MobileGroupsController } from "./controller.js";
import { GroupsScreen } from "./screens.js";
import { MentionSuggestions } from "./mention-suggestions.js";

const date = "2026-11-14T00:00:00.000Z";
const spaceId = spaceIdSchema.parse("space-one");
const agents = ["Reader", "Writer", "Planner"].map((name) =>
  agentSchema.parse({
    id: name,
    spaceId,
    name,
    instructions: "",
    model: { modelId: "one" },
    createdAt: date,
    updatedAt: date,
  }),
);
function fixture() {
  const group = conversationSchema.parse({
    id: "group",
    spaceId,
    agentId: agents[0]!.id,
    kind: "group",
    name: "Reading room",
    agentIds: agents.slice(0, 2).map((agent) => agent.id),
    createdAt: date,
  });
  const port = {
    listGroups: vi.fn(async () => [group]),
    getGroup: vi.fn(async () => group),
    createGroup: vi.fn(async (input) => ({ ...group, ...input })),
    renameGroup: vi.fn(async (input) => ({ ...group, name: input.name })),
    addGroupAgent: vi.fn(async () => group),
    removeGroupAgent: vi.fn(async () => group),
    deleteGroup: vi.fn(async () => ({ deleted: true as const })),
  } satisfies GroupsPort;
  return { group, port, controller: new MobileGroupsController(spaceId, port) };
}
afterEach(() => useLocales.mockReset());

describe("native Groups", () => {
  it("opens groups and delegates destructive confirmation to the route", async () => {
    const { group, controller } = fixture();
    await controller.load();
    const onOpen = vi.fn(),
      onDelete = vi.fn(),
      onBack = vi.fn();
    const view = await renderNative(
      <GroupsScreen
        controller={controller}
        agents={agents}
        onOpen={onOpen}
        onDelete={onDelete}
        onBack={onBack}
      />,
    );
    await press(findByLabel(view.root, "Reading room"));
    expect(onOpen).toHaveBeenCalledWith(group);
    await press(findByLabel(view.root, "Delete group"));
    expect(onDelete).toHaveBeenCalledWith(group);
    await press(findByLabel(view.root, "Back to Agents"));
    expect(onBack).toHaveBeenCalledOnce();
    await view.unmount();
    controller.dispose();
  });
  it.each([
    {
      locale: "en",
      newLabel: "New group",
      name: "Group name",
      create: "Create group",
      count: "2 selected",
    },
    { locale: "zh", newLabel: "新建群组", name: "群组名称", create: "创建群组", count: "已选 2" },
  ])(
    "creates with accessible participation choices in $locale",
    async ({ locale, newLabel, name, create, count }) => {
      useLocales.mockReturnValue([{ languageTag: locale, languageCode: locale }]);
      const { controller, port } = fixture();
      await controller.load();
      const view = await renderNative(
        <GroupsScreen
          controller={controller}
          agents={agents}
          onOpen={vi.fn()}
          onDelete={vi.fn()}
          onBack={vi.fn()}
        />,
      );
      await press(findByLabel(view.root, newLabel));
      await changeText(findByLabel(view.root, name), "New room");
      expect(findByLabel(view.root, create).props.isDisabled).toBe(true);
      await press(findByLabel(view.root, "Reader"));
      await press(findByLabel(view.root, "Writer"));
      expect(findByLabel(view.root, "Reader").props.accessibilityState.checked).toBe(true);
      expect(textContent(view.root)).toContain(count);
      await press(findByLabel(view.root, create));
      expect(port.createGroup).toHaveBeenCalledWith({
        spaceId,
        name: "New room",
        agentIds: agents.slice(0, 2).map((agent) => agent.id),
      });
      await view.unmount();
      controller.dispose();
    },
  );
  it("retains editing fields when saving fails and makes retry available", async () => {
    const { controller, port } = fixture();
    controller.edit();
    port.createGroup.mockRejectedValue(new Error("offline"));
    const view = await renderNative(
      <GroupsScreen
        controller={controller}
        agents={agents}
        onOpen={vi.fn()}
        onDelete={vi.fn()}
        onBack={vi.fn()}
      />,
    );
    await changeText(findByLabel(view.root, "Group name"), "Kept");
    await press(findByLabel(view.root, "Reader"));
    await press(findByLabel(view.root, "Writer"));
    await press(findByLabel(view.root, "Create group"));
    expect(textContent(view.root)).toContain("Could not save");
    expect(findByLabel(view.root, "Group name").props.value).toBe("Kept");
    expect(findByLabel(view.root, "Create group").props.isDisabled).toBe(false);
    await view.unmount();
    controller.dispose();
  });
  it("filters native mention suggestions and selects only after a tap", async () => {
    const onSelect = vi.fn(),
      onClose = vi.fn();
    const view = await renderNative(
      <MentionSuggestions agents={agents} query="read" onSelect={onSelect} onClose={onClose} />,
    );
    expect(onSelect).not.toHaveBeenCalled();
    expect(textContent(view.root)).not.toContain("Writer");
    await press(findByLabel(view.root, "Reader"));
    expect(onSelect).toHaveBeenCalledWith(agents[0]);
    await view.update(
      <MentionSuggestions agents={agents} query="missing" onSelect={onSelect} onClose={onClose} />,
    );
    expect(textContent(view.root)).toContain("No matching Agents");
    await press(findByLabel(view.root, "Close"));
    expect(onClose).toHaveBeenCalledOnce();
    await view.unmount();
  });
  it("refreshes the directory after an offline load fails", async () => {
    const { controller, port } = fixture();
    port.listGroups.mockRejectedValueOnce(new Error("offline"));
    await controller.load();
    const view = await renderNative(
      <GroupsScreen
        controller={controller}
        agents={agents}
        onOpen={vi.fn()}
        onDelete={vi.fn()}
        onBack={vi.fn()}
      />,
    );
    expect(textContent(view.root)).toContain("Could not load Spaces or Agents");
    await act(async () => controller.load());
    expect(textContent(view.root)).toContain("Reading room");
    await view.unmount();
    controller.dispose();
  });
});
