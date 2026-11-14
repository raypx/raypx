import { NotificationsBell } from "./notifications.js";
import { LoadingState } from "@raypx/ui/loading-state";
import { ProtectedInputs } from "./protected-input.js";
import {
  saveAgentCapabilities,
  type AgentCapabilitySelection,
} from "../model/agent-capabilities.js";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import {
  ShellToolbar,
  ShellPrimaryAction,
  ShellSidebarActions,
  ShellSidebarNavigation,
  ShellSidebarDirectory,
  ShellSidebarFooter,
  useShellSidebarCollapsed,
} from "@raypx/blocks/shell";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@raypx/ui/components/ui/collapsible";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@raypx/ui/components/ui/select";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@raypx/ui/components/ui/input-group";
import { FilterIcon } from "@raypx/icons/filter";
import { CloseIcon } from "@raypx/icons/close";
import { ChevronDownIcon } from "@raypx/icons/chevron-down";
import { ClockIcon } from "@raypx/icons/clock";
import { HistoryIcon } from "@raypx/icons/history";
import { UserCircleIcon } from "@raypx/icons/user-circle";
import { AdjustmentsIcon } from "@raypx/icons/adjustments";
import { RoutinesPanel } from "@raypx/jobs/client";
import { WorkspaceHome } from "./home.js";
import { Empty, EmptyHeader, EmptyMedia } from "@raypx/ui/components/ui/empty";
import { Alert, AlertDescription, AlertAction } from "@raypx/ui/components/ui/alert";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
} from "@raypx/ui/components/ui/dropdown-menu";
import { cn } from "@raypx/ui/lib/utils";
import { SettingsIcon } from "@raypx/icons/settings";
import { SpaceLiveController } from "../model/space-live.js";
import { SpaceManagementController, type SpaceManagementPort } from "../model/space-management.js";
import type { ApprovalSettingsPort } from "../model/approval-settings.js";
import { SpaceSettingsPanel } from "./space-settings.js";
import {
  DeviceComputersController,
  type NativeDeviceConfirmation,
} from "../model/device-computers.js";
import { CapabilitySheet } from "./capability-sheet.js";
import { PausedRoutinePanel } from "./space-routine.js";
import { MoreHorizontalIcon } from "@raypx/icons/more-horizontal";
import type { Agent, AgentInput, Conversation, GroupConversationInput } from "@raypx/core/agents";
import type { SpaceEvent } from "@raypx/core/spaces";
import type { ToolActivity } from "@raypx/core/conversation";
import { mergeToolActivity, toolActivityKey } from "../model/tool-activity.js";
import { Button } from "@raypx/ui/components/ui/button";
import { IconButton } from "@raypx/ui/icon-button";
import { useConfirmation } from "@raypx/ui/confirmation";
import { AgentIcon } from "@raypx/icons/agent";
import { DeleteIcon } from "@raypx/icons/delete";
import { EditIcon } from "@raypx/icons/edit";
import { FolderIcon } from "@raypx/icons/folder";
import { ChevronsUpDownIcon } from "@raypx/icons/chevrons-up-down";
import { PlusIcon } from "@raypx/icons/plus";
import {
  applyAgents,
  applyGroups,
  selectGroup,
  type GroupsPort,
  type GroupConversationView,
  applySpaces,
  createAgentsPageState,
  selectAgent,
  selectSpace,
  type AgentConversationView,
  type AgentsWorkspacePort,
  type ConversationDraftStore,
  type ConversationPort,
  type ComputerPort,
  type ConversationSocketPort,
  type ApprovalPort,
} from "../model.js";
import { GroupForm, GroupParticipants } from "./group-directory.js";
import { AgentForm } from "./agent-form.js";
import { SpaceForm } from "./space-form.js";
import { AgentConversation } from "./conversation.js";
import { browserConversationDrafts, browserConversationSocket } from "./browser-ports.js";
import { useTranslations } from "./i18n.js";
import type { ComputerScreenPort } from "../model/computer-screen.js";
import { compareLastActivity } from "../model/activity.js";

function screenMethods(port: ComputerPort): Partial<ComputerScreenPort> {
  const {
    screenAvailability,
    startScreen,
    stopScreen,
    acquireControl,
    renewControl,
    releaseControl,
    forceReleaseControl,
    screenInput,
  } = port;
  if (
    !screenAvailability ||
    !startScreen ||
    !stopScreen ||
    !acquireControl ||
    !renewControl ||
    !releaseControl ||
    !forceReleaseControl ||
    !screenInput
  )
    return {};
  return {
    screenAvailability: (input) => screenAvailability(input),
    startScreen: (input) => startScreen(input),
    stopScreen: (input) => stopScreen(input),
    acquireControl: (input) => acquireControl(input),
    renewControl: (input) => renewControl(input),
    releaseControl: (input) => releaseControl(input),
    forceReleaseControl: (input) => forceReleaseControl(input),
    screenInput: (input) => screenInput(input),
  };
}

export interface AgentsWorkspaceProps {
  nativeDeviceConfirmation?: NativeDeviceConfirmation | undefined;
  client: AgentsWorkspacePort;
  renderWorkspace?:
    | ((context: {
        spaceId: string;
        agents: readonly Agent[];
        accountNames: Record<string, string>;
        subscribe: (listener: (event: SpaceEvent) => void) => () => void;
      }) => ReactNode)
    | undefined;
  onSessionEnded?: (() => void) | undefined;
  onOpenPage?: ((id: string) => void) | undefined;
  composerReference?: { id: string; text: string } | undefined;
  spaceManagement?: SpaceManagementPort | undefined;
  accountApprovalSettings?: Pick<ApprovalSettingsPort, "settings"> | undefined;
  invitationOrigin?: string | undefined;
  accountId: string;
  origin: string;
  spaceId?: string;
  agentId?: string;
  groupId?: string;
  groups?: GroupsPort | undefined;
  onOpenModels?: (() => void) | undefined;
  onOpenTools?: (() => void) | undefined;
  onNewConversation?: ((spaceId: string) => void) | undefined;
  onOpenExternal?: ((url: string) => void) | undefined;
  modelCatalogKey?: string | undefined;
  onNavigate?: (selection: { spaceId: string; agentId?: string; groupId?: string }) => void;
  socket?: ConversationSocketPort;
  drafts?: ConversationDraftStore;
}

export function AgentsWorkspace(props: AgentsWorkspaceProps) {
  return (
    <AgentsWorkspaceContents key={JSON.stringify([props.origin, props.accountId])} {...props} />
  );
}

function AgentsWorkspaceContents({
  client,
  nativeDeviceConfirmation,
  onSessionEnded,
  renderWorkspace,
  onOpenPage,
  composerReference,
  spaceManagement = client.spaceManagement,
  accountApprovalSettings = client.accountApprovalSettings,
  invitationOrigin,
  accountId,
  origin,
  spaceId,
  agentId,
  groupId,
  groups = client.groups,
  onNavigate,
  onOpenModels,
  onOpenTools,
  onNewConversation,
  onOpenExternal,
  modelCatalogKey,
  socket,
  drafts,
}: AgentsWorkspaceProps) {
  const t = useTranslations("agents");
  const sidebarCollapsed = useShellSidebarCollapsed();
  const agentFilterId = useId();
  const filterTrigger = useRef<HTMLButtonElement>(null);
  const firstAgentTrigger = useRef<HTMLButtonElement>(null);
  const filterInput = useRef<HTMLInputElement>(null);
  const [agentsSectionOpen, setAgentsSectionOpen] = useState(true);
  const [agentFilterState, setAgentFilterState] = useState<{
    spaceId: string | null;
    text: string;
    open: boolean;
  }>({ spaceId: null, text: "", open: false });
  const [pageListeners] = useState(() => new Set<(event: SpaceEvent) => void>());
  const subscribePages = useCallback(
    (listener: (event: SpaceEvent) => void) => {
      pageListeners.add(listener);
      return () => {
        pageListeners.delete(listener);
      };
    },
    [pageListeners],
  );
  const [page, setPage] = useState(createAgentsPageState);
  const agentsByActivity = useMemo(
    () => [...page.agents].sort((left, right) => compareLastActivity(left.agent, right.agent)),
    [page.agents],
  );
  const groupsByActivity = useMemo(
    () =>
      [...(page.groups ?? [])].sort((left, right) =>
        compareLastActivity(left.conversation, right.conversation),
      ),
    [page.groups],
  );
  const agentFilter = agentFilterState.spaceId === page.spaceId ? agentFilterState.text : "";
  const filterOpen = agentFilterState.spaceId === page.spaceId && agentFilterState.open;
  const filteredAgents = useMemo(() => {
    if (sidebarCollapsed || !filterOpen) return agentsByActivity;
    const query = agentFilter.trim().toLocaleLowerCase();
    return agentsByActivity.filter((entry) => entry.agent.name.toLocaleLowerCase().includes(query));
  }, [agentFilter, filterOpen, sidebarCollapsed, agentsByActivity]);
  useLayoutEffect(() => {
    if (filterOpen && !sidebarCollapsed) filterInput.current?.focus();
  }, [filterOpen, sidebarCollapsed]);
  function setAgentFilter(text: string, open = true) {
    setAgentFilterState({ spaceId: page.spaceId, text, open });
  }
  const current = useRef(page);
  const mounted = useRef(true);
  const navigationRevision = useRef(0);
  const lastSpaceExit = useRef<{ spaceId: string; revision: number } | null>(null);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useLayoutEffect(() => {
    current.current = page;
  }, [page]);
  const [spacesLoading, setSpacesLoading] = useState(true);
  const [agentsLoading, setAgentsLoading] = useState(false);
  const loading = spacesLoading || agentsLoading;
  const [failed, setFailed] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [activity, setActivity] = useState<Record<string, readonly ToolActivity[]>>({});
  const rememberActivity = useCallback(
    (selectedSpaceId: string, calls: readonly ToolActivity[]) => {
      setActivity((previous) => ({
        ...previous,
        [selectedSpaceId]: mergeToolActivity(previous[selectedSpaceId] ?? [], calls),
      }));
    },
    [],
  );
  const [spaceSettingsOpen, setSpaceSettingsOpen] = useState(false);
  const [routineTarget, setRoutineTarget] = useState<string | null>(null);
  const [routinesOpen, setRoutinesOpen] = useState(false);
  const [routinesAgentId, setRoutinesAgentId] = useState<string | null>(null);
  const [runReference, setRunReference] = useState<{
    conversationId: string;
    id: string;
    runId: string;
  } | null>(null);
  const routinesTrigger = useRef<HTMLButtonElement>(null);
  const routinesReasonId = useId();
  const lastAgentKey = JSON.stringify(["raypx_last_agent", origin, accountId, page.spaceId]);
  const targetPreference = useMemo(() => lastAgentPreference(lastAgentKey), [lastAgentKey]);
  const homeTargetId = useSyncExternalStore(
    targetPreference.subscribe,
    targetPreference.snapshot,
    () => null,
  );
  const rememberTarget = targetPreference.set;
  const [spaceNotice, setSpaceNotice] = useState<
    "removed" | "unavailable" | "deleting" | "left" | "session-ended" | null
  >(null);
  const spaceTrigger = useRef<HTMLButtonElement>(null);
  const [newSpace, setNewSpace] = useState(false);
  const [form, setForm] = useState<"new" | AgentConversationView | null>(null);
  const agentFormRevision = useRef(0);
  const [newGroup, setNewGroup] = useState(false);
  const groupFormRevision = useRef(0);
  const newGroupTrigger = useRef<HTMLButtonElement>(null);
  const [participantsOpen, setParticipantsOpen] = useState(false);
  const [participantsLoading, setParticipantsLoading] = useState(false);
  const participantsTrigger = useRef<HTMLElement | null>(null);
  const participantsRequest = useRef(0);
  const [deleting, setDeleting] = useState<string | null>(null);
  const deletingRef = useRef<string | null>(null);
  const confirmation = useConfirmation();
  const eventSocket = useMemo(() => socket ?? browserConversationSocket(origin), [socket, origin]);
  const draftStore = useMemo(() => drafts ?? browserConversationDrafts(), [drafts]);
  const conversationPort = useMemo<ConversationPort>(
    () => ({
      ...(client.conversations.history
        ? {
            history: (input: Parameters<NonNullable<ConversationPort["history"]>>[0]) =>
              client.conversations.history!(input),
          }
        : {}),
      snapshot: (input) => client.conversations.snapshot(input),
      send: (input) => client.conversations.send(input),
      stop: (input) => client.conversations.stop(input),
    }),
    [client],
  );
  const computerPort = useMemo<ComputerPort>(
    () => ({
      ...screenMethods(client.computers),
      get: (input) => client.computers.get(input),
      start: (input) => client.computers.start(input),
      stop: (input) => client.computers.stop(input),
      ...(client.computers.listDirectory && client.computers.readFile
        ? {
            listDirectory: (input: Parameters<NonNullable<ComputerPort["listDirectory"]>>[0]) =>
              client.computers.listDirectory!(input),
            readFile: (input: Parameters<NonNullable<ComputerPort["readFile"]>>[0]) =>
              client.computers.readFile!(input),
          }
        : {}),
    }),
    [client],
  );
  const approvalPort = useMemo<ApprovalPort | undefined>(() => {
    const approvals = client.approvals;
    if (!approvals) return undefined;
    return {
      ...(approvals.effectiveMode
        ? {
            effectiveMode: (input: Parameters<NonNullable<ApprovalPort["effectiveMode"]>>[0]) =>
              approvals.effectiveMode!(input),
          }
        : {}),
      pending: (input) => approvals.pending(input),
      answer: (input) => approvals.answer(input),
      effects: (input) => approvals.effects(input),
    };
  }, [client]);
  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) {
        setSpacesLoading(true);
        setFailed(false);
      }
    });
    void client.spaces
      .list({})
      .then((spaces) => {
        if (!cancelled) setPage((state) => applySpaces(state, spaces, spaceId));
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      })
      .finally(() => {
        if (!cancelled) setSpacesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [client, spaceId, accountId, origin, refresh]);
  useEffect(() => {
    const selected = page.spaceId;
    if (!selected) return;
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) {
        setAgentsLoading(true);
        setFailed(false);
      }
    });
    void Promise.all([
      client.agents.list({ spaceId: selected, limit: 100 }),
      client.agents.models({ spaceId: selected }),
      groups?.listGroups({ spaceId: selected, limit: 100 }) ?? Promise.resolve([]),
    ])
      .then(([agents, models, conversations]) => {
        if (!cancelled)
          setPage((state) => {
            if (state.spaceId !== selected) return state;
            const next = applyAgents(state, selected, agents, agentId);
            return {
              ...applyGroups(
                next,
                selected,
                conversations.map((conversation) => ({
                  conversation,
                  agents: agents
                    .filter((item) => conversation.agentIds?.includes(item.agent.id))
                    .map((item) => item.agent),
                })),
                groupId,
              ),
              models,
            };
          });
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      })
      .finally(() => {
        if (!cancelled) setAgentsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [client, groups, page.spaceId, agentId, groupId, refresh, modelCatalogKey]);

  const confirmSpaceExit = useCallback(
    (reason: "deleting" | "left") => {
      if (!mounted.current) return;
      const exited = lastSpaceExit.current;
      const stillCurrent = current.current.spaceId === page.spaceId;
      const stillShowingExit =
        exited?.spaceId === page.spaceId && exited.revision === navigationRevision.current;
      if (stillCurrent || stillShowingExit) setSpaceNotice(reason);
    },
    [page.spaceId],
  );
  const membership = page.spaces.find(({ space }) => space.id === page.spaceId);
  const devices = useMemo(
    () =>
      page.spaceId && client.deviceComputers
        ? new DeviceComputersController(
            page.spaceId,
            client.deviceComputers,
            undefined,
            nativeDeviceConfirmation,
          )
        : null,
    [page.spaceId, client.deviceComputers, nativeDeviceConfirmation],
  );
  useEffect(() => () => devices?.dispose(), [devices]);
  const management = useMemo(() => {
    if (!page.spaceId || !spaceManagement || typeof spaceManagement.members !== "function")
      return null;
    return new SpaceManagementController({
      spaceId: page.spaceId,
      accountId,
      port: spaceManagement,
      ...(client.approvals ? { effectiveApprovals: client.approvals } : {}),
      ...(accountApprovalSettings ? { accountApprovals: accountApprovalSettings } : {}),
    });
  }, [page.spaceId, accountId, spaceManagement, accountApprovalSettings, client.approvals]);
  const managementState = useSyncExternalStore(
    management?.subscribe ?? subscribeNothing,
    management?.getSnapshot ?? emptyManagement,
    management?.getSnapshot ?? emptyManagement,
  );
  useEffect(() => {
    if (!management) return;
    management.setExitConfirmationHandler(confirmSpaceExit);
    return () => management.dispose();
  }, [management, confirmSpaceExit]);
  useEffect(() => {
    if (management) void management.load(membership?.member.role === "owner");
  }, [management, membership?.member.role, modelCatalogKey]);
  const exitSpace = useCallback(
    (
      reason: "removed" | "unavailable" | "deleting" | "left" | "session-ended",
      selectedSpace: string,
    ) => {
      if (!mounted.current || current.current.spaceId !== selectedSpace) return;
      const revision = ++navigationRevision.current;
      lastSpaceExit.current = { spaceId: selectedSpace, revision };
      setSpaceSettingsOpen(false);
      setRoutineTarget(null);
      ++agentFormRevision.current;
      setForm(null);
      ++participantsRequest.current;
      setParticipantsOpen(false);
      ++groupFormRevision.current;
      setNewGroup(false);
      setSpaceNotice(reason);
      if (reason === "session-ended") {
        current.current = createAgentsPageState();
        setPage(current.current);
        onSessionEnded?.();
        return;
      }
      // Close the old conversation immediately, before discovery can finish.
      const fallback = applySpaces(
        current.current,
        current.current.spaces.filter(({ space }) => space.id !== selectedSpace),
      );
      current.current = fallback;
      setPage(fallback);
      if (fallback.spaceId) onNavigate?.({ spaceId: fallback.spaceId });
      void client.spaces
        .list({})
        .then((spaces) => {
          if (!mounted.current || revision !== navigationRevision.current) return;
          const reconciled = applySpaces(current.current, spaces);
          current.current = reconciled;
          setPage(reconciled);
          if (reconciled.spaceId && reconciled.spaceId !== fallback.spaceId)
            onNavigate?.({ spaceId: reconciled.spaceId });
        })
        .catch(() => {});
    },
    [client, onNavigate, onSessionEnded],
  );
  useEffect(() => {
    if (!management || !page.spaceId) return;
    const selectedSpace = page.spaceId;
    const live = new SpaceLiveController({
      spaceId: selectedSpace,
      accountId,
      socket: eventSocket,
      list: () => client.spaces.list({}),
      onMemberships(spaces) {
        if (mounted.current) setPage((state) => applySpaces(state, spaces));
      },
      async onEvent(event) {
        if (event.spaceId === selectedSpace) {
          if (event.id <= management.getSnapshot().eventCursor) return;
          const applied = await management.applyEvent(event);
          if (!applied) throw new Error("Space directory refresh failed");
        }
        setPage((state) => ({
          ...state,
          spaces: state.spaces.map((entry) => {
            if (entry.space.id !== event.spaceId) return entry;
            if (event.kind === "space.renamed")
              return { ...entry, space: { ...entry.space, name: event.payload.name } };
            if (event.kind === "space.member.role_changed" && event.payload.accountId === accountId)
              return { ...entry, member: { ...entry.member, role: event.payload.role } };
            return entry;
          }),
        }));
      },
      onPageEvent(event) {
        for (const listener of pageListeners) listener(event);
      },
      onExit: (reason) => exitSpace(reason, selectedSpace),
    });
    live.start();
    const reconcile = () => {
      void live.reconcile().catch(() => {});
      void management.refreshMembers();
    };
    window.addEventListener("focus", reconcile);
    return () => {
      window.removeEventListener("focus", reconcile);
      live.dispose();
    };
  }, [management, page.spaceId, accountId, eventSocket, client, exitSpace, pageListeners]);

  const rememberLastActivity = useCallback((at: string, conversationId: string) => {
    setPage((state) => {
      const selected = state.agents.find((entry) => entry.conversation.id === conversationId);
      const selectedGroup = state.groups?.find((entry) => entry.conversation.id === conversationId);
      if (selected && at !== selected.agent.lastActivityAt)
        return {
          ...state,
          agents: state.agents.map((entry) =>
            entry === selected
              ? {
                  ...entry,
                  agent: { ...entry.agent, lastActivityAt: at },
                  conversation: { ...entry.conversation, lastActivityAt: at },
                }
              : entry,
          ),
        };
      if (selectedGroup && at !== selectedGroup.conversation.lastActivityAt)
        return {
          ...state,
          groups: (state.groups ?? []).map((entry) =>
            entry === selectedGroup
              ? { ...entry, conversation: { ...entry.conversation, lastActivityAt: at } }
              : entry,
          ),
        };
      return state;
    });
  }, []);
  const activityRefresh = useRef(0);
  async function refreshSpaceActivity() {
    const selectedSpace = current.current.spaceId;
    if (!selectedSpace) return;
    const generation = ++activityRefresh.current;
    const conversations = [
      ...current.current.agents
        .slice(0, 100)
        .map((item) => ({ spaceId: item.agent.spaceId, conversationId: item.conversation.id })),
      ...(current.current.groups ?? []).slice(0, 100).map((item) => ({
        spaceId: item.conversation.spaceId,
        conversationId: item.conversation.id,
      })),
    ];
    const before = new Map(
      (activity[selectedSpace] ?? []).map((call) => [toolActivityKey(call), call]),
    );
    const collected: ToolActivity[] = [];
    let next = 0;
    async function readNext() {
      while (next < conversations.length) {
        const item = conversations[next++];
        if (
          !item ||
          !mounted.current ||
          current.current.spaceId !== selectedSpace ||
          generation !== activityRefresh.current
        )
          return;
        try {
          const snapshot = conversationPort.history
            ? await conversationPort.history({ ...item, limit: 30 })
            : await conversationPort.snapshot(item);
          if (
            mounted.current &&
            current.current.spaceId === selectedSpace &&
            generation === activityRefresh.current
          )
            collected.push(...(snapshot.toolActivity ?? []));
        } catch {
          // Another Agent may be deleted or become inaccessible during the bounded read.
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(4, conversations.length) }, readNext));
    if (
      !mounted.current ||
      current.current.spaceId !== selectedSpace ||
      generation !== activityRefresh.current
    )
      return;
    setActivity((previous) => {
      const duringRefresh = (previous[selectedSpace] ?? []).filter(
        (call) => before.get(toolActivityKey(call)) !== call,
      );
      return {
        ...previous,
        [selectedSpace]: mergeToolActivity(mergeToolActivity([], collected), duringRefresh),
      };
    });
  }

  const selectedGroup = page.groups?.find((item) => item.conversation.id === page.groupId);
  const groupAgent = selectedGroup?.agents[0];
  const selected =
    selectedGroup && groupAgent
      ? { agent: groupAgent, conversation: selectedGroup.conversation }
      : page.agents.find((item) => item.agent.id === page.agentId);
  const rowButtons = useRef(new Map<string, HTMLElement>());
  const previousSelection = useRef<string | null>(null);
  const selectedRowId = selectedGroup?.conversation.id ?? selected?.agent.id ?? null;
  useLayoutEffect(() => {
    if (!selectedRowId && previousSelection.current)
      (rowButtons.current.get(previousSelection.current) ?? newGroupTrigger.current)?.focus();
    previousSelection.current = selectedRowId;
  }, [selectedRowId]);
  function chooseSpace(value: string) {
    setAgentFilter("", false);
    setAgentsSectionOpen(true);
    ++navigationRevision.current;
    setSpaceNotice(null);
    ++agentFormRevision.current;
    setForm(null);
    setSpaceSettingsOpen(false);
    setRoutineTarget(null);
    closeParticipants();
    closeGroupForm();
    const nextPage = selectSpace(current.current, value);
    current.current = nextPage;
    setPage(nextPage);
    onNavigate?.({ spaceId: value });
  }
  async function openNotification(
    notification: import("@raypx/core/notifications").MemberNotification,
  ) {
    chooseSpace(notification.spaceId);
    if (!notification.conversationId) {
      setSpaceSettingsOpen(true);
      return;
    }
    const revision = navigationRevision.current;
    const [agents, notificationGroups] = await Promise.all([
      client.agents.list({ spaceId: notification.spaceId, limit: 100 }),
      groups?.listGroups({ spaceId: notification.spaceId, limit: 100 }) ?? [],
    ]);
    if (revision !== navigationRevision.current) return;
    const group = notificationGroups.find((item) => item.id === notification.conversationId);
    const direct = agents.find((item) => item.conversation.id === notification.conversationId);
    const loaded = applyGroups(
      applyAgents(current.current, notification.spaceId, agents),
      notification.spaceId,
      notificationGroups.map((conversation) => ({
        conversation,
        agents: agents
          .filter((item) => conversation.agentIds?.includes(item.agent.id))
          .map((item) => item.agent),
      })),
    );
    current.current = loaded;
    setPage(loaded);
    if (group) chooseGroup({ conversation: group, agents: agents.map((item) => item.agent) });
    else if (direct) chooseAgent(direct);
    if (notification.runId)
      setRunReference({
        conversationId: notification.conversationId,
        id: crypto.randomUUID(),
        runId: notification.runId,
      });
  }
  function chooseAgent(item: AgentConversationView) {
    rememberTarget(item.agent.id);
    ++navigationRevision.current;
    closeParticipants();
    const nextPage = selectAgent(current.current, item.agent.id);
    current.current = nextPage;
    setPage(nextPage);
    onNavigate?.({ spaceId: item.agent.spaceId, agentId: item.agent.id });
  }
  function chooseGroup(item: GroupConversationView) {
    ++navigationRevision.current;
    closeParticipants();
    const nextPage = selectGroup(current.current, item.conversation.id);
    current.current = nextPage;
    setPage(nextPage);
    onNavigate?.({ spaceId: item.conversation.spaceId, groupId: item.conversation.id });
  }
  function updateGroup(conversation: Conversation) {
    setPage((state) => {
      if (state.spaceId !== conversation.spaceId) return state;
      const updatedGroups =
        state.groups?.map((item) => {
          if (item.conversation.id !== conversation.id) return item;
          return {
            conversation,
            agents: state.agents
              .filter((entry) => conversation.agentIds?.includes(entry.agent.id))
              .map((entry) => entry.agent),
          };
        }) ?? [];
      return { ...state, groups: updatedGroups };
    });
  }
  function closeParticipants() {
    ++participantsRequest.current;
    setParticipantsOpen(false);
  }
  function openParticipants() {
    if (!selectedGroup || !groups) return;
    const request = ++participantsRequest.current;
    participantsTrigger.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setParticipantsOpen(true);
    setParticipantsLoading(true);
    void groups
      .getGroup({
        spaceId: selectedGroup.conversation.spaceId,
        conversationId: selectedGroup.conversation.id,
      })
      .then((conversation) => {
        if (request === participantsRequest.current) updateGroup(conversation);
      })
      .catch(() => {
        if (request === participantsRequest.current) setFailed(true);
      })
      .finally(() => {
        if (request === participantsRequest.current) setParticipantsLoading(false);
      });
  }
  function closeGroupForm() {
    ++groupFormRevision.current;
    setNewGroup(false);
  }
  async function createGroup(input: GroupConversationInput) {
    const selectedSpace = page.spaceId;
    if (!groups || !selectedSpace) return;
    const revision = navigationRevision.current;
    const formRevision = groupFormRevision.current;
    const conversation = await groups.createGroup({ ...input, spaceId: selectedSpace });
    if (!mounted.current || current.current.spaceId !== selectedSpace) return;
    const selectCreated =
      revision === navigationRevision.current && formRevision === groupFormRevision.current;
    setPage((state) => {
      if (state.spaceId !== selectedSpace) return state;
      const created = {
        conversation,
        agents: state.agents
          .filter((entry) => conversation.agentIds?.includes(entry.agent.id))
          .map((entry) => entry.agent),
      };
      const updatedGroups = [
        ...(state.groups ?? []).filter((item) => item.conversation.id !== conversation.id),
        created,
      ];
      if (!selectCreated) return { ...state, groups: updatedGroups };
      return { ...state, agentId: null, groupId: conversation.id, groups: updatedGroups };
    });
    if (!selectCreated) return;
    closeGroupForm();
    onNavigate?.({ spaceId: selectedSpace, groupId: conversation.id });
  }
  function groupDeleted(group: GroupConversationView) {
    if (!mounted.current || current.current.spaceId !== group.conversation.spaceId) return;
    const wasSelected = current.current.groupId === group.conversation.id;
    if (wasSelected) closeParticipants();
    setPage((state) => {
      if (state.spaceId !== group.conversation.spaceId) return state;
      return {
        ...state,
        groupId: wasSelected ? null : (state.groupId ?? null),
        groups:
          state.groups?.filter((item) => item.conversation.id !== group.conversation.id) ?? [],
      };
    });
    if (wasSelected) onNavigate?.({ spaceId: group.conversation.spaceId });
  }
  function back() {
    setAgentFilter("", false);
    setAgentsSectionOpen(true);
    ++navigationRevision.current;
    current.current = { ...current.current, agentId: null, groupId: null };
    setPage(current.current);
    if (page.spaceId) onNavigate?.({ spaceId: page.spaceId });
  }
  async function createSpace(name: string) {
    const revision = ++navigationRevision.current;
    const created = await client.spaces.create({ name });
    if (!mounted.current) return;
    setNewSpace(false);
    if (revision !== navigationRevision.current) return;
    const nextPage = applySpaces(
      current.current,
      [...current.current.spaces, created],
      created.space.id,
    );
    current.current = nextPage;
    setPage(nextPage);
    setSpaceNotice(null);
    onNavigate?.({ spaceId: created.space.id });
  }
  async function saveAgent(input: AgentInput, capabilities?: AgentCapabilitySelection) {
    const selectedSpace = page.spaceId;
    if (!selectedSpace || !form) return;
    const formRevision = agentFormRevision.current;
    let saved: AgentConversationView;
    if (form === "new")
      saved = await client.agents.create({ spaceId: selectedSpace, agent: input });
    else
      saved = await client.agents.update({
        spaceId: selectedSpace,
        id: form.agent.id,
        agent: input,
      });
    if (!mounted.current || current.current.spaceId !== selectedSpace) return;
    setPage((state) => ({
      ...state,
      ...(state.groups
        ? {
            groups: state.groups.map((group) => ({
              ...group,
              agents: group.agents.map((agent) =>
                agent.id === saved.agent.id ? saved.agent : agent,
              ),
            })),
          }
        : {}),
      agents: [...state.agents.filter((item) => item.agent.id !== saved.agent.id), saved],
      ...(agentFormRevision.current === formRevision
        ? { agentId: saved.agent.id, groupId: null }
        : {}),
    }));
    if (capabilities) {
      // Retain the created identity if enablement fails, so retry cannot create another Agent.
      if (agentFormRevision.current === formRevision) setForm(saved);
      await saveAgentCapabilities(client, saved.agent.spaceId, saved.agent.id, capabilities);
      if (!mounted.current || current.current.spaceId !== selectedSpace) return;
    }
    if (agentFormRevision.current !== formRevision) return;
    ++agentFormRevision.current;
    setForm(null);
    onNavigate?.({ spaceId: selectedSpace, agentId: saved.agent.id });
  }
  async function removeAgent(item: AgentConversationView) {
    if (deletingRef.current) return;
    deletingRef.current = item.agent.id;
    setDeleting(item.agent.id);
    setFailed(false);
    try {
      const accepted = await confirmation.confirm({
        requestKey: item.agent.id,
        title: t("deleteTitle", { name: item.agent.name }),
        description: t("deleteDescription"),
        confirmLabel: t("deleteAgent"),
        cancelLabel: t("cancel"),
      });
      if (!accepted || !mounted.current || current.current.spaceId !== item.agent.spaceId) return;
      await client.agents.delete({ spaceId: item.agent.spaceId, id: item.agent.id });
      if (!mounted.current || current.current.spaceId !== item.agent.spaceId) return;
      const wasSelected = current.current.agentId === item.agent.id;
      setPage((state) => ({
        ...state,
        agents: state.agents.filter((entry) => entry.agent.id !== item.agent.id),
        agentId: wasSelected ? null : state.agentId,
      }));
      if (wasSelected) onNavigate?.({ spaceId: item.agent.spaceId });
      if (groups) setRefresh((value) => value + 1);
    } catch {
      if (mounted.current) setFailed(true);
    } finally {
      deletingRef.current = null;
      if (mounted.current) setDeleting(null);
    }
  }

  const recent = [
    ...agentsByActivity
      .filter((entry) => entry.agent.lastActivityAt)
      .map((entry) => ({
        kind: "agent" as const,
        id: entry.agent.id,
        name: entry.agent.name,
        lastActivityAt: entry.agent.lastActivityAt,
        item: entry,
      })),
    ...groupsByActivity
      .filter((entry) => entry.conversation.lastActivityAt)
      .map((entry) => ({
        kind: "group" as const,
        id: entry.conversation.id,
        name: entry.conversation.name ?? t("groups.title"),
        lastActivityAt: entry.conversation.lastActivityAt,
        item: entry,
      })),
  ]
    .sort(compareLastActivity)
    .slice(0, 30);
  function edit(item: AgentConversationView) {
    ++agentFormRevision.current;
    setForm(item);
  }
  function createAgent() {
    ++agentFormRevision.current;
    setForm("new");
  }
  const currentHomeTarget =
    page.agents.find((entry) => entry.agent.id === homeTargetId) ?? agentsByActivity[0];
  const routineAgent =
    page.agents.find((entry) => entry.agent.id === routinesAgentId) ?? currentHomeTarget;
  let routinesDisabledReason: string | undefined;
  if (loading) routinesDisabledReason = t("loading");
  else if (page.agents.length === 0) routinesDisabledReason = t("noAgents");
  const homeCreateAction =
    sidebarCollapsed && !renderWorkspace && !selected && page.agents.length === 0;
  const rowClass =
    "w-full min-w-0 justify-start gap-2 rounded-lg px-2 text-sm font-normal sidebar-icon:justify-center sidebar-icon:px-0";
  function agentMenu(item: AgentConversationView, isRecent = false) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <IconButton
              size="icon-sm"
              label={t(isRecent ? "workspaceSidebar.recentActions" : "agentActions", {
                name: item.agent.name,
              })}
              className="shrink-0 opacity-0 group-hover/directory-row:opacity-100 group-focus-within/directory-row:opacity-100 pointer-coarse:opacity-100 sidebar-icon:hidden"
            />
          }
        >
          <MoreHorizontalIcon aria-hidden="true" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuGroup>
            <DropdownMenuItem onClick={() => edit(item)}>
              <EditIcon aria-hidden="true" />
              {t("editAgent")}
            </DropdownMenuItem>
            <DropdownMenuItem
              variant="destructive"
              disabled={deleting !== null}
              onClick={() => void removeAgent(item)}
            >
              <DeleteIcon aria-hidden="true" />
              {t("deleteAgent")}
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }
  const spaceControl = (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            ref={spaceTrigger}
            size="sm"
            variant="ghost"
            aria-label={t("space")}
            disabled={loading}
            className={rowClass}
          />
        }
      >
        <FolderIcon data-icon="inline-start" aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate text-left sidebar-icon:hidden">
          {membership?.space.name ?? t("space")}
        </span>
        <ChevronsUpDownIcon aria-hidden="true" className="size-3.5 shrink-0 sidebar-icon:hidden" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-52">
        {page.spaces.length > 1 && (
          <>
            <DropdownMenuRadioGroup value={page.spaceId ?? ""} onValueChange={chooseSpace}>
              {page.spaces.map(({ space }) => (
                <DropdownMenuRadioItem key={space.id} value={space.id} data-value={space.id}>
                  {space.name}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuGroup>
          {management && (
            <DropdownMenuItem onClick={() => setSpaceSettingsOpen(true)}>
              <SettingsIcon aria-hidden="true" />
              {t("spaceSettings.title")}
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={() => setNewSpace(true)}>
            <PlusIcon aria-hidden="true" />
            {t("newSpace")}
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-clip">
      {!renderWorkspace && !selected && (
        <ShellToolbar>
          <span className="sr-only">{t("title")}</span>
        </ShellToolbar>
      )}
      {(page.spaceId || loading) && (
        <ShellPrimaryAction>
          <Button
            variant="ghost"
            disabled={!page.spaceId || loading || page.agents.length === 0}
            className="w-full min-w-0 justify-start gap-2 px-2 sidebar-icon:justify-center sidebar-icon:px-0"
            aria-label={t("workspaceSidebar.new")}
            onClick={() => {
              if (page.spaceId && onNewConversation) onNewConversation(page.spaceId);
              else back();
            }}
          >
            <PlusIcon data-icon="inline-start" aria-hidden="true" />
            <span className="sidebar-icon:hidden">{t("workspaceSidebar.new")}</span>
          </Button>
        </ShellPrimaryAction>
      )}
      {client.routines && page.spaceId && (
        <ShellSidebarNavigation>
          <Button
            ref={routinesTrigger}
            variant="ghost"
            className={rowClass}
            aria-label={t("routines")}
            disabled={Boolean(routinesDisabledReason)}
            aria-describedby={routinesDisabledReason ? routinesReasonId : undefined}
            onClick={() => {
              setRoutinesAgentId(selected?.agent.id ?? currentHomeTarget?.agent.id ?? null);
              setRoutinesOpen(true);
            }}
          >
            <ClockIcon data-icon="inline-start" aria-hidden="true" />
            <span className="truncate sidebar-icon:hidden">{t("routines")}</span>
          </Button>
          {routinesDisabledReason && (
            <p
              id={routinesReasonId}
              className="px-2 text-xs text-muted-foreground sidebar-icon:sr-only"
            >
              {routinesDisabledReason}
            </p>
          )}
        </ShellSidebarNavigation>
      )}
      <ShellSidebarDirectory>
        <div className="flex min-w-0 flex-col gap-4">
          {onOpenTools && (
            <Button
              variant="ghost"
              className={rowClass}
              onClick={onOpenTools}
              aria-label={t("workspaceSidebar.tools")}
            >
              <AdjustmentsIcon data-icon="inline-start" aria-hidden="true" />
              <span className="truncate sidebar-icon:hidden">{t("workspaceSidebar.tools")}</span>
            </Button>
          )}
          {(page.spaceId || loading) && (
            <>
              <DirectorySection
                title={t("title")}
                expanded={agentsSectionOpen}
                onExpandedChange={(open) => {
                  setAgentsSectionOpen(open);
                  if (!open) setAgentFilter("", false);
                }}
                action={
                  page.agents.length > 0 ? (
                    <span className="flex items-center gap-0.5">
                      {!sidebarCollapsed && (
                        <IconButton
                          ref={filterTrigger}
                          size="icon-xs"
                          label={t("workspaceSidebar.filterAgents")}
                          aria-expanded={filterOpen}
                          aria-controls={filterOpen ? agentFilterId : undefined}
                          onClick={() => {
                            setAgentsSectionOpen(true);
                            setAgentFilter("", !filterOpen);
                          }}
                        >
                          <FilterIcon aria-hidden="true" />
                        </IconButton>
                      )}
                      <IconButton
                        size="icon-xs"
                        label={t("newAgent")}
                        disabled={loading}
                        onClick={createAgent}
                      >
                        <PlusIcon aria-hidden="true" />
                      </IconButton>
                    </span>
                  ) : undefined
                }
              >
                {filterOpen && !sidebarCollapsed && (
                  <InputGroup id={agentFilterId} controlSize="sm" className="mb-2">
                    <InputGroupAddon>
                      <FilterIcon aria-hidden="true" />
                    </InputGroupAddon>
                    <InputGroupInput
                      ref={filterInput}
                      aria-label={t("workspaceSidebar.filterAgents")}
                      placeholder={t("workspaceSidebar.filterAgents")}
                      value={agentFilter}
                      onChange={(event) => setAgentFilter(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key !== "Escape") return;
                        event.preventDefault();
                        event.stopPropagation();
                        if (agentFilter) {
                          setAgentFilter("");
                          return;
                        }
                        setAgentFilter("", false);
                        filterTrigger.current?.focus();
                      }}
                    />
                    {agentFilter && (
                      <InputGroupAddon align="inline-end">
                        <IconButton
                          size="icon-xs"
                          label={t("workspaceSidebar.clearFilter")}
                          onClick={() => {
                            setAgentFilter("");
                            filterInput.current?.focus();
                          }}
                        >
                          <CloseIcon aria-hidden="true" />
                        </IconButton>
                      </InputGroupAddon>
                    )}
                  </InputGroup>
                )}
                {!loading && page.agents.length === 0 && !homeCreateAction && (
                  <div className="mx-1 flex flex-col gap-3 rounded-xl border border-border/60 bg-background/70 p-3 sidebar-icon:border-0 sidebar-icon:bg-transparent sidebar-icon:p-0">
                    <p className="text-xs leading-5 text-muted-foreground sidebar-icon:hidden">
                      {t("workspaceSidebar.emptyAgents")}
                    </p>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={createAgent}
                      ref={firstAgentTrigger}
                      aria-label={t("createAgent")}
                      className="w-full min-w-0 sidebar-icon:px-0"
                    >
                      <PlusIcon data-icon="inline-start" aria-hidden="true" />
                      <span className="truncate sidebar-icon:hidden">{t("createAgent")}</span>
                    </Button>
                  </div>
                )}
                {page.agents.length > 0 && (
                  <ul className="flex min-w-0 flex-col gap-0.5">
                    {filteredAgents.map((item) => (
                      <li
                        key={item.agent.id}
                        className={cn(
                          "group/directory-row flex min-w-0 items-center rounded-lg",
                          item.agent.id === page.agentId && "bg-sidebar-accent",
                        )}
                      >
                        <Button
                          ref={(node) => {
                            if (node) rowButtons.current.set(item.agent.id, node);
                            else rowButtons.current.delete(item.agent.id);
                          }}
                          size="sm"
                          variant="ghost"
                          className={cn(rowClass, "flex-1")}
                          aria-label={item.agent.name}
                          title={item.agent.name}
                          aria-current={item.agent.id === page.agentId ? "page" : undefined}
                          onClick={() => chooseAgent(item)}
                        >
                          <AgentIcon data-icon="inline-start" aria-hidden="true" />
                          <span className="min-w-0 flex-1 truncate text-left sidebar-icon:hidden">
                            {item.agent.name}
                          </span>
                        </Button>
                        {agentMenu(item)}
                      </li>
                    ))}
                  </ul>
                )}
                {page.agents.length > 0 && filteredAgents.length === 0 && (
                  <p role="status" className="px-2 py-2 text-xs text-muted-foreground">
                    {t("workspaceSidebar.noMatches")}
                  </p>
                )}
              </DirectorySection>
              {groups && (
                <DirectorySection
                  title={t("groups.title")}
                  action={
                    groupsByActivity.length > 0 ? (
                      <IconButton
                        ref={newGroupTrigger}
                        size="icon-xs"
                        label={t("groups.new")}
                        disabled={loading}
                        onClick={() => setNewGroup(true)}
                      >
                        <PlusIcon aria-hidden="true" />
                      </IconButton>
                    ) : undefined
                  }
                >
                  <ul className="flex min-w-0 flex-col gap-0.5">
                    {groupsByActivity.map((item) => (
                      <li key={item.conversation.id}>
                        <Button
                          ref={(node) => {
                            if (node) rowButtons.current.set(item.conversation.id, node);
                            else rowButtons.current.delete(item.conversation.id);
                          }}
                          size="sm"
                          variant="ghost"
                          className={cn(
                            rowClass,
                            item.conversation.id === page.groupId && "bg-sidebar-accent",
                          )}
                          aria-label={item.conversation.name}
                          title={item.conversation.name}
                          aria-current={item.conversation.id === page.groupId ? "page" : undefined}
                          onClick={() => chooseGroup(item)}
                        >
                          <UserCircleIcon data-icon="inline-start" aria-hidden="true" />
                          <span className="min-w-0 flex-1 truncate text-left sidebar-icon:hidden">
                            {item.conversation.name}
                          </span>
                        </Button>
                      </li>
                    ))}
                  </ul>
                  {groupsByActivity.length === 0 && (
                    <Button
                      ref={newGroupTrigger}
                      size="sm"
                      variant="ghost"
                      className={rowClass}
                      onClick={() => setNewGroup(true)}
                      aria-label={t("groups.new")}
                    >
                      <PlusIcon data-icon="inline-start" aria-hidden="true" />
                      <span className="truncate text-xs text-muted-foreground sidebar-icon:hidden">
                        {t("groups.new")}
                      </span>
                    </Button>
                  )}
                </DirectorySection>
              )}
              <DirectorySection title={t("space")}>{spaceControl}</DirectorySection>
              <DirectorySection title={t("workspaceSidebar.recent")}>
                <ul className="flex min-w-0 flex-col gap-0.5">
                  {recent.map((entry) => (
                    <li
                      key={`${entry.kind}:${entry.id}`}
                      className="group/directory-row flex min-w-0 items-center rounded-lg"
                    >
                      <Button
                        size="sm"
                        variant="ghost"
                        className={cn(rowClass, "flex-1")}
                        aria-label={t("workspaceSidebar.openRecent", { name: entry.name })}
                        title={entry.name}
                        onClick={() => {
                          if (entry.kind === "agent") chooseAgent(entry.item);
                          else chooseGroup(entry.item);
                        }}
                      >
                        <HistoryIcon data-icon="inline-start" aria-hidden="true" />
                        <span className="min-w-0 flex-1 truncate text-left sidebar-icon:hidden">
                          {entry.name}
                        </span>
                      </Button>
                      {entry.kind === "agent" ? (
                        agentMenu(entry.item, true)
                      ) : (
                        <DropdownMenu>
                          <DropdownMenuTrigger
                            render={
                              <IconButton
                                size="icon-sm"
                                label={t("workspaceSidebar.recentActions", { name: entry.name })}
                                className="opacity-0 group-hover/directory-row:opacity-100 group-focus-within/directory-row:opacity-100 pointer-coarse:opacity-100 sidebar-icon:hidden"
                              />
                            }
                          >
                            <MoreHorizontalIcon aria-hidden="true" />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuGroup>
                              <DropdownMenuItem onClick={() => chooseGroup(entry.item)}>
                                {t("conversation")}
                              </DropdownMenuItem>
                            </DropdownMenuGroup>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </li>
                  ))}
                </ul>
              </DirectorySection>
            </>
          )}
        </div>
      </ShellSidebarDirectory>
      {membership && (
        <ShellSidebarFooter>
          <p className="px-2 pb-1 text-xs text-muted-foreground sidebar-icon:hidden">
            {t(`spaceSettings.roles.${membership.member.role}`)}
          </p>
          {membership.member.role === "owner" && management && (
            <Button
              size="sm"
              variant="ghost"
              className={rowClass}
              onClick={() => setSpaceSettingsOpen(true)}
              aria-label={t("workspaceSidebar.invite")}
            >
              <PlusIcon data-icon="inline-start" aria-hidden="true" />
              <span className="truncate text-xs sidebar-icon:hidden">
                {t("workspaceSidebar.invite")}
              </span>
            </Button>
          )}
        </ShellSidebarFooter>
      )}
      {client.notifications && (
        <ShellSidebarActions>
          <NotificationsBell
            port={client.notifications}
            onOpen={(item) =>
              void openNotification(item).catch(() => setSpaceNotice("unavailable"))
            }
          />
        </ShellSidebarActions>
      )}
      {spaceNotice && (
        <p role="status" className="px-5 py-2 text-sm text-muted-foreground">
          {t(spaceExitKeys[spaceNotice])}
        </p>
      )}
      {failed && (
        <Alert>
          <AlertDescription>{t("directoryError")}</AlertDescription>
          <AlertAction>
            <Button
              size="sm"
              variant="outline"
              disabled={loading}
              onClick={() => setRefresh((value) => value + 1)}
            >
              {t("refresh")}
            </Button>
          </AlertAction>
        </Alert>
      )}
      {loading && page.agents.length === 0 && <LoadingState label={t("loading")} />}
      {client.protectedInputs && page.spaceId && (renderWorkspace || !selected) && (
        <ProtectedInputs
          key={page.spaceId}
          port={client.protectedInputs}
          spaceId={page.spaceId}
          className="mx-auto w-full max-w-[44rem] px-3 pt-3 sm:px-5"
        />
      )}
      {!loading && !failed && page.spaces.length === 0 && (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <AgentIcon aria-hidden="true" />
            </EmptyMedia>
            <h1 className="text-lg font-medium">{t("noSpaces")}</h1>
          </EmptyHeader>
          <Button onClick={() => setNewSpace(true)}>{t("newSpace")}</Button>
        </Empty>
      )}
      {renderWorkspace &&
        page.spaceId &&
        !loading &&
        !failed &&
        renderWorkspace({
          spaceId: page.spaceId,
          agents: page.agents.map((entry) => entry.agent),
          accountNames: Object.fromEntries(
            (managementState?.members ?? []).map((member) => [member.accountId, member.name]),
          ),
          subscribe: subscribePages,
        })}
      {!renderWorkspace &&
        !loading &&
        !failed &&
        page.spaceId &&
        (selected ? (
          <AgentConversation
            key={JSON.stringify([accountId, origin, selected.conversation.id])}
            item={selected}
            runReference={
              runReference?.conversationId === selected.conversation.id ? runReference : undefined
            }
            onBack={back}
            onEditAgent={() => edit(selected)}
            onDeleteAgent={selectedGroup ? undefined : () => void removeAgent(selected)}
            onOpenPage={onOpenPage}
            composerReference={composerReference}
            group={selectedGroup}
            agentDirectory={page.agents.map((entry) => entry.agent)}
            onManageParticipants={selectedGroup && groups ? openParticipants : undefined}
            capabilities={client}
            supportsImages={
              selectedGroup
                ? selectedGroup.agents.some(
                    (agent) =>
                      page.models.find((model) => model.modelId === agent.model.modelId)
                        ?.supportsImages === true,
                  )
                : page.models.find((model) => model.modelId === selected.agent.model.modelId)
                    ?.supportsImages === true
            }
            port={conversationPort}
            computerPort={computerPort}
            approvalPort={approvalPort}
            activity={activity[selected.agent.spaceId]}
            onActivity={rememberActivity}
            onComputerOpen={() => void refreshSpaceActivity()}
            socket={eventSocket}
            drafts={draftStore}
            origin={origin}
            accountId={accountId}
            members={managementState?.members}
            spaceSettings={managementState?.settings}
            effectiveMode={managementState?.effectiveMode}
            onLastActivity={rememberLastActivity}
          />
        ) : (
          <WorkspaceHome
            messageAttachments={client.messageAttachments}
            agents={agentsByActivity}
            deviceComputers={client.deviceComputers}
            targetId={homeTargetId}
            onTargetChange={rememberTarget}
            onOpen={chooseAgent}
            onEdit={edit}
            onCreateAgent={homeCreateAction ? createAgent : undefined}
            createAgentRef={firstAgentTrigger}
            publicOrigin={invitationOrigin ?? origin}
            onOpenExternal={onOpenExternal}
            models={page.models}
            mode={
              managementState?.effectiveMode?.mode ??
              managementState?.settings?.approvalMode ??
              undefined
            }
            port={conversationPort}
            computerPort={computerPort}
            approvalPort={approvalPort}
            socket={eventSocket}
            drafts={draftStore}
            origin={origin}
            accountId={accountId}
          />
        ))}
      {newGroup && <GroupForm agents={page.agents} onSave={createGroup} onClose={closeGroupForm} />}
      {selectedGroup && groups && (
        <CapabilitySheet
          open={participantsOpen}
          onClose={closeParticipants}
          title={t("groups.participants")}
          closeLabel={t("close")}
          finalFocus={() => participantsTrigger.current ?? false}
          className="w-full sm:max-w-lg"
        >
          {participantsOpen && participantsLoading && (
            <p role="status" className="text-sm text-muted-foreground">
              {t("loading")}
            </p>
          )}
          {participantsOpen && !participantsLoading && (
            <GroupParticipants
              group={selectedGroup}
              agents={page.agents}
              port={groups}
              onChange={updateGroup}
              onDeleted={() => groupDeleted(selectedGroup)}
            />
          )}
        </CapabilitySheet>
      )}
      {newSpace && <SpaceForm onSave={createSpace} onClose={() => setNewSpace(false)} />}
      {form && (
        <AgentForm
          initial={form === "new" ? null : form.agent}
          finalFocus={
            form === "new" && page.agents.length === 0
              ? () => firstAgentTrigger.current ?? false
              : undefined
          }
          models={page.models}
          capabilities={client}
          spaceId={page.spaceId ?? undefined}
          agentId={form === "new" ? undefined : form.agent.id}
          onSave={saveAgent}
          onClose={() => {
            ++agentFormRevision.current;
            setForm(null);
          }}
          onOpenModels={
            onOpenModels
              ? () => {
                  ++agentFormRevision.current;
                  setForm(null);
                  onOpenModels();
                }
              : undefined
          }
        />
      )}
      {management && membership && (
        <CapabilitySheet
          open={spaceSettingsOpen}
          onClose={() => {
            management.clearIssuedInvitation();
            setSpaceSettingsOpen(false);
          }}
          title={t("spaceSettings.title")}
          closeLabel={t("close")}
          finalFocus={() => spaceTrigger.current ?? false}
          className="data-[side=right]:w-full data-[side=right]:sm:max-w-2xl"
        >
          {spaceSettingsOpen && (
            <SpaceSettingsPanel
              controller={management}
              devices={devices}
              role={membership.member.role}
              invitationOrigin={invitationOrigin ?? origin}
              onExit={(reason) => exitSpace(reason, management.spaceId)}
              onOpenRoutine={(id) => {
                management.clearIssuedInvitation();
                setSpaceSettingsOpen(false);
                setRoutineTarget(id);
              }}
            />
          )}
        </CapabilitySheet>
      )}
      {page.spaceId && client.routines && (
        <CapabilitySheet
          open={routinesOpen}
          onClose={() => setRoutinesOpen(false)}
          title={t("routines")}
          closeLabel={t("close")}
          finalFocus={() => routinesTrigger.current ?? false}
          className="w-full sm:max-w-2xl"
        >
          {routinesOpen && routineAgent && (
            <>
              <div className="mb-4">
                <Select
                  items={page.agents.map((entry) => ({
                    value: entry.agent.id,
                    label: entry.agent.name,
                  }))}
                  value={routineAgent.agent.id}
                  onValueChange={(value) => {
                    if (value) setRoutinesAgentId(value);
                  }}
                >
                  <SelectTrigger aria-label={t("workspaceHome.target")}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent align="start" alignItemWithTrigger={false}>
                    <SelectGroup>
                      {page.agents.map((entry) => (
                        <SelectItem
                          key={entry.agent.id}
                          value={entry.agent.id}
                          data-value={entry.agent.id}
                        >
                          {entry.agent.name}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
              <RoutinesPanel
                showTitle={false}
                spaceId={page.spaceId}
                agentId={routineAgent.agent.id}
                accountId={accountId}
                port={client.routines}
                onOpenRun={(runId) => {
                  setRoutinesOpen(false);
                  setRunReference({
                    conversationId: routineAgent.conversation.id,
                    runId,
                    id: crypto.randomUUID(),
                  });
                  chooseAgent(routineAgent);
                }}
              />
            </>
          )}
        </CapabilitySheet>
      )}
      {routineTarget && page.spaceId && client.routines && (
        <CapabilitySheet
          open
          onClose={() => setRoutineTarget(null)}
          title={t("routines")}
          closeLabel={t("close")}
          finalFocus={() => spaceTrigger.current ?? false}
          className="w-full sm:max-w-2xl"
        >
          <PausedRoutinePanel
            id={routineTarget}
            spaceId={page.spaceId}
            accountId={accountId}
            origin={origin}
            port={client.routines}
          />
        </CapabilitySheet>
      )}
      {confirmation.dialog}
    </div>
  );
}

const spaceExitKeys = {
  "session-ended": "spaceSettings.exitSessionEnded",
  removed: "spaceSettings.exitRemoved",
  unavailable: "spaceSettings.exitUnavailable",
  deleting: "spaceSettings.exitDeleted",
  left: "spaceSettings.exitLeft",
} as const;
function subscribeNothing() {
  return () => {};
}
function emptyManagement() {
  return null;
}

function DirectorySection({
  title,
  action,
  children,
  expanded,
  onExpandedChange,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
  expanded?: boolean;
  onExpandedChange?: (open: boolean) => void;
}) {
  const collapsed = useShellSidebarCollapsed();
  const t = useTranslations("agents");
  const [localOpen, setLocalOpen] = useState(true);
  const open = expanded ?? localOpen;
  const setOpen = onExpandedChange ?? setLocalOpen;
  return (
    <Collapsible
      role="region"
      aria-label={title}
      open={collapsed || open}
      onOpenChange={setOpen}
      className="group/directory-section min-w-0"
    >
      {!collapsed && (
        <div className="mb-1 flex min-w-0 items-center gap-1 px-2">
          <CollapsibleTrigger
            aria-label={t(open ? "workspaceSidebar.collapse" : "workspaceSidebar.expand", {
              name: title,
            })}
            className="flex min-h-7 min-w-0 flex-1 items-center gap-1 rounded-md text-left text-xs text-muted-foreground pointer-coarse:min-h-11 outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="min-w-0 flex-1 truncate">{title}</span>
            <ChevronDownIcon
              aria-hidden="true"
              className="size-3 opacity-0 transition-transform group-hover/directory-section:opacity-100 group-focus-within/directory-section:opacity-100 group-data-closed/collapsible:-rotate-90 motion-reduce:transition-none"
            />
          </CollapsibleTrigger>
          <span className="opacity-0 group-hover/directory-section:opacity-100 group-focus-within/directory-section:opacity-100 pointer-coarse:opacity-100">
            {action}
          </span>
        </div>
      )}
      {collapsed && action && <div className="flex justify-center">{action}</div>}
      <CollapsibleContent>{children}</CollapsibleContent>
    </Collapsible>
  );
}

/** Only the selected identity is a device preference; the directory remains server-owned. */
function lastAgentPreference(key: string) {
  let current: string | null = null;
  let memoryOnly = false;
  const listeners = new Set<() => void>();
  return {
    snapshot(this: void) {
      if (memoryOnly) return current;
      try {
        return localStorage.getItem(key);
      } catch {
        return current;
      }
    },
    subscribe(this: void, listener: () => void) {
      listeners.add(listener);
      function storageChanged(event: StorageEvent) {
        if (event.key === key || event.key === null) {
          memoryOnly = false;
          listener();
        }
      }
      window.addEventListener("storage", storageChanged);
      return () => {
        listeners.delete(listener);
        window.removeEventListener("storage", storageChanged);
      };
    },
    set(this: void, id: string) {
      current = id;
      try {
        localStorage.setItem(key, id);
        memoryOnly = false;
      } catch {
        memoryOnly = true;
        // Keep the in-memory choice when device storage is unavailable.
      }
      for (const listener of listeners) listener();
    },
  };
}
