import {
  applyAgents,
  applyGroups,
  applySpaces,
  ComputerController,
  DeviceComputersController,
  ConversationController,
  SpaceLiveController,
  createAgentsPageState,
  selectSpace,
  type AgentConversationView,
  type GroupConversationView,
  type SpaceSubscriptionEnd,
  type AgentsPageState,
  type AgentsWorkspacePort,
  type ConversationDraftStore,
  type ConversationOwner,
  type ConversationSocketPort,
} from "@raypx/agents/model";
import type { ApiClient } from "@raypx/client/api";
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
  private live: { spaceId: string; controller: SpaceLiveController } | undefined;
  private selected:
    | {
        id: string;
        conversation: ConversationController;
        computer: ComputerController;
        devices: DeviceComputersController | undefined;
      }
    | undefined;

  constructor(
    readonly owner: ConversationOwner,
    readonly port: AgentsWorkspacePort,
    private socket: ConversationSocketPort,
    private drafts: ConversationDraftStore,
    private preference: { read(): string | null; write(id: string): void },
    readonly api?: ApiClient,
    private onSpaceExit?: (reason: SpaceSubscriptionEnd) => void,
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
  private applyActivity() {
    const at = this.selected?.conversation.getSnapshot().lastActivityAt;
    if (!at) return;
    const id = this.selected?.id;
    const existing = this.view.page.agents.find((entry) => entry.agent.id === id);
    const group = this.view.page.groups?.find((entry) => `group:${entry.conversation.id}` === id);
    if (existing?.agent.lastActivityAt === at || group?.conversation.lastActivityAt === at) return;
    if (!existing && !group) return;
    this.update({
      page: {
        ...this.view.page,
        agents: this.view.page.agents.map((entry) =>
          entry === existing
            ? {
                ...entry,
                agent: { ...entry.agent, lastActivityAt: at },
                conversation: { ...entry.conversation, lastActivityAt: at },
              }
            : entry,
        ),
        ...(group
          ? {
              groups:
                this.view.page.groups?.map((entry) =>
                  entry === group
                    ? {
                        ...entry,
                        conversation: { ...entry.conversation, lastActivityAt: at },
                      }
                    : entry,
                ) ?? [],
            }
          : {}),
      },
    });
  }
  private clearConversation() {
    this.applyActivity();
    this.selected?.conversation.dispose();
    this.selected?.computer.dispose();
    this.selected?.devices?.dispose();
    this.selected = undefined;
  }
  private syncLive() {
    const spaceId = this.view.page.spaceId;
    if (!this.active || !spaceId || !this.api) {
      this.live?.controller.dispose();
      this.live = undefined;
      return;
    }
    if (this.live?.spaceId === spaceId) return;
    this.live?.controller.dispose();
    const controller = new SpaceLiveController({
      spaceId,
      accountId: this.owner.accountId,
      socket: this.socket,
      list: () => this.port.spaces.list({}),
      onMemberships: (spaces) => {
        if (this.disposed) return;
        const page = applySpaces(this.view.page, spaces);
        if (page.spaceId !== this.view.page.spaceId) this.clearConversation();
        this.update({ page });
      },
      onEvent: async () => {
        await this.refresh();
      },
      onExit: (reason) => {
        this.clearConversation();
        this.update({ page: { ...this.view.page, agents: [], groups: [] } });
        this.onSpaceExit?.(reason);
        void this.refresh();
      },
    });
    this.live = { spaceId, controller };
    controller.start();
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
      this.syncLive();
      if (!page.spaceId) {
        this.update({ loading: false, refreshing: false });
        return;
      }
      const spaceId = page.spaceId;
      const [agents, models, groups] = await Promise.all([
        this.port.agents.list({ spaceId, limit: 100 }),
        this.port.agents.models({ spaceId }),
        this.port.groups?.listGroups({ spaceId, limit: 100 }) ?? [],
      ]);
      if (this.disposed || revision !== this.revision) return;
      if (
        this.selected &&
        !agents.some((item) => item.agent.id === this.selected?.id) &&
        !groups.some((group) => `group:${group.id}` === this.selected?.id)
      )
        this.clearConversation();
      this.update({
        page: {
          ...applyGroups(
            applyAgents(this.view.page, spaceId, agents),
            spaceId,
            groups.map((conversation) => ({
              conversation,
              agents: agents.map((item) => item.agent),
            })),
          ),
          models,
        },
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
    return this.openConversation(item.agent.id, item.conversation);
  }
  groupConversation(item: GroupConversationView) {
    return this.openConversation(`group:${item.conversation.id}`, item.conversation);
  }
  private openConversation(id: string, item: AgentConversationView["conversation"]) {
    if (item.spaceId !== this.view.page.spaceId) throw new Error("Wrong Space");
    if (this.selected?.id === id) return this.selected;
    this.clearConversation();
    const computer = new ComputerController(item.spaceId, this.port.computers);
    const conversation = new ConversationController({
      selection: { spaceId: item.spaceId, conversationId: item.id },
      owner: this.owner,
      port: this.port.conversations,
      socket: this.socket,
      drafts: this.drafts,
      key: messageKey,
      computer,
      ...(this.port.approvals ? { approvals: this.port.approvals } : {}),
    });
    const devices = this.port.deviceComputers
      ? new DeviceComputersController(item.spaceId, this.port.deviceComputers, item.id)
      : undefined;
    this.selected = { id, conversation, computer, devices };
    if (!this.active || !this.focused) conversation.suspend();
    void conversation.start();
    if (this.active && this.focused) {
      void computer.refresh();
      void devices?.refresh();
    }
    return this.selected;
  }
  setActive(active: boolean) {
    if (this.disposed || this.active === active) return;
    this.active = active;
    this.syncLive();
    if (!active) this.selected?.conversation.suspend();
    else {
      if (this.focused) {
        this.selected?.conversation.resume();
        void this.selected?.devices?.refresh();
      }
      void this.refresh();
    }
  }
  /** Leaving the conversation closes its stream but retains the acknowledged projection. */
  leaveConversation() {
    this.focused = false;
    this.applyActivity();
    this.selected?.conversation.suspend();
  }
  enterConversation() {
    this.focused = true;
    if (this.active) {
      this.selected?.conversation.resume();
      void this.selected?.devices?.refresh();
    }
  }
  dispose() {
    this.disposed = true;
    ++this.revision;
    this.live?.controller.dispose();
    this.clearConversation();
    this.listeners.clear();
  }
}
