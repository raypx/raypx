import type { DiscoveredMcpTool } from "./mcp-servers.js";
import {
  approvalRuleSchema,
  approvalSettingsStateSchema,
  type ApprovalMode,
  type ApprovalRule,
  type ApprovalSettings,
  type ApprovalSettingsState,
} from "@raypx/core/approvals";

export interface ApprovalSettingsPort {
  settings(this: void, input: Record<string, never>): Promise<ApprovalSettingsState>;
  updateSettings(
    this: void,
    input: ApprovalSettings & { expectedRevision: number },
  ): Promise<ApprovalSettingsState>;
}

export interface ApprovalSettingsView {
  draft: ApprovalSettings | null;
  busy: boolean;
  dirty: boolean;
  saved: boolean;
  availableModes: ApprovalSettingsState["availableModes"];
  conflict: { previous: ApprovalSettingsState; current: ApprovalSettingsState } | null;
  error: "load" | "save" | "conflict" | "ruleLimit" | "invalidRule" | null;
}

function copy(settings: ApprovalSettings): ApprovalSettings {
  return { mode: settings.mode, rules: settings.rules.map((rule) => ({ ...rule })) };
}

function fingerprint(settings: ApprovalSettings) {
  return JSON.stringify({
    mode: settings.mode,
    rules: settings.rules
      .map((rule) => JSON.stringify([rule.toolName, rule.executable, rule.decision]))
      .sort(),
  });
}

function copyState(settings: ApprovalSettingsState): ApprovalSettingsState {
  return {
    ...copy(settings),
    revision: settings.revision,
    availableModes: settings.availableModes.map((mode) => ({ ...mode })),
  };
}

function conflictSettings(error: unknown): ApprovalSettingsState | null {
  if (!error || typeof error !== "object" || !("data" in error)) return null;
  const data = error.data;
  if (!data || typeof data !== "object" || !("settings" in data)) return null;
  const parsed = approvalSettingsStateSchema.safeParse(data.settings);
  return parsed.success ? parsed.data : null;
}

/** Account-local edit buffer. Reads never silently replace unsaved changes. */
export class ApprovalSettingsController {
  private view: ApprovalSettingsView = {
    draft: null,
    busy: false,
    dirty: false,
    saved: false,
    availableModes: [],
    conflict: null,
    error: null,
  };
  private baseline: ApprovalSettingsState | null = null;
  private readonly listeners = new Set<() => void>();
  private disposed = false;

  constructor(private readonly port: ApprovalSettingsPort) {}

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  getSnapshot = () => this.view;
  private update(patch: Partial<ApprovalSettingsView>) {
    if (this.disposed) return;
    this.view = { ...this.view, ...patch };
    for (const listener of this.listeners) listener();
  }
  private edit(draft: ApprovalSettings) {
    this.update({
      draft,
      dirty: !this.baseline || fingerprint(draft) !== fingerprint(this.baseline),
      saved: false,
      error: this.view.conflict ? "conflict" : null,
    });
  }
  async load(): Promise<void> {
    if (this.disposed || this.view.busy) return;
    this.update({ busy: true, saved: false, error: null });
    try {
      const result = await this.port.settings({});
      if (this.disposed) return;
      this.baseline = copyState(result);
      this.update({
        draft: copy(result),
        availableModes: result.availableModes,
        dirty: false,
        conflict: null,
      });
    } catch {
      this.update({ error: "load" });
    } finally {
      this.update({ busy: false });
    }
  }
  setMode(mode: ApprovalMode) {
    if (this.disposed || this.view.busy || !this.view.draft) return;
    if (!this.view.availableModes.some((entry) => entry.mode === mode && entry.available)) return;
    this.edit({ ...this.view.draft, mode });
  }
  addRule(rule: ApprovalRule): boolean {
    if (this.disposed || this.view.busy || !this.view.draft) return false;
    if (!approvalRuleSchema.safeParse(rule).success) {
      this.update({ error: "invalidRule" });
      return false;
    }
    const rules = this.view.draft.rules;
    if (
      rules.some(
        (entry) =>
          entry.toolName === rule.toolName &&
          entry.executable === rule.executable &&
          entry.decision === rule.decision,
      )
    )
      return true;
    if (rules.length >= 256) {
      this.update({ error: "ruleLimit" });
      return false;
    }
    this.edit({ ...this.view.draft, rules: [...rules, { ...rule }] });
    return true;
  }
  addDiscoveredRule(
    name: string,
    decision: ApprovalRule["decision"],
    tools: readonly DiscoveredMcpTool[],
  ): boolean {
    const tool = tools.find((entry) => entry.name === name);
    if (!tool) {
      this.update({ error: "invalidRule" });
      return false;
    }
    return this.addRule({ toolName: tool.name, executable: null, decision });
  }
  removeRule(rule: ApprovalRule) {
    if (this.disposed || this.view.busy || !this.view.draft) return;
    this.edit({
      ...this.view.draft,
      rules: this.view.draft.rules.filter(
        (entry) =>
          entry.toolName !== rule.toolName ||
          entry.executable !== rule.executable ||
          entry.decision !== rule.decision,
      ),
    });
  }
  async save(confirmNever: () => Promise<boolean>): Promise<boolean> {
    const draft = this.view.draft;
    const baseline = this.baseline;
    if (
      this.disposed ||
      this.view.busy ||
      this.view.conflict ||
      !this.view.dirty ||
      !draft ||
      !baseline
    )
      return false;
    this.update({ busy: true, saved: false, error: null });
    try {
      if (draft.mode === "never" && baseline.mode !== "never" && !(await confirmNever()))
        return false;
      if (this.disposed) return false;
      const fresh = await this.port.settings({});
      if (this.disposed) return false;
      // A lost response may already have saved this exact replacement.
      if (fingerprint(fresh) === fingerprint(draft)) {
        this.baseline = copyState(fresh);
        this.update({ dirty: false, saved: true, availableModes: fresh.availableModes });
        return true;
      }
      if (fresh.revision !== baseline.revision) {
        this.setConflict(baseline, fresh);
        return false;
      }
      // The server rejects a stale revision, which closes the race this preflight cannot.
      const result = await this.port.updateSettings({
        ...copy(draft),
        expectedRevision: fresh.revision,
      });
      if (this.disposed) return false;
      this.baseline = copyState(result);
      this.update({
        draft: copy(result),
        dirty: false,
        saved: true,
        availableModes: result.availableModes,
      });
      return true;
    } catch (error) {
      let kind: ApprovalSettingsView["error"] = "save";
      if (error && typeof error === "object") {
        if ("message" in error && error.message === "RULE_LIMIT") kind = "ruleLimit";
        else if ("code" in error && error.code === "CONFLICT") {
          kind = "conflict";
          const current =
            conflictSettings(error) ?? (await this.port.settings({}).catch(() => null));
          if (current) this.setConflict(baseline, current);
        }
      }
      this.update({ error: kind });
      return false;
    } finally {
      this.update({ busy: false });
    }
  }
  private setConflict(previous: ApprovalSettingsState, current: ApprovalSettingsState) {
    this.update({
      error: "conflict",
      availableModes: current.availableModes,
      conflict: { previous: copyState(previous), current: copyState(current) },
    });
  }
  async reapply(confirmNever: () => Promise<boolean>): Promise<boolean> {
    const conflict = this.view.conflict;
    if (this.disposed || this.view.busy || !conflict) return false;
    this.baseline = copyState(conflict.current);
    this.update({
      conflict: null,
      error: null,
      dirty: !!this.view.draft && fingerprint(this.view.draft) !== fingerprint(conflict.current),
    });
    return this.save(confirmNever);
  }
  discardConflict() {
    const conflict = this.view.conflict;
    if (this.disposed || this.view.busy || !conflict) return;
    this.baseline = copyState(conflict.current);
    this.update({
      draft: copy(conflict.current),
      availableModes: conflict.current.availableModes,
      dirty: false,
      saved: false,
      error: null,
      conflict: null,
    });
  }
  dispose() {
    this.disposed = true;
    this.listeners.clear();
  }
}
