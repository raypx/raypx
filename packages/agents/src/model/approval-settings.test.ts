import { expect, it, vi } from "vitest";
import type { ApprovalSettings } from "@raypx/core/approvals";
import { ApprovalSettingsController, type ApprovalSettingsPort } from "./approval-settings.js";

const initial: ApprovalSettings = { mode: "ask", rules: [] };
const allowed = { toolName: "computer_write_file", executable: null, decision: "allow" } as const;

function fixture() {
  const settings = vi.fn<ApprovalSettingsPort["settings"]>(async () => ({
    ...initial,
    revision: 0,
  }));
  const updateSettings = vi.fn<ApprovalSettingsPort["updateSettings"]>(
    async ({ expectedRevision, ...saved }) => ({ ...saved, revision: expectedRevision + 1 }),
  );
  const controller = new ApprovalSettingsController({ settings, updateSettings });
  return { controller, settings, updateSettings };
}

it("edits exact Allow and Block entries and replaces mode and rules together", async () => {
  const { controller, updateSettings } = fixture();
  await controller.load();
  controller.addRule(allowed);
  controller.addRule({ ...allowed, decision: "block" });
  controller.addRule(allowed);
  expect(controller.getSnapshot().draft?.rules).toHaveLength(2);
  controller.removeRule(allowed);
  expect(controller.getSnapshot().draft?.rules).toEqual([{ ...allowed, decision: "block" }]);
  await expect(controller.save(async () => true)).resolves.toBe(true);
  expect(updateSettings).toHaveBeenCalledWith({
    mode: "ask",
    rules: [{ ...allowed, decision: "block" }],
    expectedRevision: 0,
  });
  expect(controller.getSnapshot()).toMatchObject({ dirty: false, saved: true });
});

it("requires an exact executable for a command rule", async () => {
  const { controller } = fixture();
  await controller.load();
  expect(
    controller.addRule({ toolName: "computer_run_command", executable: null, decision: "allow" }),
  ).toBe(false);
  expect(controller.getSnapshot().error).toBe("invalidRule");
  controller.addRule({ toolName: "computer_run_command", executable: "git", decision: "allow" });
  expect(controller.getSnapshot().draft?.rules).toEqual([
    { toolName: "computer_run_command", executable: "git", decision: "allow" },
  ]);
});

it("confirms Never ask, guards a second save, and keeps edits when confirmation is cancelled", async () => {
  const { controller, updateSettings } = fixture();
  await controller.load();
  controller.setMode("never");
  let resolve!: (accepted: boolean) => void;
  const confirmation = new Promise<boolean>((done) => {
    resolve = done;
  });
  const saving = controller.save(() => confirmation);
  await expect(controller.save(async () => true)).resolves.toBe(false);
  controller.setMode("ask");
  expect(controller.getSnapshot().draft?.mode).toBe("never");
  resolve(false);
  await expect(saving).resolves.toBe(false);
  expect(updateSettings).not.toHaveBeenCalled();
  expect(controller.getSnapshot()).toMatchObject({
    busy: false,
    dirty: true,
    draft: { mode: "never" },
  });
});

it("detects changed settings before replacement without losing local rules", async () => {
  const { controller, settings, updateSettings } = fixture();
  await controller.load();
  controller.addRule(allowed);
  settings.mockResolvedValue({ mode: "never", rules: [], revision: 1 });
  await expect(controller.save(async () => true)).resolves.toBe(false);
  expect(controller.getSnapshot()).toMatchObject({
    error: "conflict",
    dirty: true,
    draft: { mode: "ask", rules: [allowed] },
  });
  expect(updateSettings).not.toHaveBeenCalled();
  await controller.load();
  expect(controller.getSnapshot()).toMatchObject({
    dirty: false,
    error: null,
    draft: { mode: "never", rules: [] },
  });
});

it("preserves inputs for RULE_LIMIT and concurrent-edit errors", async () => {
  for (const [error, expected] of [
    [{ message: "RULE_LIMIT", code: "CONFLICT" }, "ruleLimit"],
    [{ code: "CONFLICT" }, "conflict"],
  ] as const) {
    const { controller, updateSettings } = fixture();
    await controller.load();
    controller.addRule(allowed);
    updateSettings.mockRejectedValueOnce(error);
    await controller.save(async () => true);
    expect(controller.getSnapshot()).toMatchObject({
      error: expected,
      busy: false,
      dirty: true,
      draft: { rules: [allowed] },
    });
  }
});

it("recognizes a saved replacement after an uncertain response without writing again", async () => {
  const { controller, settings, updateSettings } = fixture();
  await controller.load();
  controller.addRule(allowed);
  updateSettings.mockRejectedValueOnce(new Error("response lost"));
  await controller.save(async () => true);
  expect(controller.getSnapshot().error).toBe("save");
  settings.mockResolvedValue({ mode: "ask", rules: [allowed], revision: 1 });
  await expect(controller.save(async () => true)).resolves.toBe(true);
  expect(updateSettings).toHaveBeenCalledOnce();
});

it("ignores a read completed after account teardown", async () => {
  const { controller, settings } = fixture();
  let finish!: (value: ApprovalSettings & { revision: number }) => void;
  settings.mockReturnValueOnce(
    new Promise((done) => {
      finish = done;
    }),
  );
  const listener = vi.fn();
  controller.subscribe(listener);
  const read = controller.load();
  controller.dispose();
  const before = listener.mock.calls.length;
  finish({ ...initial, revision: 0 });
  await read;
  expect(listener).toHaveBeenCalledTimes(before);
  expect(controller.getSnapshot().draft).toBeNull();
});
