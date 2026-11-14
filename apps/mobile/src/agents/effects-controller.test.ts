import { expect, it, vi } from "vitest";
import { effectSchema } from "@raypx/core/approvals";
import { conversationIdSchema } from "@raypx/core/agents";
import { runIdSchema } from "@raypx/core/conversation";
import { spaceIdSchema } from "@raypx/core/spaces";
import { MobileEffectsController } from "./effects-controller.js";
const selection = {
  spaceId: spaceIdSchema.parse("space"),
  conversationId: conversationIdSchema.parse("conversation"),
};
const effect = effectSchema.parse({
  ...selection,
  runId: "run",
  toolCallId: "call",
  toolName: "computer_write_file",
  key: "a".repeat(64),
  argumentHash: "b".repeat(64),
  result: "PRIVATE OUTPUT",
  state: "unknown",
  createdAt: "2026-11-14T00:00:00.000Z",
  completedAt: null,
});

it("reads only on demand, rejects duplicates and fences a closed inspection", async () => {
  let finish!: (records: (typeof effect)[]) => void;
  const effects = vi.fn(
    () =>
      new Promise<(typeof effect)[]>((resolve) => {
        finish = resolve;
      }),
  );
  const controller = new MobileEffectsController(
    { pending: vi.fn(), answer: vi.fn(), effects },
    selection,
    runIdSchema.parse("run"),
  );
  expect(effects).not.toHaveBeenCalled();
  const pending = controller.open();
  await controller.refresh();
  expect(effects).toHaveBeenCalledExactlyOnceWith({ spaceId: "space", runId: "run" });
  controller.close();
  finish([effect]);
  await pending;
  expect(controller.getSnapshot()).toEqual({
    open: false,
    loading: false,
    error: false,
    records: [],
  });
  controller.dispose();
});
it("retains an explicit retry after read failure without exposing provider diagnostics", async () => {
  const effects = vi.fn().mockRejectedValueOnce(new Error("PRIVATE")).mockResolvedValue([effect]);
  const controller = new MobileEffectsController(
    { pending: vi.fn(), answer: vi.fn(), effects },
    selection,
    runIdSchema.parse("run"),
  );
  await controller.open();
  expect(controller.getSnapshot()).toMatchObject({ open: true, error: true, loading: false });
  expect(JSON.stringify(controller.getSnapshot())).not.toContain("PRIVATE");
  await controller.refresh();
  expect(controller.getSnapshot()).toMatchObject({ error: false, records: [effect] });
  controller.dispose();
});
