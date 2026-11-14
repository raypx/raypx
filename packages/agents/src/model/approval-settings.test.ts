import { expect, it, vi } from "vitest";
import { mcpToolNameSchema, type ApprovalSettings } from "@raypx/core/approvals";
import { ApprovalSettingsController, type ApprovalSettingsPort } from "./approval-settings.js";

const availableModes = [
  { mode: "ask", available: true, reasonCode: null },
  { mode: "never", available: true, reasonCode: null },
  { mode: "auto", available: false, reasonCode: "REVIEW_MODEL_NOT_CONFIGURED" },
] satisfies import("@raypx/core/approvals").ApprovalSettingsState["availableModes"];

const initial: ApprovalSettings = { mode: "ask", rules: [] };
const allowed = { toolName: "computer_write_file", executable: null, decision: "allow" } as const;

it("retains exact dynamic rules while removing only the selected entry", async () => {
  const { controller, settings, updateSettings } = fixture();
  const allow = {
    toolName: mcpToolNameSchema.parse("mcp_server__read_page"),
    executable: null,
    decision: "allow" as const,
  };
  const block = { ...allow, decision: "block" as const };
  settings.mockResolvedValue({ mode: "ask", rules: [allow, block], revision: 1, availableModes });
  await controller.load();
  controller.removeRule(allow);
  expect(controller.getSnapshot().draft?.rules).toEqual([block]);
  await expect(controller.save(async () => true)).resolves.toBe(true);
  expect(updateSettings).toHaveBeenCalledWith({ mode: "ask", rules: [block], expectedRevision: 1 });
});

function fixture() {
  const settings = vi.fn<ApprovalSettingsPort["settings"]>(async () => ({
    ...initial,
    revision: 0,
    availableModes,
  }));
  const updateSettings = vi.fn<ApprovalSettingsPort["updateSettings"]>(
    async ({ expectedRevision, ...saved }) => ({
      ...saved,
      revision: expectedRevision + 1,
      availableModes,
    }),
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
  settings.mockResolvedValue({ mode: "never", rules: [], revision: 1, availableModes });
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
  settings.mockResolvedValue({ mode: "ask", rules: [allowed], revision: 1, availableModes });
  await expect(controller.save(async () => true)).resolves.toBe(true);
  expect(updateSettings).toHaveBeenCalledOnce();
});

it("uses conflict data, keeps the draft, and reapplies only against the displayed revision", async () => {
  const { controller, settings, updateSettings } = fixture();
  await controller.load();
  controller.addRule(allowed);
  const current = {
    mode: "ask",
    rules: [{ ...allowed, decision: "block" }],
    revision: 3,
    availableModes,
  } as const;
  updateSettings.mockRejectedValueOnce({
    code: "CONFLICT",
    data: { code: "APPROVAL_SETTINGS_CONFLICT", settings: current },
  });
  await controller.save(async () => true);
  expect(settings).toHaveBeenCalledTimes(2);
  expect(controller.getSnapshot()).toMatchObject({
    draft: { rules: [allowed] },
    conflict: { previous: { revision: 0 }, current: { revision: 3, rules: current.rules } },
  });
  settings.mockResolvedValue({ ...current, rules: [...current.rules] });
  await expect(controller.reapply(async () => true)).resolves.toBe(true);
  expect(updateSettings).toHaveBeenLastCalledWith({
    mode: "ask",
    rules: [allowed],
    expectedRevision: 3,
  });
  expect(controller.getSnapshot()).toMatchObject({ conflict: null, dirty: false, saved: true });
});

it("surfaces another conflict during reapply and discards to the latest displayed settings", async () => {
  const { controller, settings } = fixture();
  await controller.load();
  controller.addRule(allowed);
  settings.mockResolvedValue({ mode: "never", rules: [], revision: 1, availableModes });
  await controller.save(async () => true);
  settings.mockResolvedValue({ mode: "ask", rules: [], revision: 2, availableModes });
  await expect(controller.reapply(async () => true)).resolves.toBe(false);
  expect(controller.getSnapshot().conflict?.current.revision).toBe(2);
  controller.discardConflict();
  expect(controller.getSnapshot()).toMatchObject({ draft: initial, dirty: false, conflict: null });
});

it("takes mode availability from the server", async () => {
  const { controller, settings } = fixture();
  settings.mockResolvedValue({
    ...initial,
    revision: 0,
    availableModes: [
      { mode: "ask", available: true, reasonCode: null },
      { mode: "never", available: false, reasonCode: "REVIEW_MODEL_NOT_CONFIGURED" },
      { mode: "auto", available: false, reasonCode: "REVIEW_MODEL_NOT_CONFIGURED" },
    ],
  });
  await controller.load();
  controller.setMode("never");
  expect(controller.getSnapshot().draft?.mode).toBe("ask");
});

it("ignores a read completed after account teardown", async () => {
  const { controller, settings } = fixture();
  let finish!: (value: import("@raypx/core/approvals").ApprovalSettingsState) => void;
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
  finish({ ...initial, revision: 0, availableModes });
  await read;
  expect(listener).toHaveBeenCalledTimes(before);
  expect(controller.getSnapshot().draft).toBeNull();
});

it("can reapply a draft restored to the original baseline after a conflict", async () => {
  const { controller, settings, updateSettings } = fixture();
  await controller.load();
  controller.addRule(allowed);
  settings.mockResolvedValue({ mode: "never", rules: [], revision: 1, availableModes });
  await controller.save(async () => true);
  controller.removeRule(allowed);
  expect(controller.getSnapshot().dirty).toBe(false);
  await expect(controller.reapply(async () => true)).resolves.toBe(true);
  expect(updateSettings).toHaveBeenLastCalledWith({ mode: "ask", rules: [], expectedRevision: 1 });
});

it("creates MCP rules only from tested exact tools", async () => {
  const { controller } = fixture();
  await controller.load();
  const name = mcpToolNameSchema.parse("mcp_server__read_page");
  const tools = [{ name, serverName: "Research", remoteName: "read_page" }];
  expect(controller.addDiscoveredRule("mcp_server__guessed", "allow", tools)).toBe(false);
  expect(controller.addDiscoveredRule(name, "allow", tools)).toBe(true);
  expect(controller.getSnapshot().draft?.rules).toContainEqual({
    toolName: name,
    executable: null,
    decision: "allow",
  });
});

it("selects Auto only when the server reports a resolvable review model", async () => {
  const h = fixture();
  await h.controller.load();
  h.controller.setMode("auto");
  expect(h.controller.getSnapshot().draft?.mode).toBe("ask");
  const modes = availableModes.map((entry) => ({
    ...entry,
    available: true as const,
    reasonCode: null,
  }));
  h.settings.mockResolvedValue({ ...initial, revision: 0, availableModes: modes });
  h.updateSettings.mockImplementation(async ({ expectedRevision, ...saved }) => ({
    ...saved,
    revision: expectedRevision + 1,
    availableModes: modes,
  }));
  await h.controller.load();
  h.controller.setMode("auto");
  expect(h.controller.getSnapshot().draft?.mode).toBe("auto");
  await expect(
    h.controller.save(async () => {
      throw new Error("Auto needs no Never confirmation");
    }),
  ).resolves.toBe(true);
  expect(h.updateSettings).toHaveBeenCalledWith({ mode: "auto", rules: [], expectedRevision: 0 });
});
