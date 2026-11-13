import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
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
import { MoreHorizontalIcon } from "@raypx/icons/more-horizontal";
import type { AgentInput } from "@raypx/core/agents";
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
import { AgentForm } from "./agent-form.js";
import { SpaceForm } from "./space-form.js";
import { AgentConversation } from "./conversation.js";
import { browserConversationDrafts, browserConversationSocket } from "./browser-ports.js";
import { useTranslations } from "./i18n.js";

export interface AgentsWorkspaceProps {
  client: AgentsWorkspacePort;
  accountId: string;
  origin: string;
  spaceId?: string;
  agentId?: string;
  onOpenModels?: (() => void) | undefined;
  modelCatalogKey?: string | undefined;
  onNavigate?: (selection: { spaceId: string; agentId?: string }) => void;
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
  accountId,
  origin,
  spaceId,
  agentId,
  onNavigate,
  onOpenModels,
  modelCatalogKey,
  socket,
  drafts,
}: AgentsWorkspaceProps) {
  const t = useTranslations("agents");
  const [page, setPage] = useState(createAgentsPageState);
  const current = useRef(page);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
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
  const [newSpace, setNewSpace] = useState(false);
  const [form, setForm] = useState<"new" | AgentConversationView | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const deletingRef = useRef<string | null>(null);
  const confirmation = useConfirmation();
  const eventSocket = useMemo(() => socket ?? browserConversationSocket(origin), [socket, origin]);
  const draftStore = useMemo(() => drafts ?? browserConversationDrafts(), [drafts]);
  const conversationPort = useMemo<ConversationPort>(
    () => ({
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
    ])
      .then(([agents, models]) => {
        if (!cancelled)
          setPage((state) => {
            if (state.spaceId !== selected) return state;
            return { ...applyAgents(state, selected, agents, agentId), models };
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
  }, [client, page.spaceId, agentId, refresh, modelCatalogKey]);

  const activityRefresh = useRef(0);
  async function refreshSpaceActivity() {
    const selectedSpace = current.current.spaceId;
    if (!selectedSpace) return;
    const generation = ++activityRefresh.current;
    const conversations = current.current.agents.slice(0, 100);
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
          const snapshot = await conversationPort.snapshot({
            spaceId: item.agent.spaceId,
            conversationId: item.conversation.id,
          });
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

  const selected = page.agents.find((item) => item.agent.id === page.agentId);
  const rowButtons = useRef(new Map<string, HTMLElement>());
  const previousSelection = useRef<string | null>(null);
  useLayoutEffect(() => {
    if (!selected && previousSelection.current)
      rowButtons.current.get(previousSelection.current)?.focus();
    previousSelection.current = selected?.agent.id ?? null;
  }, [selected]);
  function chooseSpace(value: string) {
    setForm(null);
    setPage((state) => selectSpace(state, value));
    onNavigate?.({ spaceId: value });
  }
  function chooseAgent(item: AgentConversationView) {
    setPage((state) => selectAgent(state, item.agent.id));
    onNavigate?.({ spaceId: item.agent.spaceId, agentId: item.agent.id });
  }
  function back() {
    setPage((state) => ({ ...state, agentId: null }));
    if (page.spaceId) onNavigate?.({ spaceId: page.spaceId });
  }
  async function createSpace(name: string) {
    const membership = await client.spaces.create({ name });
    if (!mounted.current) return;
    setPage((state) => applySpaces(state, [...state.spaces, membership], membership.space.id));
    setNewSpace(false);
    onNavigate?.({ spaceId: membership.space.id });
  }
  async function saveAgent(input: AgentInput) {
    const selectedSpace = page.spaceId;
    if (!selectedSpace || !form) return;
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
      agents: [...state.agents.filter((item) => item.agent.id !== saved.agent.id), saved],
      agentId: saved.agent.id,
    }));
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
    } catch {
      if (mounted.current) setFailed(true);
    } finally {
      deletingRef.current = null;
      if (mounted.current) setDeleting(null);
    }
  }

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col gap-4 overflow-clip">
      {!selected && (
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
                      <DropdownMenuRadioItem key={space.id} value={space.id}>
                        {space.name}
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                  <DropdownMenuSeparator />
                </>
              )}
              <DropdownMenuGroup>
                <DropdownMenuItem onClick={() => setNewSpace(true)}>
                  <PlusIcon aria-hidden="true" />
                  {t("newSpace")}
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </ShellSidebarHeader>
      {page.agents.length > 0 && (
        <ShellPrimaryAction>
          <Button
            disabled={!page.spaceId || loading}
            onClick={() => setForm("new")}
            className="w-full min-w-0 sidebar-icon:px-0"
            aria-label={t("newAgent")}
            title={t("newAgent")}
          >
            <AgentIcon data-icon="inline-start" aria-hidden="true" />
            <span className="truncate sidebar-icon:hidden">{t("newAgent")}</span>
          </Button>
        </ShellPrimaryAction>
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
      {!loading && !failed && page.spaceId && page.agents.length === 0 && (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <AgentIcon aria-hidden="true" />
            </EmptyMedia>
            <EmptyTitle>{t("noAgents")}</EmptyTitle>
          </EmptyHeader>
          <Button onClick={() => setForm("new")}>{t("newAgent")}</Button>
        </Empty>
      )}
      {page.agents.length > 0 && (
        <div className="flex min-h-0 min-w-0 flex-1 gap-6 overflow-clip">
          <aside
            aria-label={t("title")}
            className={cn(
              "min-h-0 min-w-0 flex-col overflow-x-hidden overflow-y-auto overscroll-contain @3xl/main:flex @3xl/main:w-72 @3xl/main:shrink-0",
              selected ? "hidden" : "flex w-full",
            )}
          >
            <ul className="flex min-w-0 flex-col gap-1">
              {page.agents.map((item) => (
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
                        <DropdownMenuItem onClick={() => setForm(item)}>
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
      {newSpace && <SpaceForm onSave={createSpace} onClose={() => setNewSpace(false)} />}
      {form && (
        <AgentForm
          initial={form === "new" ? null : form.agent}
          models={page.models}
          onSave={saveAgent}
          onClose={() => setForm(null)}
          onOpenModels={
            onOpenModels
              ? () => {
                  setForm(null);
                  onOpenModels();
                }
              : undefined
          }
        />
      )}
      {confirmation.dialog}
    </div>
  );
}
