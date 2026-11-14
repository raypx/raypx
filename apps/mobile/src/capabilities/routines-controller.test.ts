import { describe, expect, it, vi } from "vitest";
import { agentId, routine, routinePort, spaceId } from "../../tests/capabilities.js";
import { MobileRoutinesController } from "./routines-controller.js";

describe("native routines controller", () => {
  it("loads a bounded Agent list and validates cron before saving", async () => {
    const port = routinePort();
    const controller = new MobileRoutinesController(
      spaceId,
      agentId,
      port,
      () => "delivery",
      "UTC",
    );
    await controller.refresh();
    expect(port.list).toHaveBeenCalledWith({ spaceId, agentId, limit: 100 });
    controller.edit(null);
    controller.change({ name: "New", prompt: "Read", cron: "bad" });
    await controller.save();
    expect(port.create).not.toHaveBeenCalled();
    expect(controller.getSnapshot().error).toBe("invalidInput");
    controller.change({ cron: "0 8 * * *", timezone: "Asia/Shanghai" });
    await controller.save();
    expect(port.create).toHaveBeenCalledWith({
      spaceId,
      routine: {
        name: "New",
        prompt: "Read",
        agentId,
        enabled: true,
        triggers: { schedule: { cron: "0 8 * * *", timezone: "Asia/Shanghai" } },
      },
    });
    controller.dispose();
  });
  it("guards duplicate run-now taps and clears one-time secrets on close", async () => {
    const port = routinePort();
    let resolve!: () => void;
    port.test.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = () => done({ status: "fired", runId: "run", conversationId: "conversation" });
        }),
    );
    const controller = new MobileRoutinesController(
      spaceId,
      agentId,
      port,
      () => "delivery",
      "UTC",
    );
    const first = controller.run(routine);
    await controller.run(routine);
    expect(port.test).toHaveBeenCalledOnce();
    resolve();
    await first;
    expect(port.test).toHaveBeenCalledWith({ spaceId, id: routine.id, idempotencyKey: "delivery" });
    port.create.mockResolvedValueOnce({ routine, webhookKey: "test-key", repositorySecret: null });
    controller.edit(null);
    controller.change({ name: "New", prompt: "Read" });
    await controller.save();
    expect(controller.getSnapshot().secrets.webhookKey).toBe("test-key");
    controller.close();
    expect(controller.getSnapshot().secrets.webhookKey).toBeNull();
  });
  it("ignores list results after disposal and retains edits after a failed save", async () => {
    const port = routinePort();
    const controller = new MobileRoutinesController(
      spaceId,
      agentId,
      port,
      () => "delivery",
      "UTC",
    );
    controller.edit(routine);
    controller.change({ name: "Edited" });
    port.update.mockRejectedValueOnce(new Error("OFFLINE"));
    await controller.save();
    expect(controller.getSnapshot().editor?.form.name).toBe("Edited");
    const listener = vi.fn();
    controller.subscribe(listener);
    const request = controller.refresh();
    controller.dispose();
    listener.mockClear();
    await request;
    expect(listener).not.toHaveBeenCalled();
  });
});
