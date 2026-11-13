import {
  approvalRuleSchema,
  type ApprovalMode,
  type ApprovalRule,
  type ApprovalSettings,
} from "@raypx/core/approvals";

export interface ApprovalSettingsPort {
  settings(this: void, input: Record<string, never>): Promise<ApprovalSettings>;
  updateSettings(this: void, input: ApprovalSettings): Promise<ApprovalSettings>;
}

export interface ApprovalSettingsView {
  draft: ApprovalSettings | null;
  busy: boolean;
  dirty: boolean;
  saved: boolean;
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

/** Account-local edit buffer. Reads never silently replace unsaved changes. */
export class ApprovalSettingsController {
  private view: ApprovalSettingsView = {
    draft: null,
    busy: false,
    dirty: false,
    saved: false,
    error: null,
  };
  private baseline: ApprovalSettings | null = null;
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
      error: null,
    });
  }
  async load(): Promise<void> {
    if (this.disposed || this.view.busy) return;
    this.update({ busy: true, saved: false, error: null });
    try {
      const result = await this.port.settings({});
      if (this.disposed) return;
      this.baseline = copy(result);
      this.update({ draft: copy(result), dirty: false });
    } catch {
      this.update({ error: "load" });
    } finally {
      this.update({ busy: false });
    }
  }
  setMode(mode: ApprovalMode) {
    if (this.disposed || this.view.busy || !this.view.draft) return;
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
    if (this.disposed || this.view.busy || !this.view.dirty || !draft || !baseline) return false;
    this.update({ busy: true, saved: false, error: null });
    try {
      if (draft.mode === "never" && baseline.mode !== "never" && !(await confirmNever()))
        return false;
      if (this.disposed) return false;
      const fresh = await this.port.settings({});
      if (this.disposed) return false;
      // A lost response may already have saved this exact replacement.
      if (fingerprint(fresh) === fingerprint(draft)) {
        this.baseline = copy(fresh);
        this.update({ dirty: false, saved: true });
        return true;
      }
      if (fingerprint(fresh) !== fingerprint(baseline)) {
        this.update({ error: "conflict" });
        return false;
      }
      // The contract has no expected revision; this preflight cannot close the read/write race.
      const result = await this.port.updateSettings(copy(draft));
      if (this.disposed) return false;
      this.baseline = copy(result);
      this.update({ draft: copy(result), dirty: false, saved: true });
      return true;
    } catch (error) {
      let kind: ApprovalSettingsView["error"] = "save";
      if (error && typeof error === "object") {
        if ("message" in error && error.message === "RULE_LIMIT") kind = "ruleLimit";
        else if ("code" in error && error.code === "CONFLICT") kind = "conflict";
      }
      this.update({ error: kind });
      return false;
    } finally {
      this.update({ busy: false });
    }
  }
  dispose() {
    this.disposed = true;
    this.listeners.clear();
  }
}
