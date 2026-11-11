import { afterEach, expect, it } from "vite-plus/test";
import { taskInputActivitySchema } from "@raypx/core/tasks";
import { relayFixture } from "../../tests/helpers/relay.js";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const close of cleanups.splice(0)) await close();
});

it.each([
  { clustered: false, mode: "queue" },
  { clustered: false, mode: "steer" },
  { clustered: true, mode: "queue" },
  { clustered: true, mode: "steer" },
] as const)(
  "returns $mode input receipts across clustered=$clustered relay",
  async ({ clustered, mode }) => {
    const f = await relayFixture(clustered);
    cleanups.push(f.close);
    const viewer = await f.viewer(),
      id = crypto.randomUUID(),
      value = taskInputActivitySchema.parse({
        id,
        taskId: f.task.id,
        kind: "input",
        order: 1,
        revision: 1,
        mode,
        text: "Continue the task",
        status: mode === "queue" ? "queued" : "sent",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    const pending = viewer.receive({
      type: "request",
      id,
      request: {
        method: "tasks.input",
        input: { id, taskId: f.task.id, mode, prompt: value.text },
      },
    });
    await expect.poll(() => f.device.frames.some((frame) => frame.type === "command")).toBe(true);
    const command = f.device.frames.find((frame) => frame.type === "command")!;
    await f.device.receive({
      type: "result",
      routeId: command.routeId,
      result: { ok: true, value },
    });
    await pending;
    expect(viewer.frames).toContainEqual({ type: "result", id, result: { ok: true, value } });
    expect(f.device.close).not.toHaveBeenCalled();
    expect(viewer.close).not.toHaveBeenCalled();
  },
);
