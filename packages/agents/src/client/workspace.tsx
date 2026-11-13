import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { AgentInput } from "@raypx/core/agents";
import { Button } from "@raypx/ui/components/ui/button";
import { Field, FieldLabel } from "@raypx/ui/components/ui/field";
import { IconButton } from "@raypx/ui/icon-button";
import { SelectField } from "@raypx/ui/select-field";
import { useConfirmation } from "@raypx/ui/confirmation";
import { AgentIcon } from "@raypx/icons/agent";
import { ArrowLeftIcon } from "@raypx/icons/arrow-left";
import { DeleteIcon } from "@raypx/icons/delete";
import { EditIcon } from "@raypx/icons/edit";
import { PlusIcon } from "@raypx/icons/plus";
import { RefreshIcon } from "@raypx/icons/refresh";
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
  type ConversationSocketPort,
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
  socket,
  drafts,
}: AgentsWorkspaceProps) {
  const t = useTranslations("agents");
  const id = useId();
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
  }, [client, page.spaceId, agentId, refresh]);

  const selected = page.agents.find((item) => item.agent.id === page.agentId);
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
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-4">
      <header className="flex min-w-0 flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-medium">{t("title")}</h1>
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          {page.spaces.length > 1 && (
            <Field orientation="horizontal" className="w-auto min-w-0">
              <FieldLabel htmlFor={id} className="sr-only">
                {t("space")}
              </FieldLabel>
              <SelectField
                id={id}
                value={page.spaceId ?? ""}
                options={page.spaces.map(({ space }) => ({ value: space.id, label: space.name }))}
                className="max-w-64"
                onValueChange={chooseSpace}
              />
            </Field>
          )}
          <IconButton label={t("newSpace")} onClick={() => setNewSpace(true)}>
            <PlusIcon aria-hidden="true" />
          </IconButton>
          <IconButton
            label={t("refresh")}
            disabled={loading}
            onClick={() => setRefresh((value) => value + 1)}
          >
            <RefreshIcon aria-hidden="true" />
          </IconButton>
          <Button disabled={!page.spaceId || loading} onClick={() => setForm("new")}>
            <AgentIcon data-icon="inline-start" aria-hidden="true" />
            {t("newAgent")}
          </Button>
        </div>
      </header>
      {failed && (
        <p role="alert" className="text-sm text-destructive-text">
          {t("directoryError")}
        </p>
      )}
      {loading && (
        <p role="status" className="text-sm text-muted-foreground">
          {t("connecting")}
        </p>
      )}
      <div className="flex min-h-0 min-w-0 flex-1 gap-6">
        <aside
          aria-label={t("title")}
          className={`min-w-0 shrink-0 flex-col gap-2 md:flex md:w-56 ${selected ? "hidden" : "flex w-full"}`}
        >
          {!loading && page.agents.length === 0 && (
            <p className="text-sm text-muted-foreground">{t("noAgents")}</p>
          )}
          <ul className="flex min-w-0 flex-col gap-1">
            {page.agents.map((item) => (
              <li key={item.agent.id} className="flex min-w-0 items-start gap-1 rounded-lg">
                <Button
                  variant={item.agent.id === page.agentId ? "secondary" : "ghost"}
                  className="h-auto min-h-9 min-w-0 flex-1 justify-start py-2 text-left whitespace-normal wrap-anywhere"
                  aria-current={item.agent.id === page.agentId ? "page" : undefined}
                  onClick={() => chooseAgent(item)}
                >
                  <AgentIcon data-icon="inline-start" aria-hidden="true" />
                  <span className="min-w-0 wrap-anywhere">{item.agent.name}</span>
                </Button>
                <IconButton size="icon-sm" label={t("editAgent")} onClick={() => setForm(item)}>
                  <EditIcon aria-hidden="true" />
                </IconButton>
                <IconButton
                  size="icon-sm"
                  label={t("deleteAgent")}
                  disabled={deleting !== null}
                  onClick={() => void removeAgent(item)}
                >
                  <DeleteIcon aria-hidden="true" />
                </IconButton>
              </li>
            ))}
          </ul>
        </aside>
        {selected ? (
          <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
            <div className="flex justify-start md:hidden">
              <Button variant="ghost" onClick={back}>
                <ArrowLeftIcon data-icon="inline-start" aria-hidden="true" />
                {t("back")}
              </Button>
            </div>
            <AgentConversation
              key={JSON.stringify([accountId, origin, selected.conversation.id])}
              item={selected}
              port={conversationPort}
              socket={eventSocket}
              drafts={draftStore}
              origin={origin}
              accountId={accountId}
            />
          </div>
        ) : (
          <p className="hidden text-sm text-muted-foreground md:block">{t("chooseAgent")}</p>
        )}
      </div>
      {newSpace && <SpaceForm onSave={createSpace} onClose={() => setNewSpace(false)} />}
      {form && (
        <AgentForm
          initial={form === "new" ? null : form.agent}
          models={page.models}
          onSave={saveAgent}
          onClose={() => setForm(null)}
        />
      )}
      {confirmation.dialog}
    </div>
  );
}
