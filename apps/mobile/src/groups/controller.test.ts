import { describe, expect, it, vi } from "vitest";
import { agentIdSchema, conversationSchema, type Conversation } from "@raypx/core/agents";
import { spaceIdSchema } from "@raypx/core/spaces";
import type { GroupsPort } from "@raypx/agents/model";
import { MobileGroupsController } from "./controller.js";

const spaceId = spaceIdSchema.parse("space-one");
const a = agentIdSchema.parse("agent-a");
const b = agentIdSchema.parse("agent-b");
const c = agentIdSchema.parse("agent-c");
const d = agentIdSchema.parse("agent-d");
function fixture() {
  let group = conversationSchema.parse({
    id: "group-one",
    spaceId,
    agentId: a,
    kind: "group",
    name: "Team",
    agentIds: [a, b],
    createdAt: "2026-11-14T00:00:00.000Z",
  });
  const port = {
    listGroups: vi.fn(async () => [group]),
    getGroup: vi.fn(async () => group),
    createGroup: vi.fn(async (input) => ({ ...group, ...input })),
    renameGroup: vi.fn(async (input) => {
      group = { ...group, name: input.name };
      return group;
    }),
    addGroupAgent: vi.fn(async (input) => {
      group = { ...group, agentIds: [...(group.agentIds ?? []), input.agentId] };
      return group;
    }),
    removeGroupAgent: vi.fn(async (input) => {
      group = { ...group, agentIds: group.agentIds?.filter((id) => id !== input.agentId) };
      return group;
    }),
    deleteGroup: vi.fn(async () => ({ deleted: true as const })),
  } satisfies GroupsPort;
  return { port, group, controller: new MobileGroupsController(spaceId, port) };
}

describe("Mobile group controller", () => {
  it("loads only its selected Space and creates a validated group after explicit save", async () => {
    const { port, controller } = fixture();
    await controller.load();
    expect(port.listGroups).toHaveBeenCalledWith({ spaceId, limit: 100 });
    controller.edit();
    controller.setName("  Reading  ");
    controller.toggle(a);
    expect(await controller.save()).toBe(false);
    expect(port.createGroup).not.toHaveBeenCalled();
    controller.toggle(b);
    expect(await controller.save()).toBe(true);
    expect(port.createGroup).toHaveBeenCalledWith({ spaceId, name: "Reading", agentIds: [a, b] });
    expect(controller.getSnapshot().editing).toBe(null);
  });
  it("renames and replaces Agents while retaining at least two participants", async () => {
    const { port, controller, group } = fixture();
    await controller.load();
    controller.edit(group);
    controller.setName("Changed");
    controller.toggle(a);
    controller.toggle(c);
    expect(await controller.save()).toBe(true);
    expect(port.addGroupAgent.mock.invocationCallOrder[0]).toBeLessThan(
      port.removeGroupAgent.mock.invocationCallOrder[0]!,
    );
    expect(controller.getSnapshot().groups[0]?.agentIds).toEqual([b, c]);
    expect(controller.getSnapshot().groups[0]?.name).toBe("Changed");
  });
  it("replaces a full group's Agents without exceeding the 32 member limit", async () => {
    const { port, controller, group } = fixture();
    const original = Array.from({ length: 32 }, (_, index) => agentIdSchema.parse(`old-${index}`));
    const updated = [...original.slice(2), c, d];
    let current: Conversation = { ...group, agentIds: original };
    port.getGroup.mockImplementation(async () => current);
    port.addGroupAgent.mockImplementation(async ({ agentId }) => {
      expect(current.agentIds!.length).toBeLessThan(32);
      current = { ...current, agentIds: [...current.agentIds!, agentId] };
      return current;
    });
    port.removeGroupAgent.mockImplementation(async ({ agentId }) => {
      expect(current.agentIds!.length).toBeGreaterThan(2);
      current = { ...current, agentIds: current.agentIds!.filter((id) => id !== agentId) };
      return current;
    });
    controller.edit(current);
    for (const id of original.slice(0, 2)) controller.toggle(id);
    controller.toggle(c);
    controller.toggle(d);
    expect(await controller.save()).toBe(true);
    expect(current.agentIds).toEqual(updated);
  });
  it("preserves failed edits and guards duplicate saves", async () => {
    const { port, controller } = fixture();
    let fail: (reason: Error) => void = () => {};
    port.createGroup.mockImplementation(
      () =>
        new Promise((_resolve, reject) => {
          fail = reject;
        }),
    );
    controller.edit();
    controller.setName("Kept");
    controller.toggle(a);
    controller.toggle(b);
    const pending = controller.save();
    expect(await controller.save()).toBe(false);
    expect(port.createGroup).toHaveBeenCalledOnce();
    fail(new Error("offline"));
    expect(await pending).toBe(false);
    expect(controller.getSnapshot()).toMatchObject({
      name: "Kept",
      selected: [a, b],
      editing: "new",
      error: true,
      busy: false,
    });
  });
  it("deletes groups only on request and fences late loads after disposal", async () => {
    const { port, controller, group } = fixture();
    await controller.load();
    await controller.remove(group.id);
    expect(port.deleteGroup).toHaveBeenCalledWith({ spaceId, conversationId: group.id });
    expect(controller.getSnapshot().groups).toEqual([]);
    let finish: (value: Conversation[]) => void = () => {};
    port.listGroups.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const reading = controller.load();
    const before = controller.getSnapshot();
    controller.dispose();
    finish([group]);
    await reading;
    expect(controller.getSnapshot()).toBe(before);
  });
  it("fences a directory read started before deletion so it cannot resurrect a deleted group", async () => {
    const { port, controller, group } = fixture();
    await controller.load();
    let finish: (value: Conversation[]) => void = () => {};
    port.listGroups.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const reading = controller.load();
    await controller.remove(group.id);
    finish([group]);
    await reading;
    expect(controller.getSnapshot()).toMatchObject({ groups: [], loading: false, busy: false });
  });
  it("stops an edit mutation chain after its route is disposed", async () => {
    const { port, controller, group } = fixture();
    let finish: (value: Conversation) => void = () => {};
    port.getGroup.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    controller.edit(group);
    controller.toggle(a);
    controller.toggle(c);
    const saving = controller.save();
    controller.dispose();
    finish(group);
    expect(await saving).toBe(false);
    expect(port.addGroupAgent).not.toHaveBeenCalled();
    expect(port.removeGroupAgent).not.toHaveBeenCalled();
    expect(port.renameGroup).not.toHaveBeenCalled();
  });
});
