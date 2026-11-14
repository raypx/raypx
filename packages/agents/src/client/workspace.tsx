import {
  saveAgentCapabilities,
  type AgentCapabilitySelection,
} from "../model/agent-capabilities.js";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { ShellToolbar, ShellSidebarHeader, ShellPrimaryAction } from "@raypx/blocks/shell";
import { Avatar, AvatarFallback } from "@raypx/ui/components/ui/avatar";
import { Empty, EmptyHeader, EmptyTitle, EmptyMedia } from "@raypx/ui/components/ui/empty";
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
import { ArrowLeftIcon } from "@raypx/icons/arrow-left";
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
import { GroupForm, GroupParticipants, GroupAvatars } from "./group-directory.js";
import { AgentForm } from "./agent-form.js";
import { SpaceForm } from "./space-form.js";
import { AgentConversation } from "./conversation.js";
import { browserConversationDrafts, browserConversationSocket } from "./browser-ports.js";
import { useTranslations } from "./i18n.js";
import { ActivityTime } from "./activity-time.js";
import { compareLastActivity } from "../model/activity.js";

export interface AgentsWorkspaceProps {
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
  modelCatalogKey,
  socket,
  drafts,
}: AgentsWorkspaceProps) {
  const t = useTranslations("agents");
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
  function chooseAgent(item: AgentConversationView) {
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

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col gap-4 overflow-clip">
      {!renderWorkspace && !selected && (
        <ShellToolbar>
          <h1 className="truncate text-2xl font-medium">{t("title")}</h1>
        </ShellToolbar>
      )}
      <ShellSidebarHeader>
        {(page.spaces.length > 0 || loading) && (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  ref={spaceTrigger}
                  variant="ghost"
                  aria-label={t("space")}
                  disabled={loading}
                  className="w-full min-w-0 justify-start sidebar-icon:justify-center sidebar-icon:px-0"
                />
              }
            >
              <FolderIcon aria-hidden="true" className="size-5 shrink-0" />
              <span className="min-w-0 flex-1 truncate text-left sidebar-icon:hidden">
                {page.spaces.find(({ space }) => space.id === page.spaceId)?.space.name ??
                  t("space")}
              </span>
              <ChevronsUpDownIcon
                aria-hidden="true"
                className="size-4 shrink-0 sidebar-icon:hidden"
              />
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
        )}
      </ShellSidebarHeader>
      {(page.spaceId || loading) && (
        <ShellPrimaryAction>
          <div className="flex min-w-0 flex-col gap-1">
            <Button
              disabled={!page.spaceId || loading}
              onClick={() => {
                ++agentFormRevision.current;
                setForm("new");
              }}
              className="w-full min-w-0 sidebar-icon:px-0"
              aria-label={t("newAgent")}
              title={t("newAgent")}
            >
              <AgentIcon data-icon="inline-start" aria-hidden="true" />
              <span className="truncate sidebar-icon:hidden">{t("newAgent")}</span>
            </Button>
            {groups && (
              <Button
                ref={newGroupTrigger}
                variant="ghost"
                disabled={!page.spaceId || loading}
                onClick={() => setNewGroup(true)}
                className="w-full min-w-0 sidebar-icon:px-0"
                aria-label={t("groups.new")}
                title={t("groups.new")}
              >
                <PlusIcon data-icon="inline-start" aria-hidden="true" />
                <span className="truncate sidebar-icon:hidden">{t("groups.new")}</span>
              </Button>
            )}
          </div>
        </ShellPrimaryAction>
      )}
      {spaceNotice && (
        <p role="status" className="text-sm text-muted-foreground">
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
      {loading && page.agents.length === 0 && (
        <Empty role="status">
          <EmptyTitle>{t("loading")}</EmptyTitle>
        </Empty>
      )}
      {!loading && !failed && page.spaces.length === 0 && (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <AgentIcon aria-hidden="true" />
            </EmptyMedia>
            <EmptyTitle>{t("noSpaces")}</EmptyTitle>
          </EmptyHeader>
          <Button onClick={() => setNewSpace(true)}>{t("newSpace")}</Button>
        </Empty>
      )}
      {!renderWorkspace && !loading && !failed && page.spaceId && page.agents.length === 0 && (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <AgentIcon aria-hidden="true" />
            </EmptyMedia>
            <EmptyTitle>{t("noAgents")}</EmptyTitle>
          </EmptyHeader>
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
      {!renderWorkspace && page.agents.length > 0 && (
        <div className="flex min-h-0 min-w-0 flex-1 gap-6 overflow-clip">
          <aside
            aria-label={t("title")}
            className={cn(
              "min-h-0 min-w-0 flex-col overflow-x-hidden overflow-y-auto overscroll-contain @3xl/main:flex @3xl/main:w-72 @3xl/main:shrink-0",
              selected ? "hidden" : "flex w-full",
            )}
          >
            <h2 className="mb-2 px-3 text-xs font-medium text-muted-foreground">
              {t("groups.direct")}
            </h2>
            <ul className="flex min-w-0 flex-col gap-1">
              {agentsByActivity.map((item) => (
                <li
                  key={item.agent.id}
                  className={cn(
                    "flex min-w-0 items-center gap-1 rounded-lg pr-1",
                    item.agent.id === page.agentId && "bg-muted ring-1 ring-border ring-inset",
                  )}
                >
                  <Button
                    ref={(node) => {
                      if (node) rowButtons.current.set(item.agent.id, node);
                      else rowButtons.current.delete(item.agent.id);
                    }}
                    variant="ghost"
                    className="h-auto min-h-14 min-w-0 flex-1 justify-start py-2 text-left"
                    aria-label={item.agent.name}
                    title={item.agent.name}
                    aria-current={item.agent.id === page.agentId ? "page" : undefined}
                    onClick={() => chooseAgent(item)}
                  >
                    <Avatar aria-hidden="true">
                      <AvatarFallback>
                        {Array.from(item.agent.name.trim())[0]?.toUpperCase() ?? ""}
                      </AvatarFallback>
                    </Avatar>
                    <span className="flex min-w-0 flex-1 flex-col gap-1">
                      <span className="truncate">{item.agent.name}</span>
                      <span className="truncate text-xs font-normal text-muted-foreground">
                        {page.models.find((model) => model.modelId === item.agent.model.modelId)
                          ?.name ?? item.agent.model.modelId}
                      </span>
                      <ActivityTime value={item.agent.lastActivityAt} />
                    </span>
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <IconButton
                          size="icon-sm"
                          label={t("agentActions", { name: item.agent.name })}
                        />
                      }
                    >
                      <MoreHorizontalIcon aria-hidden="true" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuGroup>
                        <DropdownMenuItem
                          onClick={() => {
                            ++agentFormRevision.current;
                            setForm(item);
                          }}
                        >
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
                </li>
              ))}
            </ul>
            {groups && (
              <section className="mt-6 flex min-w-0 flex-col gap-2" aria-label={t("groups.title")}>
                <div className="flex min-w-0 items-center justify-between gap-2 px-3">
                  <h2 className="text-xs font-medium text-muted-foreground">{t("groups.title")}</h2>
                </div>
                <ul className="flex min-w-0 flex-col gap-1">
                  {groupsByActivity.map((item) => (
                    <li key={item.conversation.id}>
                      <Button
                        ref={(node) => {
                          if (node) rowButtons.current.set(item.conversation.id, node);
                          else rowButtons.current.delete(item.conversation.id);
                        }}
                        variant="ghost"
                        className={cn(
                          "h-auto min-h-14 w-full min-w-0 justify-start py-2 text-left",
                          item.conversation.id === page.groupId &&
                            "bg-muted ring-1 ring-border ring-inset",
                        )}
                        aria-label={item.conversation.name}
                        title={item.conversation.name}
                        aria-current={item.conversation.id === page.groupId ? "page" : undefined}
                        onClick={() => chooseGroup(item)}
                      >
                        <GroupAvatars agents={item.agents} />
                        <span className="flex min-w-0 flex-1 flex-col gap-1">
                          <span className="truncate">{item.conversation.name}</span>
                          <ActivityTime value={item.conversation.lastActivityAt} />
                        </span>
                      </Button>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </aside>
          {selected ? (
            <div className="flex min-h-0 w-0 min-w-0 flex-1 flex-col gap-2 overflow-clip">
              <div className="flex min-w-0 shrink-0 justify-start @3xl/main:hidden">
                <Button variant="ghost" onClick={back}>
                  <ArrowLeftIcon data-icon="inline-start" aria-hidden="true" />
                  {t("back")}
                </Button>
              </div>
              <AgentConversation
                key={JSON.stringify([accountId, origin, selected.conversation.id])}
                item={selected}
                onOpenPage={onOpenPage}
                composerReference={composerReference}
                group={selectedGroup}
                agentDirectory={page.agents.map((entry) => entry.agent)}
                onManageParticipants={selectedGroup && groups ? openParticipants : undefined}
                capabilities={client}
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
            </div>
          ) : (
            <Empty className="hidden @3xl/main:flex">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <AgentIcon aria-hidden="true" />
                </EmptyMedia>
                <EmptyTitle>{t("chooseAgent")}</EmptyTitle>
              </EmptyHeader>
            </Empty>
          )}
        </div>
      )}
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
          className="w-full sm:max-w-2xl"
        >
          {spaceSettingsOpen && (
            <SpaceSettingsPanel
              controller={management}
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
