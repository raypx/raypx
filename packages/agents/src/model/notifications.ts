import type { MemberNotification, NotificationKey } from "@raypx/core/notifications";
import type { ConversationSelection } from "./port.js";
export interface MemberNotificationsPort {
  list(input: Record<string, never>): Promise<{ items: MemberNotification[]; truncated: boolean }>;
  read(input: NotificationKey): Promise<{ ok: true }>;
  viewed(input: ConversationSelection): Promise<{ ok: true }>;
}
export class NotificationsController {
  private view: {
    items: MemberNotification[];
    truncated: boolean;
    loading: boolean;
    error: boolean;
  } = { items: [], truncated: false, loading: false, error: false };
  private listeners = new Set<() => void>();
  private revision = 0;
  constructor(private readonly port: MemberNotificationsPort) {}
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  getSnapshot = () => this.view;
  private update(patch: Partial<typeof this.view>) {
    this.view = { ...this.view, ...patch };
    for (const listener of this.listeners) listener();
  }
  async refresh() {
    const revision = ++this.revision;
    this.update({ loading: true });
    try {
      const result = await this.port.list({});
      if (revision === this.revision) this.update({ ...result, loading: false, error: false });
    } catch {
      if (revision === this.revision) this.update({ items: [], loading: false, error: true });
    }
  }
  async read(item: MemberNotification) {
    try {
      await this.port.read({ spaceId: item.spaceId, kind: item.kind, sourceId: item.sourceId });
      await this.refresh();
      return true;
    } catch {
      this.update({ error: true });
      return false;
    }
  }
  dispose() {
    ++this.revision;
    this.listeners.clear();
  }
}
