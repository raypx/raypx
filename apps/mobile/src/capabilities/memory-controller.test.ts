import { describe, expect, it } from "vitest";
import { agentId, memory, memoryPort, spaceId } from "../../tests/capabilities.js";
import { MobileMemoryController } from "./memory-controller.js";

describe("native memory controller", () => {
  it("creates shared Markdown with no Agent selector and explicit save", async () => {
    const port = memoryPort();
    const controller = new MobileMemoryController(spaceId, agentId, port);
    await controller.refresh();
    expect(port.list).toHaveBeenCalledWith({
      spaceId,
      agentId,
      scope: "agent",
      includeRemoved: true,
      limit: 100,
    });
    expect(port.list).toHaveBeenCalledWith({
      spaceId,
      scope: "space",
      includeRemoved: true,
      limit: 100,
    });
    await controller.edit(null);
    controller.change({ scope: "space", agentId: null, title: "Shared", text: "# Source" });
    expect(port.create).not.toHaveBeenCalled();
    await controller.save();
    expect(port.create).toHaveBeenCalledWith({
      spaceId,
      document: {
        scope: "space",
        agentId: null,
        title: "Shared",
        text: "# Source",
        pinned: false,
        attribution: { speaker: null, source: null },
      },
    });
  });
  it("keeps drafts on conflict, reloads revision without overwriting text and restores with CAS", async () => {
    const port = memoryPort();
    const controller = new MobileMemoryController(spaceId, agentId, port);
    await controller.edit(memory);
    controller.change({ text: "Unsaved" });
    port.update.mockRejectedValueOnce({ code: "MEMORY_CONFLICT" });
    await controller.save();
    expect(controller.getSnapshot().editor?.conflict).toBe(true);
    await controller.reload();
    expect(controller.getSnapshot().editor?.draft.text).toBe("Unsaved");
    expect(controller.getSnapshot().editor?.current?.revision).toBe(2);
    await controller.restore({ ...memory, reason: "created" });
    expect(port.restore).toHaveBeenCalledWith({
      spaceId,
      id: memory.id,
      expectedRevision: 2,
      revision: 1,
    });
    expect(controller.getSnapshot().editor?.current?.revision).toBe(3);
  });
  it("removes with current revision and fences late history after closing the editor", async () => {
    const port = memoryPort();
    const controller = new MobileMemoryController(spaceId, agentId, port);
    await controller.edit(memory);
    await controller.remove();
    expect(port.remove).toHaveBeenCalledWith({ spaceId, id: memory.id, expectedRevision: 1 });
    expect(controller.getSnapshot().editor?.current?.removed).toBe(true);
    const opening = controller.edit(memory);
    controller.close();
    await opening;
    expect(controller.getSnapshot().editor).toBeNull();
    expect(controller.getSnapshot().revisions).toEqual([]);
  });
});
