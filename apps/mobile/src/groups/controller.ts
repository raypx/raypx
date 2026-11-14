import {
  groupConversationInputSchema,
  type AgentId,
  type Conversation,
  type ConversationId,
} from "@raypx/core/agents";
import type { SpaceId } from "@raypx/core/spaces";
import type { GroupsPort } from "@raypx/agents/model";

export interface MobileGroupsView {
  groups: Conversation[];
  loading: boolean;
  busy: boolean;
  error: boolean;
  editing: ConversationId | "new" | null;
  name: string;
  selected: AgentId[];
}

/** Native composition over the shared group port; the server owns participation rules. */
export class MobileGroupsController {
  private view: MobileGroupsView = {
    groups: [],
    loading: false,
    busy: false,
    error: false,
    editing: null,
    name: "",
    selected: [],
  };
  private listeners = new Set<() => void>();
  private revision = 0;
  private disposed = false;
  constructor(
    readonly spaceId: SpaceId,
    private port: GroupsPort,
  ) {}
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  getSnapshot = () => this.view;
  private update(patch: Partial<MobileGroupsView>) {
    if (this.disposed) return;
    this.view = { ...this.view, ...patch };
    for (const listener of this.listeners) listener();
  }
  async load() {
    if (this.disposed || this.view.busy) return;
    const revision = ++this.revision;
    this.update({ loading: true, error: false });
    try {
      const groups = await this.port.listGroups({ spaceId: this.spaceId, limit: 100 });
      if (this.disposed || revision !== this.revision) return;
      this.update({ groups });
    } catch {
      if (revision === this.revision) this.update({ error: true });
    } finally {
      if (revision === this.revision) this.update({ loading: false });
    }
  }
  edit(conversation?: Conversation) {
    if (this.view.busy) return;
    this.update({
      editing: conversation?.id ?? "new",
      name: conversation?.name ?? "",
      selected: [...(conversation?.agentIds ?? [])],
      error: false,
    });
  }
  cancel() {
    if (!this.view.busy) this.update({ editing: null, name: "", selected: [], error: false });
  }
  setName(name: string) {
    if (!this.view.busy) this.update({ name });
  }
  toggle(agentId: AgentId) {
    if (this.view.busy) return;
    const selected = this.view.selected.includes(agentId)
      ? this.view.selected.filter((id) => id !== agentId)
      : [...this.view.selected, agentId];
    this.update({ selected });
  }
  async save() {
    if (this.disposed || this.view.busy || !this.view.editing) return false;
    const parsed = groupConversationInputSchema.safeParse({
      name: this.view.name,
      agentIds: this.view.selected,
    });
    if (!parsed.success) return false;
    const revision = ++this.revision;
    const editing = this.view.editing;
    this.update({ busy: true, loading: false, error: false });
    try {
      let group: Conversation;
      if (editing === "new") {
        group = await this.port.createGroup({ spaceId: this.spaceId, ...parsed.data });
      } else {
        const selection = { spaceId: this.spaceId, conversationId: editing };
        group = await this.port.getGroup(selection);
        const additions = parsed.data.agentIds.filter((id) => !group.agentIds?.includes(id));
        const removals = (group.agentIds ?? []).filter((id) => !parsed.data.agentIds.includes(id));
        if (this.disposed || revision !== this.revision) return false;
        // Keep every intermediate server mutation within the two-to-32 member bound.
        while (removals.length || additions.length) {
          if (this.disposed || revision !== this.revision) return false;
          if (removals.length && (group.agentIds?.length ?? 0) > 2) {
            const agentId = removals.shift();
            if (agentId) group = await this.port.removeGroupAgent({ ...selection, agentId });
          } else {
            const agentId = additions.shift();
            if (!agentId) throw new Error("Invalid group participation");
            group = await this.port.addGroupAgent({ ...selection, agentId });
          }
        }
        if (this.disposed || revision !== this.revision) return false;
        group = await this.port.renameGroup({ ...selection, name: parsed.data.name });
      }
      if (this.disposed || revision !== this.revision) return false;
      this.update({
        groups: [...this.view.groups.filter((entry) => entry.id !== group.id), group],
        editing: null,
        name: "",
        selected: [],
      });
      return true;
    } catch {
      if (revision === this.revision) this.update({ error: true });
      return false;
    } finally {
      if (revision === this.revision) this.update({ busy: false });
    }
  }
  async remove(conversationId: ConversationId) {
    if (this.disposed || this.view.busy) return false;
    const revision = ++this.revision;
    this.update({ busy: true, loading: false, error: false });
    try {
      await this.port.deleteGroup({ spaceId: this.spaceId, conversationId });
      if (this.disposed || revision !== this.revision) return false;
      this.update({ groups: this.view.groups.filter((entry) => entry.id !== conversationId) });
      return !this.disposed;
    } catch {
      this.update({ error: true });
      return false;
    } finally {
      this.update({ busy: false });
    }
  }
  dispose() {
    this.disposed = true;
    ++this.revision;
    this.listeners.clear();
  }
}
