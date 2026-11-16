import { AgentDirectoryList } from "./agent-directory-list.js";
import { cachedSidebarReads, workspaceQueryKey } from "./sidebar-queries.js";
import { spaceIdSchema } from "@raypx/core/spaces";
import {
  QueryClient,
  QueryClientContext,
  QueryClientProvider,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { createSidebarStore } from "../model/sidebar.js";
import { SidebarStateProvider, SidebarStoreContext, useWorkspaceSidebar } from "./sidebar-state.js";
import { WorkspaceContextProvider } from "./workspace-context.js";
import type { WorkspaceSidebarSlots } from "@raypx/blocks/shell";
import { createConversationFeed } from "@raypx/client/events";
import type { PageResultMountProps } from "./page-result.js";
import { NotificationsBell } from "./notifications.js";
import { LoadingState } from "@raypx/ui/loading-state";
import { ProtectedInputs } from "./protected-input.js";
import {
  saveAgentCapabilities,
  type AgentCapabilitySelection,
} from "../model/agent-capabilities.js";
import {
  useContext,
  useCallback,
  useEffect,
  useLayoutEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
  type ComponentProps,
  type ComponentType,
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
import { Skeleton } from "@raypx/ui/components/ui/skeleton";
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
import { Tooltip, TooltipContent, TooltipTrigger } from "@raypx/ui/components/ui/tooltip";
import { SpaceSettingsDialog } from "./space-settings-dialog.js";
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
  type AgentsPageState,
  parseAgentSelection,
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
  type ConversationFeedPort,
  type ApprovalPort,
} from "../model.js";
import { GroupForm, GroupParticipants } from "./group-directory.js";
import { AgentForm } from "./agent-form.js";
import { SpaceForm } from "./space-form.js";
import { AgentConversation } from "./conversation.js";
import { ConversationLoading, conversationColumn } from "./conversation-loading.js";
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
  route?: string;
  ensureSpaceSearch?: boolean;
  children?: ReactNode;
  renderShell?: ((sidebar: WorkspaceSidebarSlots, content: ReactNode) => ReactNode) | undefined;
  renderWorkspace?:
    | ((context: {
        spaceId: string;
        agents: readonly Agent[];
        accountNames: Record<string, string>;
        subscribe: (listener: (event: SpaceEvent) => void) => () => void;
      }) => ReactNode)
    | undefined;
  workspaceLoading?: ReactNode;
  onSessionEnded?: (() => void) | undefined;
  onOpenPage?: ((id: string) => void) | undefined;
  pageResultPreview?: ComponentType<PageResultMountProps> | undefined;
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
  onNavigate?: (
    selection: { spaceId: string; agentId?: string; groupId?: string },
    replace?: boolean,
  ) => void;
  socket?: ConversationSocketPort;
  feed?: ConversationFeedPort;
  drafts?: ConversationDraftStore;
}

export function AgentsWorkspace(props: AgentsWorkspaceProps) {
  const parent = useContext(QueryClientContext);
  const [fallback] = useState(
    () => new QueryClient({ defaultOptions: { queries: { retry: false } } }),
  );
  return (
    <QueryClientProvider client={parent ?? fallback}>
      <ScopedWorkspace key={JSON.stringify([props.origin, props.accountId])} {...props} />
    </QueryClientProvider>
  );
}
function ScopedWorkspace(props: AgentsWorkspaceProps) {
  const [store] = useState(() => createSidebarStore(props.origin, props.accountId));
  useLayoutEffect(() => {
    void store.persist.rehydrate();
  }, [store]);
  useEffect(() => {
    const restore = (event: StorageEvent) => {
      if (event.key === null || event.key === store.persist.getOptions().name)
        void store.persist.rehydrate();
    };
    window.addEventListener("storage", restore);
    return () => window.removeEventListener("storage", restore);
  }, [store]);
  return (
    <SidebarStateProvider store={store}>
      <AgentsWorkspaceContents {...props} />
    </SidebarStateProvider>
  );
}

function AgentsWorkspaceContents({
  client: sourceClient,
  route = "/agents",
  ensureSpaceSearch = false,
  children,
  renderShell,
  nativeDeviceConfirmation,
  onSessionEnded,
  renderWorkspace,
  workspaceLoading,
  onOpenPage,
  pageResultPreview,
  composerReference,
  spaceManagement: suppliedManagement,
  accountApprovalSettings: suppliedApprovalSettings,
  invitationOrigin,
  accountId,
  origin,
  spaceId,
  agentId,
  groupId,
  groups: suppliedGroups,
  onNavigate,
  onOpenModels,
  onOpenTools,
  onNewConversation,
  onOpenExternal,
  modelCatalogKey,
  socket,
  feed,
  drafts,
}: AgentsWorkspaceProps) {
  const queryClient = useQueryClient();
  const client = useMemo(() => {
    const spaces = cachedSidebarReads(
      sourceClient.spaces,
      queryClient,
      origin,
      accountId,
      "spaces",
      ["list"],
      ["create"],
    );
    const notifications = sourceClient.notifications
      ? cachedSidebarReads(
          sourceClient.notifications,
          queryClient,
          origin,
          accountId,
          "notifications",
          ["list"],
        )
      : undefined;
    const routines = sourceClient.routines
      ? cachedSidebarReads(
          sourceClient.routines,
          queryClient,
          origin,
          accountId,
          "routines",
          ["list"],
          ["create", "update", "pause", "resume", "delete", "test", "rotateWebhookKey"],
        )
      : undefined;
    return new Proxy(sourceClient, {
      get(target, key, receiver) {
        if (key === "spaces") return spaces;
        if (key === "notifications") return notifications;
        if (key === "routines") return routines;
        return Reflect.get(target, key, receiver);
      },
    });
  }, [sourceClient, queryClient, origin, accountId]);
  const rawManagement = suppliedManagement ?? sourceClient.spaceManagement;
  const spaceManagement = useMemo(
    () =>
      rawManagement
        ? cachedSidebarReads(
            rawManagement,
            queryClient,
            origin,
            accountId,
            "membership",
            ["get", "members", "settings"],
            [
              "rename",
              "delete",
              "leave",
              "updateMemberRole",
              "removeMember",
              "acceptInvitation",
              "setApprovalOverride",
              "clearApprovalOverride",
            ],
          )
        : undefined,
    [rawManagement, queryClient, origin, accountId],
  );
  const accountApprovalSettings = suppliedApprovalSettings ?? sourceClient.accountApprovalSettings;
  const groups = suppliedGroups ?? sourceClient.groups;
  const t = useTranslations("agents");
  const store = useContext(SidebarStoreContext)!;
  const sidebarOpen = useWorkspaceSidebar((state) => state.open);
  const sidebarSheetOpen = useWorkspaceSidebar((state) => state.sheetOpen);
  const sidebarRoute = useWorkspaceSidebar((state) => state.route) || route;
  const inheritedCollapsed = useShellSidebarCollapsed();
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 767px)");
    const update = () => setNarrow(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  const sidebarCollapsed = renderShell ? !sidebarOpen || narrow : inheritedCollapsed;
  const agentFilterId = useId();
  const filterTrigger = useRef<HTMLButtonElement>(null);
  const firstAgentTrigger = useRef<HTMLButtonElement>(null);
  const filterInput = useRef<HTMLInputElement>(null);

  const setAgentsSectionOpen = useCallback(
    (value: boolean) => store.getState().setCollapsed("agents", !value),
    [store],
  );
  const agentFilterState = useWorkspaceSidebar((state) => state.agentFilter);
  const setAgentFilterState = useWorkspaceSidebar((state) => state.setAgentFilter);
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
  const ready = useSyncExternalStore(subscribeNothing, clientReady, serverNotReady);
  const sidebarSpaceId = useWorkspaceSidebar((state) => state.spaceId);
  const selectedAgentId = useWorkspaceSidebar((state) => state.agentId);
  const selectedGroupId = useWorkspaceSidebar((state) => state.groupId);
  const sidebarAgentId = sidebarRoute === "/agents" ? selectedAgentId : null;
  const sidebarGroupId = sidebarRoute === "/agents" ? selectedGroupId : null;
  const cacheKey = useCallback(
    (name: string, scope: string | null = null) =>
      workspaceQueryKey(origin, accountId, name, scope),
    [origin, accountId],
  );
  const spacesQuery = useQuery({
    refetchInterval: 30_000,
    queryKey: cacheKey("spaces"),
    queryFn: () => sourceClient.spaces.list({}),
    enabled: ready && !!accountId,
    staleTime: 30_000,
  });
  const directoryMemberships =
    queryClient.getQueryData<typeof spacesQuery.data>(cacheKey("spaces")) ??
    spacesQuery.data ??
    noMemberships;
  const requestedSpace = sidebarSpaceId ?? spaceId;
  const resolvedSpaceId =
    directoryMemberships.find((item) => item.space.id === requestedSpace)?.space.id ??
    directoryMemberships[0]?.space.id ??
    null;
  const scope = resolvedSpaceId ?? (spaceId ? spaceIdSchema.parse(spaceId) : null);
  const agentsQuery = useQuery({
    refetchInterval: 30_000,
    queryKey: cacheKey("agents", scope),
    queryFn: () => client.agents.list({ spaceId: scope!, limit: 100 }),
    enabled: ready && !!accountId && !!scope,
    staleTime: 30_000,
  });
  const modelsQuery = useQuery({
    queryKey: cacheKey("models", scope),
    queryFn: () => client.agents.models({ spaceId: scope! }),
    enabled: ready && !!accountId && !!scope,
    staleTime: 30_000,
  });
  const groupsQuery = useQuery({
    refetchInterval: 30_000,
    queryKey: cacheKey("groups", scope),
    queryFn: () => groups?.listGroups({ spaceId: scope!, limit: 100 }) ?? Promise.resolve([]),
    enabled: ready && !!accountId && !!scope,
    staleTime: 30_000,
  });
  const routinesQuery = useQuery({
    refetchInterval: 30_000,
    queryKey: cacheKey("routines", scope),
    queryFn: () =>
      sourceClient.routines?.list({ spaceId: scope!, limit: 100 }) ?? Promise.resolve([]),
    enabled: ready && !!accountId && !!scope && !!sourceClient.routines,
    staleTime: 30_000,
  });
  const page = useMemo<AgentsPageState>(() => {
    const initial = applySpaces(
      createAgentsPageState(),
      directoryMemberships,
      requestedSpace ?? undefined,
    );
    if (!initial.spaceId) return initial;
    const selection = parseAgentSelection({ agentId: selectedAgentId, groupId: selectedGroupId });
    const next = applyAgents(
      initial,
      initial.spaceId,
      agentsQuery.data ?? [],
      route === "/agents" ? selection.agentId : undefined,
    );
    return {
      ...applyGroups(
        next,
        initial.spaceId,
        (groupsQuery.data ?? []).map((conversation) => ({
          conversation,
          agents: next.agents
            .filter((entry) => conversation.agentIds?.includes(entry.agent.id))
            .map((entry) => entry.agent),
        })),
        route === "/agents" ? selection.groupId : undefined,
      ),
      models: modelsQuery.data ?? [],
    };
  }, [
    directoryMemberships,
    requestedSpace,
    agentsQuery.data,
    groupsQuery.data,
    modelsQuery.data,
    route,
    selectedAgentId,
    selectedGroupId,
  ]);
  const pageRef = useRef(page);
  useLayoutEffect(() => {
    pageRef.current = page;
  }, [page]);
  const setPage = useCallback(
    (update: typeof page | ((previous: typeof page) => typeof page)) => {
      const previous = pageRef.current;
      const next = typeof update === "function" ? update(previous) : update;
      pageRef.current = next;
      if (previous.spaces !== next.spaces)
        queryClient.setQueryData(cacheKey("spaces"), next.spaces);
      if (next.spaceId && next.spaceId === previous.spaceId) {
        if (previous.agents !== next.agents)
          queryClient.setQueryData(cacheKey("agents", next.spaceId), next.agents);
        if (previous.groups !== next.groups)
          queryClient.setQueryData(
            cacheKey("groups", next.spaceId),
            next.groups?.map((entry) => entry.conversation) ?? [],
          );
        if (previous.models !== next.models)
          queryClient.setQueryData(cacheKey("models", next.spaceId), next.models);
      }
      // An unrelated read can finish before the selected Agent/group directory.
      // Keep the route's pending selection until an update actually changes it.
      if (
        previous.spaceId !== next.spaceId ||
        previous.agentId !== next.agentId ||
        previous.groupId !== next.groupId
      )
        store
          .getState()
          .select({ spaceId: next.spaceId, agentId: next.agentId, groupId: next.groupId ?? null });
    },
    [cacheKey, queryClient, store],
  );
  useLayoutEffect(() => {
    store.getState().select({
      spaceId: spaceId ?? store.getState().spaceId,
      agentId: agentId ?? null,
      groupId: groupId ?? null,
    });
    store.getState().setRoute(route);
  }, [store, spaceId, agentId, groupId, route]);
  useLayoutEffect(() => {
    const state = store.getState();
    // Route synchronization above may have changed the store after this render.
    // Only initialize an unselected workspace from the discovered membership list.
    if (spacesQuery.data && state.spaceId === sidebarSpaceId && !state.spaceId)
      state.select({ spaceId: resolvedSpaceId, agentId: state.agentId, groupId: state.groupId });
  }, [store, spacesQuery.data, resolvedSpaceId, sidebarSpaceId]);
  useEffect(() => {
    if (!ready || !accountId || !spaceId) return;
    const cached = queryClient.getQueryData<Awaited<ReturnType<typeof sourceClient.spaces.list>>>(
      cacheKey("spaces"),
    );
    if (!cached || cached.some((entry) => entry.space.id === spaceId)) return;
    // Invitation acceptance can navigate into a Space absent from the retained
    // directory. Confirm fresh membership before replacing that route selection.
    let active = true;
    void queryClient
      .fetchQuery({
        queryKey: cacheKey("spaces"),
        queryFn: () => sourceClient.spaces.list({}),
        staleTime: 0,
      })
      .then((spaces) => {
        if (
          !active ||
          store.getState().spaceId !== spaceId ||
          spaces.some((entry) => entry.space.id === spaceId)
        )
          return;
        store.getState().select({ spaceId: spaces[0]?.space.id ?? null });
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [ready, accountId, spaceId, queryClient, cacheKey, sourceClient.spaces, store]);

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
    if (sidebarCollapsed || !filterOpen) return page.agents;
    const query = agentFilter.trim().toLocaleLowerCase();
    return page.agents.filter((entry) => entry.agent.name.toLocaleLowerCase().includes(query));
  }, [agentFilter, filterOpen, sidebarCollapsed, page.agents]);
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
  const spacesLoading = spacesQuery.isPending;
  const agentsLoading = Boolean(
    scope && (agentsQuery.isPending || modelsQuery.isPending || groupsQuery.isPending),
  );
  const loading = spacesLoading || agentsLoading;
  const [actionFailed, setFailed] = useState(false);
  const failed =
    actionFailed ||
    spacesQuery.isError ||
    agentsQuery.isError ||
    modelsQuery.isError ||
    groupsQuery.isError;

  const [protectedInputKey, setProtectedInputKey] = useState("");
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
  const participantsTrigger = useRef<HTMLButtonElement | null>(null);
  const participantsRequest = useRef(0);
  const [deleting, setDeleting] = useState<string | null>(null);
  const deletingRef = useRef<string | null>(null);
  const confirmation = useConfirmation();
  const eventSocket = useMemo(() => socket ?? browserConversationSocket(origin), [socket, origin]);
  const navigateSelection = useRef(onNavigate);
  const sessionEnded = useRef(onSessionEnded);
  useLayoutEffect(() => {
    sessionEnded.current = onSessionEnded;
    navigateSelection.current = onNavigate;
  }, [onSessionEnded, onNavigate]);
  useEffect(() => {
    if (ensureSpaceSearch && accountId && resolvedSpaceId && !spaceId) {
      navigateSelection.current?.(
        {
          spaceId: resolvedSpaceId,
          ...(agentId ? { agentId } : {}),
          ...(groupId ? { groupId } : {}),
        },
        true,
      );
    }
  }, [ensureSpaceSearch, accountId, resolvedSpaceId, spaceId, agentId, groupId]);
  const conversationFeed = useMemo<ConversationFeedPort>(() => {
    const source = feed ?? createConversationFeed(origin);
    return {
      subscribe(selection, callbacks) {
        return source.subscribe(selection, {
          ...callbacks,
          onClose(code, reason, retryAfterMs) {
            callbacks.onClose(code, reason, retryAfterMs);
            if (code === 4001) sessionEnded.current?.();
          },
        });
      },
    };
  }, [feed, origin]);
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
  function refreshDirectory() {
    setFailed(false);
    void queryClient.invalidateQueries({ queryKey: ["workspace", origin, accountId] });
  }
  useEffect(() => {
    if (scope) void queryClient.invalidateQueries({ queryKey: cacheKey("models", scope) });
  }, [modelCatalogKey, scope, queryClient, cacheKey]);

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
        sessionEnded.current?.();
        return;
      }
      // Close the old conversation immediately, before discovery can finish.
      const fallback = applySpaces(
        current.current,
        current.current.spaces.filter(({ space }) => space.id !== selectedSpace),
      );
      current.current = fallback;
      setPage(fallback);
      if (fallback.spaceId) navigateSelection.current?.({ spaceId: fallback.spaceId });
      void queryClient.invalidateQueries({ queryKey: cacheKey("spaces"), refetchType: "none" });
      void client.spaces
        .list({})
        .then((spaces) => {
          if (!mounted.current || revision !== navigationRevision.current) return;
          const reconciled = applySpaces(current.current, spaces);
          current.current = reconciled;
          setPage(reconciled);
          if (reconciled.spaceId && reconciled.spaceId !== fallback.spaceId)
            navigateSelection.current?.({ spaceId: reconciled.spaceId });
        })
        .catch(() => {});
    },
    [client, setPage, cacheKey, queryClient],
  );
  useEffect(() => {
    if (!management || !page.spaceId) return;
    const selectedSpace = page.spaceId;
    const live = new SpaceLiveController({
      spaceId: selectedSpace,
      accountId,
      socket: eventSocket,
      list: () =>
        queryClient.fetchQuery({
          queryKey: cacheKey("spaces"),
          queryFn: () => sourceClient.spaces.list({}),
          staleTime: 0,
        }),
      onMemberships(spaces) {
        if (mounted.current) setPage((state) => applySpaces(state, spaces));
      },
      async onEvent(event) {
        await queryClient.invalidateQueries({
          predicate: (query) =>
            query.queryKey[0] === "workspace" &&
            query.queryKey[1] === origin &&
            query.queryKey[2] === accountId &&
            query.queryKey[3] === event.spaceId &&
            String(query.queryKey[4]).startsWith("membership."),
          refetchType: "none",
        });
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
  }, [
    management,
    page.spaceId,
    accountId,
    eventSocket,
    client,
    exitSpace,
    pageListeners,
    cacheKey,
    setPage,
    sourceClient.spaces,
    queryClient,
    origin,
  ]);

  const rememberLastActivity = useCallback(
    (at: string, conversationId: string) => {
      setPage((state) => {
        const selected = state.agents.find((entry) => entry.conversation.id === conversationId);
        const selectedGroup = state.groups?.find(
          (entry) => entry.conversation.id === conversationId,
        );
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
    },
    [setPage],
  );
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
  const loadingConversation =
    !renderWorkspace && loading && !failed && Boolean(agentId || groupId || selected);
  const workspaceInputs =
    !loading && !failed && (renderWorkspace || (!selected && !agentId && !groupId));
  const rowButtons = useRef(new Map<string, HTMLElement>());
  const agentListActions = useRef({
    choose: (item: AgentConversationView) => chooseAgent(item),
    menu: (item: AgentConversationView) => agentMenu(item),
  });
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
    navigateSelection.current?.({ spaceId: value });
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
    navigateSelection.current?.({ spaceId: item.agent.spaceId, agentId: item.agent.id });
  }
  function chooseGroup(item: GroupConversationView) {
    ++navigationRevision.current;
    closeParticipants();
    const nextPage = selectGroup(current.current, item.conversation.id);
    current.current = nextPage;
    setPage(nextPage);
    navigateSelection.current?.({
      spaceId: item.conversation.spaceId,
      groupId: item.conversation.id,
    });
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
    navigateSelection.current?.({ spaceId: selectedSpace, groupId: conversation.id });
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
    if (wasSelected) navigateSelection.current?.({ spaceId: group.conversation.spaceId });
  }
  function back() {
    setAgentFilter("", false);
    setAgentsSectionOpen(true);
    ++navigationRevision.current;
    current.current = { ...current.current, agentId: null, groupId: null };
    setPage(current.current);
    if (page.spaceId) navigateSelection.current?.({ spaceId: page.spaceId });
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
    navigateSelection.current?.({ spaceId: created.space.id });
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
    navigateSelection.current?.({ spaceId: selectedSpace, agentId: saved.agent.id });
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
      if (wasSelected) navigateSelection.current?.({ spaceId: item.agent.spaceId });
      if (groups) refreshDirectory();
    } catch {
      if (mounted.current) setFailed(true);
    } finally {
      deletingRef.current = null;
      if (mounted.current) setDeleting(null);
    }
  }

  const recentCandidates = [
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
  const recentOrder = useWorkspaceSidebar((state) => state.recentOrder);
  const candidateKey = JSON.stringify(recentCandidates.map((entry) => `${entry.kind}:${entry.id}`));
  useEffect(() => {
    const candidateIds: string[] = JSON.parse(candidateKey);
    const ids = [
      ...recentOrder.filter((id) => candidateIds.includes(id)),
      ...candidateIds.filter((id) => !recentOrder.includes(id)),
    ];
    if (ids.join() !== recentOrder.join()) store.getState().setRecentOrder(ids);
  }, [candidateKey, recentOrder, store]);
  const recent = [...recentCandidates].sort((left, right) => {
    const a = recentOrder.indexOf(`${left.kind}:${left.id}`);
    const b = recentOrder.indexOf(`${right.kind}:${right.id}`);
    return (a < 0 ? 30 : a) - (b < 0 ? 30 : b);
  });

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
    "min-h-9 w-full min-w-0 justify-start gap-2 rounded-lg px-2 text-sm font-normal aria-[current=page]:bg-selected aria-[current=page]:font-medium aria-[current=page]:text-selected-text aria-[current=page]:hover:bg-selected aria-[current=page]:hover:text-selected-text pointer-coarse:min-h-11 dark:aria-[current=page]:hover:bg-selected sidebar-icon:justify-center sidebar-icon:px-0";
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
          <WorkspaceNavigationButton
            ref={spaceTrigger}
            size="sm"
            variant="ghost"
            aria-label={t("space")}
            disabled={spacesLoading}
            className={rowClass}
          />
        }
      >
        <FolderIcon data-icon="inline-start" aria-hidden="true" className="size-5" />
        <span className="min-w-0 flex-1 truncate text-left sidebar-icon:hidden">
          {membership?.space.name ?? <Skeleton className="h-4 w-24" />}
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
  useLayoutEffect(() => {
    agentListActions.current = { choose: chooseAgent, menu: agentMenu };
  });
  const sidebar: WorkspaceSidebarSlots = {
    primaryAction: (
      <>
        <WorkspaceNavigationButton
          variant="ghost"
          disabled={!page.spaceId || loading || page.agents.length === 0}
          className={cn(rowClass, "font-medium")}
          aria-label={t("workspaceSidebar.new")}
          onClick={() => {
            if (page.spaceId && onNewConversation) onNewConversation(page.spaceId);
            else back();
          }}
        >
          <PlusIcon data-icon="inline-start" aria-hidden="true" className="size-5" />
          <span className="sidebar-icon:hidden">{t("workspaceSidebar.new")}</span>
        </WorkspaceNavigationButton>
      </>
    ),
    navigation: (
      <>
        <WorkspaceNavigationButton
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
          <ClockIcon data-icon="inline-start" aria-hidden="true" className="size-5" />
          <span className="min-w-0 flex-1 truncate text-left sidebar-icon:hidden">
            {t("routines")}
          </span>
          <span className="w-6 shrink-0 text-right text-xs tabular-nums text-muted-foreground sidebar-icon:hidden">
            {routinesQuery.data?.length || null}
          </span>
        </WorkspaceNavigationButton>
        {routinesDisabledReason && !loading && (
          <p id={routinesReasonId} className={cn("sr-only", loading && "sr-only")}>
            {routinesDisabledReason}
          </p>
        )}
      </>
    ),
    directory: (
      <>
        <div className="flex min-w-0 flex-col gap-2">
          {onOpenTools && (
            <WorkspaceNavigationButton
              variant="ghost"
              className={rowClass}
              onClick={onOpenTools}
              aria-label={t("workspaceSidebar.tools")}
            >
              <AdjustmentsIcon data-icon="inline-start" aria-hidden="true" className="size-5" />
              <span className="truncate sidebar-icon:hidden">{t("workspaceSidebar.tools")}</span>
            </WorkspaceNavigationButton>
          )}
          {(page.spaceId || loading) && (
            <>
              <DirectorySection
                section="agents"
                title={t("title")}
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
                {loading && !failed && page.agents.length === 0 && (
                  <div
                    aria-hidden="true"
                    className="flex h-9 items-center gap-2 px-2 sidebar-icon:justify-center sidebar-icon:px-0"
                  >
                    <Skeleton className="size-4 shrink-0" />
                    <Skeleton className="h-3 w-20 sidebar-icon:hidden" />
                  </div>
                )}
                {!loading && page.agents.length === 0 && !homeCreateAction && (
                  <div className="mx-1 flex flex-col gap-1 rounded-xl border border-border/60 bg-background/70 p-2 sidebar-icon:border-0 sidebar-icon:bg-transparent sidebar-icon:p-0">
                    <p className="truncate text-xs leading-5 text-muted-foreground sidebar-icon:hidden">
                      {t("workspaceSidebar.emptyAgents")}
                    </p>
                    <WorkspaceNavigationButton
                      size="sm"
                      variant="secondary"
                      onClick={createAgent}
                      ref={firstAgentTrigger}
                      aria-label={t("createAgent")}
                      className="w-full min-w-0 sidebar-icon:px-0"
                    >
                      <PlusIcon data-icon="inline-start" aria-hidden="true" />
                      <span className="truncate sidebar-icon:hidden">{t("createAgent")}</span>
                    </WorkspaceNavigationButton>
                  </div>
                )}
                {page.agents.length > 0 && (
                  <AgentDirectoryList
                    entries={filteredAgents}
                    selectedId={sidebarAgentId}
                    rowClass={rowClass}
                    rowButtons={rowButtons}
                    actions={agentListActions}
                  />
                )}
                {page.agents.length > 0 && filteredAgents.length === 0 && (
                  <p role="status" className="px-2 py-2 text-xs text-muted-foreground">
                    {t("workspaceSidebar.noMatches")}
                  </p>
                )}
              </DirectorySection>
              {groups && (
                <DirectorySection
                  section="groups"
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
                        <WorkspaceNavigationButton
                          ref={(node) => {
                            if (node) rowButtons.current.set(item.conversation.id, node);
                            else rowButtons.current.delete(item.conversation.id);
                          }}
                          size="sm"
                          variant="ghost"
                          className={rowClass}
                          aria-label={item.conversation.name}
                          title={item.conversation.name}
                          aria-current={
                            item.conversation.id === sidebarGroupId ? "page" : undefined
                          }
                          onClick={() => chooseGroup(item)}
                        >
                          <UserCircleIcon
                            data-icon="inline-start"
                            aria-hidden="true"
                            className="size-5"
                          />
                          <span className="min-w-0 flex-1 truncate text-left sidebar-icon:hidden">
                            {item.conversation.name}
                          </span>
                        </WorkspaceNavigationButton>
                      </li>
                    ))}
                  </ul>
                  {groupsByActivity.length === 0 && (
                    <WorkspaceNavigationButton
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
                    </WorkspaceNavigationButton>
                  )}
                </DirectorySection>
              )}
              <DirectorySection section="space" title={t("space")}>
                {spaceControl}
              </DirectorySection>
              {(page.spaceId || loading) && (
                <DirectorySection section="recent" title={t("workspaceSidebar.recent")}>
                  <ul className="flex min-w-0 flex-col gap-0.5">
                    {recent.map((entry) => (
                      <li
                        key={`${entry.kind}:${entry.id}`}
                        className="group/directory-row flex min-w-0 items-center rounded-lg"
                      >
                        <WorkspaceNavigationButton
                          size="sm"
                          variant="ghost"
                          className={cn(rowClass, "flex-1 aria-[current=page]:text-selected-text")}
                          aria-label={t("workspaceSidebar.openRecent", { name: entry.name })}
                          title={entry.name}
                          onClick={() => {
                            if (entry.kind === "agent") chooseAgent(entry.item);
                            else chooseGroup(entry.item);
                          }}
                        >
                          <HistoryIcon
                            data-icon="inline-start"
                            aria-hidden="true"
                            className="size-5"
                          />
                          <span className="min-w-0 flex-1 truncate text-left sidebar-icon:hidden">
                            {entry.name}
                          </span>
                        </WorkspaceNavigationButton>
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
              )}
            </>
          )}
        </div>
      </>
    ),
    footer: (
      <>
        <div className="h-14 pointer-coarse:h-16 sidebar-icon:h-9 pointer-coarse:sidebar-icon:h-11">
          <div className="px-2 pb-1 text-xs text-muted-foreground sidebar-icon:hidden">
            {membership ? (
              t(`spaceSettings.roles.${membership.member.role}`)
            ) : (
              <Skeleton className="h-3 w-12" />
            )}
          </div>
          {membership?.member.role === "owner" && management && (
            <WorkspaceNavigationButton
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
            </WorkspaceNavigationButton>
          )}
        </div>
      </>
    ),
    actions: (
      <>
        {accountId && client.notifications ? (
          <NotificationsBell
            port={client.notifications}
            protectedInputSpaceId={workspaceInputs ? page.spaceId : undefined}
            onProtectedInputsChange={setProtectedInputKey}
            onOpen={(item) =>
              void openNotification(item).catch(() => setSpaceNotice("unavailable"))
            }
          />
        ) : (
          <Skeleton className="size-7" />
        )}
      </>
    ),
    spaceId: page.spaceId ?? spaceId,
    activeRoute: sidebarRoute,
    open: sidebarOpen,
    sheetOpen: sidebarSheetOpen,
    onSheetOpenChange: store.getState().setSheetOpen,
    onOpenChange: store.getState().setOpen,
    getScrollTop: () => store.getState().scrollTop,
    onScrollTopChange: store.getState().setScrollTop,
  };
  const content = (
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-clip">
      {!children && !renderWorkspace && !selected && !loadingConversation && (
        <ShellToolbar>
          <span className="sr-only">{t("title")}</span>
        </ShellToolbar>
      )}
      {!renderShell && (
        <>
          <ShellPrimaryAction>{sidebar.primaryAction}</ShellPrimaryAction>
          <ShellSidebarNavigation>{sidebar.navigation}</ShellSidebarNavigation>
          <ShellSidebarDirectory>{sidebar.directory}</ShellSidebarDirectory>
          <ShellSidebarFooter>{sidebar.footer}</ShellSidebarFooter>
          <ShellSidebarActions>{sidebar.actions}</ShellSidebarActions>
        </>
      )}
      {children ?? (
        <>
          {spaceNotice && (
            <p role="status" className="px-5 py-2 text-sm text-muted-foreground">
              {t(spaceExitKeys[spaceNotice])}
            </p>
          )}
          {failed && (
            <Alert variant="destructive">
              <AlertDescription>{t("directoryError")}</AlertDescription>
              <AlertAction>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={loading}
                  onClick={() => refreshDirectory()}
                >
                  {t("refresh")}
                </Button>
              </AlertAction>
            </Alert>
          )}
          {loading &&
            !failed &&
            (workspaceLoading ??
              (loadingConversation ? (
                <ConversationLoading label={t("loading")} />
              ) : (
                <div className={conversationColumn}>
                  <LoadingState label={t("loading")} />
                </div>
              )))}
          {client.protectedInputs && page.spaceId && workspaceInputs && (
            <ProtectedInputs
              key={page.spaceId}
              port={client.protectedInputs}
              spaceId={page.spaceId}
              refreshKey={protectedInputKey}
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
          {renderWorkspace && page.spaceId && !loading && !failed && (
            <WorkspaceContextProvider
              value={{
                spaceId: page.spaceId,
                agents: page.agents.map((entry) => entry.agent),
                accountNames: Object.fromEntries(
                  (managementState?.members ?? []).map((member) => [member.accountId, member.name]),
                ),
                subscribe: subscribePages,
              }}
            >
              {renderWorkspace({
                spaceId: page.spaceId,
                agents: page.agents.map((entry) => entry.agent),
                accountNames: Object.fromEntries(
                  (managementState?.members ?? []).map((member) => [member.accountId, member.name]),
                ),
                subscribe: subscribePages,
              })}
            </WorkspaceContextProvider>
          )}
          {!renderWorkspace &&
            !loading &&
            !failed &&
            page.spaceId &&
            (selected ? (
              <AgentConversation
                key={JSON.stringify([accountId, origin, selected.conversation.id])}
                item={selected}
                runReference={
                  runReference?.conversationId === selected.conversation.id
                    ? runReference
                    : undefined
                }
                onBack={back}
                onEditAgent={() => edit(selected)}
                onDeleteAgent={selectedGroup ? undefined : () => void removeAgent(selected)}
                onOpenPage={onOpenPage}
                pageLinkOrigin={invitationOrigin ?? origin}
                pageResultPreview={pageResultPreview}
                onOpenExternal={onOpenExternal}
                composerReference={composerReference}
                subscribePages={subscribePages}
                group={selectedGroup}
                agentDirectory={page.agents.map((entry) => entry.agent)}
                onManageParticipants={selectedGroup && groups ? openParticipants : undefined}
                participantsTrigger={participantsTrigger}
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
                feed={conversationFeed}
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
                feed={conversationFeed}
                drafts={draftStore}
                origin={origin}
                accountId={accountId}
              />
            ))}
        </>
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
        <SpaceSettingsDialog
          open={spaceSettingsOpen}
          onClose={() => {
            management.clearIssuedInvitation();
            setSpaceSettingsOpen(false);
          }}
          title={t("spaceSettings.title")}
          closeLabel={t("close")}
          finalFocus={() => spaceTrigger.current ?? false}
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
        </SpaceSettingsDialog>
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
  const renderedContent =
    !accountId && renderWorkspace
      ? renderWorkspace({ spaceId: "", agents: [], accountNames: {}, subscribe: subscribePages })
      : content;
  return renderShell ? renderShell(sidebar, renderedContent) : renderedContent;
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

/** Every feature-owned rail destination retains a name on hover and keyboard focus. */
function WorkspaceNavigationButton({ children, ...props }: ComponentProps<typeof Button>) {
  const label = props["aria-label"] ?? props.title;
  return (
    <Tooltip disabled={props.disabled}>
      <TooltipTrigger
        data-slot="button"
        render={<Button {...props} title={props.title ?? label} />}
      >
        {children}
      </TooltipTrigger>
      <TooltipContent role="tooltip" side="right">
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

function DirectorySection({
  section,
  title,
  action,
  children,
  expanded,
  onExpandedChange,
}: {
  section: import("../model/sidebar.js").SidebarSection;
  title: string;
  action?: ReactNode;
  children: ReactNode;
  expanded?: boolean;
  onExpandedChange?: (open: boolean) => void;
}) {
  const collapsed = useShellSidebarCollapsed();
  const store = useContext(SidebarStoreContext)!;
  const scroll = useRef<HTMLDivElement>(null);
  const t = useTranslations("agents");
  const localOpen = useWorkspaceSidebar((state) => !state.collapsed[section]);
  const setCollapsed = useWorkspaceSidebar((state) => state.setCollapsed);
  const open = expanded ?? localOpen;
  const setOpen = onExpandedChange ?? ((value: boolean) => setCollapsed(section, !value));
  useLayoutEffect(() => {
    if (scroll.current) scroll.current.scrollTop = store.getState().sectionScroll[section] ?? 0;
  }, [store, section, open]);
  return (
    <Collapsible
      role="region"
      aria-label={title}
      open={collapsed || open}
      onOpenChange={setOpen}
      className="group/directory-section min-w-0"
    >
      {!collapsed && (
        <div className="mb-0.5 flex min-w-0 items-center gap-1 px-2">
          <CollapsibleTrigger
            aria-label={t(open ? "workspaceSidebar.collapse" : "workspaceSidebar.expand", {
              name: title,
            })}
            className="flex min-h-7 min-w-0 flex-1 items-center gap-1.5 rounded-md text-left text-xs font-medium text-muted-foreground pointer-coarse:min-h-11 outline-none hover:text-foreground focus-visible:focus-control"
          >
            <ChevronDownIcon
              aria-hidden="true"
              className="size-3 shrink-0 group-data-closed/collapsible:-rotate-90 motion-safe:transition-transform"
            />
            <span className="min-w-0 flex-1 truncate">{title}</span>
          </CollapsibleTrigger>
          {action && (
            <span className="opacity-0 group-hover/directory-section:opacity-100 group-focus-within/directory-section:opacity-100 pointer-coarse:opacity-100">
              {action}
            </span>
          )}
        </div>
      )}
      {collapsed && action && <div className="flex justify-center">{action}</div>}
      <CollapsibleContent>
        <div
          ref={scroll}
          onScroll={(event) =>
            store.getState().setSectionScroll(section, event.currentTarget.scrollTop)
          }
          className={cn(
            "overflow-y-auto overflow-x-hidden overscroll-contain [scrollbar-gutter:stable]",
            section === "agents" && "h-18 pointer-coarse:h-23",
            section === "groups" && "h-9 pointer-coarse:h-11",
            section === "space" && "h-9 pointer-coarse:h-11",
            section === "recent" && "h-18 pointer-coarse:h-23",
          )}
        >
          {children}
        </div>
      </CollapsibleContent>
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

const noMemberships: import("../model/port.js").SpaceMembership[] = [];
function clientReady() {
  return true;
}
function serverNotReady() {
  return false;
}
