import {
  applyAgents,
  applySpaces,
  ComputerController,
  ConversationController,
  createAgentsPageState,
  selectSpace,
  type AgentConversationView,
  type AgentsPageState,
  type AgentsWorkspacePort,
  type ConversationDraftStore,
  type ConversationOwner,
  type ConversationSocketPort,
} from "@raypx/agents/model";
import { messageKey } from "./ports.js";

export interface MobileWorkspaceView {
  page: AgentsPageState;
  loading: boolean;
  refreshing: boolean;
  error: boolean;
}

/** Composition/lifecycle only. The shared model owns selection and conversation semantics. */
export class MobileWorkspace {
  private view: MobileWorkspaceView = {
    page: createAgentsPageState(),
    loading: true,
    refreshing: false,
    error: false,
  };
  private listeners = new Set<() => void>();
  private revision = 0;
  private disposed = false;
  private active = false;
  private focused = false;
  private selected:
    | { id: string; conversation: ConversationController; computer: ComputerController }
    | undefined;

  constructor(
    readonly owner: ConversationOwner,
    readonly port: AgentsWorkspacePort,
    private socket: ConversationSocketPort,
    private drafts: ConversationDraftStore,
    private preference: { read(): string | null; write(id: string): void },
  ) {}
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  getSnapshot = () => this.view;
  private update(patch: Partial<MobileWorkspaceView>) {
    if (this.disposed) return;
    this.view = { ...this.view, ...patch };
    for (const listener of this.listeners) listener();
  }
  private clearConversation() {
    this.selected?.conversation.dispose();
    this.selected?.computer.dispose();
    this.selected = undefined;
  }
  async refresh(preferredSpaceId?: string) {
    if (this.disposed) return;
    const revision = ++this.revision;
    this.update({ refreshing: true, error: false });
    try {
      const spaces = await this.port.spaces.list({});
      if (this.disposed || revision !== this.revision) return;
      let preferred = preferredSpaceId;
      if (!preferred && !this.view.page.spaceId) {
        try {
          preferred = this.preference.read() ?? undefined;
        } catch {
          // A preference is only a selector. Membership always comes from the server.
        }
      }
      const page = applySpaces(this.view.page, spaces, preferred);
      if (page.spaceId !== this.view.page.spaceId) this.clearConversation();
      this.update({ page });
      if (!page.spaceId) {
        this.update({ loading: false, refreshing: false });
        return;
      }
      const spaceId = page.spaceId;
      const [agents, models] = await Promise.all([
        this.port.agents.list({ spaceId, limit: 100 }),
        this.port.agents.models({ spaceId }),
      ]);
      if (this.disposed || revision !== this.revision) return;
      if (this.selected && !agents.some((item) => item.agent.id === this.selected?.id))
        this.clearConversation();
      this.update({
        page: { ...applyAgents(this.view.page, spaceId, agents), models },
        loading: false,
        refreshing: false,
      });
      try {
        this.preference.write(spaceId);
      } catch {
        // Failure to remember selection must not change remote state or the draft.
      }
    } catch {
      if (this.disposed || revision !== this.revision) return;
      this.update({ loading: false, refreshing: false, error: true });
    }
  }
  selectSpace(id: string) {
    const page = selectSpace(this.view.page, id);
    if (page === this.view.page) return;
    ++this.revision;
    this.clearConversation();
    this.update({ page, loading: true });
    void this.refresh(id);
  }
  conversation(item: AgentConversationView) {
    if (item.agent.spaceId !== this.view.page.spaceId) throw new Error("Wrong Space");
    if (this.selected?.id === item.agent.id) return this.selected;
    this.clearConversation();
    const computer = new ComputerController(item.agent.spaceId, this.port.computers);
    const conversation = new ConversationController({
      selection: { spaceId: item.agent.spaceId, conversationId: item.conversation.id },
      owner: this.owner,
      port: this.port.conversations,
      socket: this.socket,
      drafts: this.drafts,
      key: messageKey,
      computer,
      ...(this.port.approvals ? { approvals: this.port.approvals } : {}),
    });
    this.selected = { id: item.agent.id, conversation, computer };
    if (!this.active || !this.focused) conversation.suspend();
    void conversation.start();
    if (this.active && this.focused) void computer.refresh();
    return this.selected;
  }
  setActive(active: boolean) {
    if (this.disposed || this.active === active) return;
    this.active = active;
    if (!active) this.selected?.conversation.suspend();
    else {
      if (this.focused) this.selected?.conversation.resume();
      void this.refresh();
    }
  }
  /** Leaving the conversation closes its stream but retains the acknowledged projection. */
  leaveConversation() {
    this.focused = false;
    this.selected?.conversation.suspend();
  }
  enterConversation() {
    this.focused = true;
    if (this.active) this.selected?.conversation.resume();
  }
  dispose() {
    this.disposed = true;
    ++this.revision;
    this.clearConversation();
    this.listeners.clear();
  }
}
