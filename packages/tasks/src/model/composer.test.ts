import { describe, expect, it } from "vite-plus/test";
import type { AgentTask } from "@raypx/core/tasks";
import type { SyncDevice } from "@raypx/contracts/tasks";
import {
  composerContextTarget,
  composerDraft,
  composerExpanded,
  composerReducer,
  composerView,
  holdsSubmission,
  initialComposerState,
  recoveredSubmission,
  restoreComposerDraft,
  saveComposerDraft,
  withoutSentDraft,
  type ComposerAction,
  type ComposerState,
} from "./composer.js";
import { prepareTaskSubmission } from "./composition.js";
import { MAX_TASK_DRAFTS, type TaskDraft } from "./drafts.js";

const model = { provider: "test", model: "a", connectionId: "a".repeat(64) };
const selection = { sources: [{ id: "33333333-3333-4333-8333-333333333333", revision: 3 }] };
const device: SyncDevice = {
  id: "device",
  name: "Computer",
  platform: "darwin",
  appVersion: "1",
  epoch: 1,
  revoked: false,
  online: true,
  lastSeenAt: null,
  projects: [
    { id: "project", name: "Project", providers: ["claude", "codex"], dirty: false },
    { id: "codex-only", name: "Codex only", providers: ["codex"], dirty: false },
  ],
  capabilities: [
    {
      provider: "claude",
      version: "1",
      reason: "ready",
      available: true,
      inputModes: ["queue"],
      definition: {
        version: 1,
        runtime: "process",
        modes: ["plan", "run"],
        approvals: true,
        modelSelection: false,
      },
    },
    {
      provider: "codex",
      version: "1",
      reason: "ready",
      available: true,
      inputModes: ["queue"],
      definition: {
        version: 1,
        runtime: "sdk",
        modes: ["run"],
        approvals: true,
        modelSelection: true,
      },
    },
  ],
};
const draft: TaskDraft = {
  id: "draft",
  deviceId: "device",
  projectId: "project",
  provider: "claude",
  prompt: "Review the change",
  mode: "plan",
  contextSelection: selection,
  updatedAt: "2026-11-03T00:00:00.000Z",
};
const initial = (overrides: Partial<Parameters<typeof initialComposerState>[0]> = {}) =>
  initialComposerState({ devices: [device], local: true, guest: false, ...overrides });
const reduce = (state: ComposerState, ...actions: ComposerAction[]) =>
  actions.reduce(composerReducer, state);
const view = (state: ComposerState, context: Partial<Parameters<typeof composerView>[1]> = {}) =>
  composerView(state, { devices: [device], tasks: [], drafts: [], guest: false, ...context });

describe("initial composer state", () => {
  it("defaults to the local computer and the first provider its project accepts", () => {
    expect(initial({ devices: [{ ...device, projects: [device.projects[1]!] }] })).toMatchObject({
      deviceId: "device",
      projectId: "codex-only",
    });
    expect(initial({ fixedDeviceId: "device", fixedProjectId: "codex-only" })).toMatchObject({
      projectId: "codex-only",
      provider: "codex",
    });
    expect(initial()).toMatchObject({ deviceId: "device", projectId: "", provider: "claude" });
    expect(initial({ local: false })).toMatchObject({ deviceId: "", provider: "claude" });
    expect(
      initial({ initialDraft: { prompt: "Saved", provider: "codex", mode: "run" } }),
    ).toMatchObject({ prompt: "Saved", provider: "codex", mode: "run", open: true, busy: false });
  });

  it("keeps a controlled target and discards references restored for another target", () => {
    expect(initial({ initialDraft: draft }).contextSelection).toEqual(selection);
    expect(initial({ initialDraft: draft, guest: true }).contextSelection).toBeUndefined();
    const fixed = initial({
      initialDraft: draft,
      fixedDeviceId: "device",
      fixedProjectId: "codex-only",
    });
    expect(fixed).toMatchObject({
      deviceId: "device",
      projectId: "codex-only",
      prompt: draft.prompt,
    });
    expect(fixed.contextSelection).toBeUndefined();
    expect(
      initial({ initialDraft: draft, fixedDeviceId: "device", fixedProjectId: "project" })
        .contextSelection,
    ).toEqual(selection);
  });
});

describe("composer transitions", () => {
  it("clears selected references whenever the target changes", () => {
    const state = initial({ initialDraft: draft });
    expect(reduce(state, { type: "project", projectId: "codex-only" })).toMatchObject({
      projectId: "codex-only",
      contextSelection: undefined,
    });
    expect(reduce(state, { type: "device", deviceId: "other" })).toMatchObject({
      deviceId: "other",
      projectId: "",
      contextSelection: undefined,
    });
    expect(reduce(state, { type: "provider", provider: "codex" }).contextSelection).toEqual(
      selection,
    );
  });

  it("restores a saved draft as editor text without sending it", () => {
    const collapsed = reduce(
      initial(),
      { type: "expand", open: false },
      { type: "failed", error: "PROJECT_BUSY" },
    );
    const restored = reduce(collapsed, { type: "restore", draft: { ...draft, model }, target: {} });
    expect(restored).toMatchObject({
      open: true,
      restoreDismissed: false,
      prompt: draft.prompt,
      mode: "plan",
      model,
      contextSelection: selection,
      draftId: "draft",
      busy: false,
      error: undefined,
    });
    expect(
      restoreComposerDraft(draft, { fixedDeviceId: "device", fixedProjectId: "codex-only" }),
    ).toMatchObject({ projectId: "codex-only", contextSelection: undefined });
    expect(restoreComposerDraft(draft, { fixedProjectId: "project" }).contextSelection).toEqual(
      selection,
    );
  });

  it("tracks editing, draft status and the submission lifecycle", () => {
    let state = reduce(initial(), { type: "status", status: "draftSaveFailed" });
    state = reduce(state, { type: "prompt", prompt: "Next" });
    expect(state).toMatchObject({ prompt: "Next", draftStatus: null });
    state = reduce(state, { type: "saved", draftId: "draft" });
    expect(state).toMatchObject({ draftId: "draft", draftStatus: "draftSaved" });
    expect(reduce(state, { type: "deleted", draftId: "other" }).draftId).toBe("draft");
    expect(reduce(state, { type: "deleted", draftId: "draft" }).draftId).toBeNull();
    state = reduce(state, { type: "submit" });
    expect(state.busy).toBe(true);
    state = reduce(state, { type: "failed", error: "NETWORK_UNAVAILABLE" }, { type: "settled" });
    expect(state).toMatchObject({ busy: false, error: "NETWORK_UNAVAILABLE", prompt: "Next" });
    expect(reduce(state, { type: "submit" }).error).toBeUndefined();
    expect(reduce(state, { type: "accepted", cleaned: false })).toMatchObject({
      draftStatus: "draftCleanupFailed",
      error: undefined,
      prompt: "Next",
    });
    expect(reduce(state, { type: "reset" }, { type: "accepted", cleaned: true })).toMatchObject({
      prompt: "",
      contextSelection: undefined,
      draftId: null,
      draftStatus: null,
      error: undefined,
    });
  });

  it("keeps a restored prompt open until the editor is explicitly collapsed", () => {
    const state = reduce(initial(), { type: "expand", open: false });
    expect(composerExpanded(state, undefined, false)).toBe(false);
    expect(composerExpanded(state, false, false)).toBe(false);
    expect(composerExpanded(initial(), false, true)).toBe(true);
    expect(composerExpanded(state, false, true)).toBe(false);
    expect(composerExpanded(reduce(state, { type: "expand", open: true }), undefined, false)).toBe(
      true,
    );
  });
});

describe("composer readiness", () => {
  const ready = reduce(
    initial(),
    { type: "project", projectId: "project" },
    {
      type: "prompt",
      prompt: "Run tests",
    },
  );

  it("requires an online target, a supported mode and a ready model when the capability selects one", () => {
    expect(view(ready)).toMatchObject({ available: true, sendable: true });
    expect(view(reduce(ready, { type: "prompt", prompt: "  " })).sendable).toBe(false);
    expect(view(reduce(ready, { type: "submit" })).sendable).toBe(false);
    expect(view(ready, { devices: [{ ...device, online: false }] })).toMatchObject({
      available: false,
      sendable: false,
    });
    const codex = reduce(
      ready,
      { type: "provider", provider: "codex" },
      { type: "mode", mode: "run" },
    );
    expect(view(codex)).toMatchObject({ available: false });
    expect(view(reduce(codex, { type: "model", model })).available).toBe(false);
    expect(
      view(reduce(codex, { type: "model", model }, { type: "modelReady", ready: true })).available,
    ).toBe(true);
    expect(
      view(
        reduce(
          codex,
          { type: "model", model },
          { type: "modelReady", ready: true },
          { type: "mode", mode: "plan" },
        ),
      ).available,
    ).toBe(false);
  });

  it("keeps a model only when the selected capability chooses one", () => {
    const state = reduce(ready, { type: "model", model }, { type: "context", selection });
    expect(composerDraft(state, [device])).toEqual({
      deviceId: "device",
      projectId: "project",
      provider: "claude",
      prompt: "Run tests",
      mode: "run",
      contextSelection: selection,
    });
    expect(
      composerDraft(reduce(state, { type: "provider", provider: "codex" }), [device]).model,
    ).toEqual(model);
  });

  it("blocks a busy project unless the guest is only handing off a sign-in", () => {
    const task = { deviceId: "device", projectId: "project", status: "running" } as AgentTask;
    expect(view(ready, { tasks: [task] })).toMatchObject({ occupied: true, sendable: false });
    expect(view(ready, { tasks: [{ ...task, status: "succeeded" }] }).occupied).toBe(false);
    expect(
      view(reduce(initial({ local: false }), { type: "prompt", prompt: "Hi" }), { guest: true }),
    ).toMatchObject({
      available: false,
      sendable: true,
    });
  });

  it("waits for the budget measurement of the current input", () => {
    const budget = (key: string, status: "loading" | "ready" | "error", exceeded = false) =>
      reduce(ready, { type: "budget", budget: { key, status, exceeded } });
    expect(view(ready, { budgetKey: "current" }).budgetReady).toBe(false);
    expect(view(budget("previous", "ready"), { budgetKey: "current" }).budgetReady).toBe(false);
    expect(view(budget("current", "loading"), { budgetKey: "current" }).budgetReady).toBe(false);
    expect(view(budget("current", "error"), { budgetKey: "current" }).budgetReady).toBe(false);
    expect(view(budget("current", "ready", true), { budgetKey: "current" }).sendable).toBe(false);
    expect(view(budget("current", "ready"), { budgetKey: "current" }).sendable).toBe(true);
    expect(composerContextTarget(ready, false)).toEqual({
      deviceId: "device",
      projectId: "project",
    });
    expect(composerContextTarget(ready, true)).toBeUndefined();
    expect(composerContextTarget(initial(), false)).toBeUndefined();
  });
});

describe("composer drafts", () => {
  const editing = reduce(initial(), { type: "restore", draft, target: {} });

  it("binds edits to the stored draft and reports unsaved changes", () => {
    expect(view(editing, { drafts: [draft] })).toMatchObject({ draftId: "draft", dirty: false });
    expect(
      view(reduce(editing, { type: "prompt", prompt: "Edited" }), { drafts: [draft] }).dirty,
    ).toBe(true);
    const matching = reduce(
      editing,
      { type: "reset" },
      { type: "prompt", prompt: draft.prompt },
      {
        type: "context",
        selection,
      },
    );
    expect(view(matching, { drafts: [draft] })).toMatchObject({ draftId: "draft", dirty: false });
    expect(view(reduce(initial(), { type: "prompt", prompt: " " })).dirty).toBe(false);
  });

  it("bounds new drafts while still updating a stored one", () => {
    const full = Array.from({ length: MAX_TASK_DRAFTS }, (_, index) => ({
      ...draft,
      id: String(index),
    }));
    expect(saveComposerDraft(full, draft, "new")).toBeUndefined();
    const updated = saveComposerDraft(full, { ...draft, prompt: "Updated" }, "7")!;
    expect(updated).toHaveLength(MAX_TASK_DRAFTS);
    expect(updated[0]).toMatchObject({ id: "7", prompt: "Updated" });
    expect(saveComposerDraft([draft], draft, "new")!.map((entry) => entry.id)).toEqual([
      "new",
      "draft",
    ]);
  });

  it("removes a sent draft and clears the editor only when both still match the receipt", () => {
    const input = composerDraft(editing, [device]);
    const receipt = prepareTaskSubmission(null, input, "draft", () => "task");
    expect(withoutSentDraft([draft], receipt)).toEqual([]);
    expect(withoutSentDraft([{ ...draft, prompt: "Edited elsewhere" }], receipt)).toBeUndefined();
    expect(withoutSentDraft([], receipt)).toBeUndefined();
    expect(holdsSubmission(receipt, input)).toBe(true);
    expect(holdsSubmission(receipt, { ...input, prompt: "Edited" })).toBe(false);
    expect(holdsSubmission(null, input)).toBe(false);
    const task = { id: "task" } as AgentTask;
    expect(recoveredSubmission([task], receipt, "NETWORK_UNAVAILABLE")).toBe(task);
    expect(recoveredSubmission([task], receipt, undefined)).toBeUndefined();
    expect(recoveredSubmission([task], null, "NETWORK_UNAVAILABLE")).toBeUndefined();
  });
});
