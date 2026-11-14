import type { Effect } from "@raypx/core/approvals";
import type { ApprovalPort, ConversationSelection } from "@raypx/agents/model";
import type { RunId } from "@raypx/core/conversation";

export interface MobileEffectsView {
  open: boolean;
  loading: boolean;
  error: boolean;
  records: readonly Effect[];
}

/** Inspection is lazy and read-only; closing fences private responses. */
export class MobileEffectsController {
  private view: MobileEffectsView = { open: false, loading: false, error: false, records: [] };
  private listeners = new Set<() => void>();
  private revision = 0;
  constructor(
    private port: ApprovalPort,
    private selection: ConversationSelection,
    private runId: RunId,
  ) {}
  getSnapshot = () => this.view;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private update(patch: Partial<MobileEffectsView>) {
    this.view = { ...this.view, ...patch };
    for (const listener of this.listeners) listener();
  }
  async open() {
    this.update({ open: true });
    await this.refresh();
  }
  async refresh() {
    if (!this.view.open || this.view.loading) return;
    const revision = ++this.revision;
    this.update({ loading: true, error: false, records: [] });
    try {
      const records = await this.port.effects({
        spaceId: this.selection.spaceId,
        runId: this.runId,
      });
      if (revision === this.revision) this.update({ records, loading: false });
    } catch {
      if (revision === this.revision) this.update({ error: true, loading: false });
    }
  }
  close() {
    ++this.revision;
    this.update({ open: false, loading: false, records: [], error: false });
  }
  dispose() {
    ++this.revision;
    this.listeners.clear();
  }
}
