import { Gate } from "./workspace-gate.js";
import { TaskDetail } from "./task-detail.js";
import { Approval } from "./approval.js";
import { PersistentTaskComposer } from "./persistent-task-composer.js";
import { type MemoryClientPort } from "@raypx/memory/client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRemoteQuery, type TaskWorkspaceClient } from "./remote-query.js";
import type { AgentTask, SyncDevice, HumanRequest } from "@raypx/contracts/tasks";
import { useTranslations } from "@raypx/i18n/browser";
import { Button } from "@raypx/ui/components/ui/button";

import { ArrowLeft, ListTodo, Plus, X } from "lucide-react";

import { TaskComposer, type TaskComposerDraft } from "./task-composer.js";
import { TaskOverview } from "./task-overview.js";

import { TaskList } from "./task-list.js";
import { emptyTaskFilters, filterTasks, TaskFilterBar } from "./task-filters.js";
import { EmptyState } from "@raypx/ui/empty-state";
import { LoadingState } from "@raypx/ui/loading-state";

import { ObservedApprovals } from "./observed.js";
import { TaskPanels } from "./task-panels.js";

import {
  isLocalWorkspace,
  workspaceDraftKey,
  workspaceOwner,
  workspaceScopeKey,
  type WorkspaceScope,
} from "../model/scope.js";

interface Props {
  client: TaskWorkspaceClient;
  scope: WorkspaceScope | null;
  pending?: boolean;
  persistEditor?: boolean;
  storageNamespace?: string;
  initialDraft?: TaskComposerDraft | undefined;
  onDraftRestored?: (() => void) | undefined;
  projectId?: string;
  onProjectChange?: (project: string) => void;
  initialTaskId?: string | undefined;
  contextLibrary?: MemoryClientPort | undefined;
}
export function TaskWorkspace(props: Props & { view?: "tasks" | "approvals" }) {
  if (!props.scope || props.pending)
    return (
      <section>
        <Gate {...(props.pending === undefined ? {} : { pending: props.pending })} />
      </section>
    );
  return <Workspace key={workspaceScopeKey(props.scope)} {...props} scope={props.scope} />;
}
function Workspace({
  client,
  scope,
  view = "tasks",
  initialDraft,
  onDraftRestored,
  persistEditor = false,
  storageNamespace,
  projectId,
  onProjectChange,
  initialTaskId,
  contextLibrary,
}: Props & { view?: "tasks" | "approvals"; scope: WorkspaceScope }) {
  const t = useTranslations("tasks");
  const c = useTranslations("common");
  const accountId = workspaceOwner(scope);
  const local = isLocalWorkspace(scope);
  const Composer = persistEditor ? PersistentTaskComposer : TaskComposer;
  const [pages, setPages] = useState<string[]>([]);
  const before = pages.at(-1);
  const load = useCallback(
    async (signal: AbortSignal) => {
      const [tasks, devices, requests] = await Promise.all([
        view === "tasks"
          ? client.tasks.list({ limit: 100, ...(before ? { before } : {}) }, { signal })
          : Promise.resolve([] as AgentTask[]),
        view === "tasks"
          ? client.devices.list({}, { signal })
          : Promise.resolve([] as SyncDevice[]),
        view === "approvals"
          ? client.approvals.list({}, { signal })
          : Promise.resolve([] as HumanRequest[]),
      ]);
      const last = tasks.at(-1);
      const cursor = last ? `${last.createdAt}:${last.id}` : undefined;
      // A short page may hit the local byte budget before the record limit.
      const more =
        view === "tasks" && cursor
          ? await client.tasks.list({ limit: 1, before: cursor }, { signal })
          : [];
      return { tasks, devices, requests, before, next: more.length ? cursor : undefined };
    },
    [client, before, view],
  );
  const { data, error, errorCode, refresh, refreshing } = useRemoteQuery(
    ["workspace", accountId, workspaceScopeKey(scope), view, before ?? null],
    load,
    true,
    client,
  );
  const [selected, setSelected] = useState<string | null>(initialTaskId ?? null);
  const composer = useRef<HTMLTextAreaElement>(null);
  const detail = useRef<HTMLDivElement>(null);
  const taskHistory = useRef<HTMLElement>(null);
  const revealPage = useRef(false);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [editorOpen, setEditorOpen] = useState<boolean>();
  const [detailVisible, setDetailVisible] = useState(Boolean(initialTaskId));
  const linkedTask = useRef(initialTaskId);
  useEffect(() => {
    if (linkedTask.current === initialTaskId) return;
    linkedTask.current = initialTaskId;
    setSelected(initialTaskId ?? null);
    setDetailVisible(Boolean(initialTaskId));
  }, [initialTaskId]);
  const [returnToList, setReturnToList] = useState(0);
  const previousProject = useRef(projectId);
  useEffect(() => {
    if (previousProject.current === projectId) return;
    previousProject.current = projectId;
    setPages([]);
    setSelected(null);
    setDetailVisible(false);
  }, [projectId]);
  useEffect(() => {
    if (!data || !revealPage.current) return;
    revealPage.current = false;
    const list = taskHistory.current?.querySelector<HTMLElement>("[data-task-list]");
    list?.scrollIntoView?.({ block: "start", behavior: "instant" });
    list?.querySelector<HTMLButtonElement>("button")?.focus({ preventScroll: true });
  }, [data]);
  const [filters, setFilters] = useState(emptyTaskFilters);
  const activeFilters = { ...filters, project: projectId ?? filters.project };
  function changeFilters(next: typeof filters) {
    setFilters(next);
    if (next.project !== activeFilters.project) onProjectChange?.(next.project);
  }
  const filtered = filterTasks(data?.tasks ?? [], data?.devices ?? [], activeFilters);
  const selectedProject = data?.devices
    .flatMap((device) => device.projects)
    .find((project) => project.id === activeFilters.project);
  return (
    <section data-tasks className="@container">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1>{t(view === "approvals" ? "inbox" : "title")}</h1>
            {activeFilters.project && (
              <Button
                variant="secondary"
                size="sm"
                aria-label={t("clearProjectFilter")}
                onClick={() => changeFilters({ ...activeFilters, project: "" })}
              >
                <span className="max-w-48 truncate">
                  {selectedProject?.name ?? t("projectUnavailable")}
                </span>
                <X aria-hidden="true" />
              </Button>
            )}
          </div>
          <p className="mt-2 max-w-[65ch] text-sm text-muted-foreground">
            {t(local ? "localHint" : view === "approvals" ? "inboxHint" : "intro")}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={refresh} disabled={refreshing}>
            {c(refreshing ? "loading" : "refresh")}
          </Button>
          {view === "tasks" && data && (
            <Button
              onClick={() => {
                setOptionsOpen(true);
                setEditorOpen(true);
                setDetailVisible(false);
                requestAnimationFrame(() => composer.current?.focus());
              }}
            >
              <Plus aria-hidden="true" />
              {t("create")}
            </Button>
          )}
        </div>
      </header>
      <ObservedApprovals client={client} accountId={accountId} />
      {error && (
        <p role="alert" className="mb-4 text-sm text-destructive-text">
          {t(errorCode)}
        </p>
      )}
      {!data ? (
        !error && <LoadingState label={c("loading")} />
      ) : (
        <>
          {view === "approvals" ? (
            <div className="space-y-6">
              {client.observed && (
                <h2 className="text-base font-semibold">{t("managedRequests")}</h2>
              )}
              {data.requests.length === 0 ? (
                <p className="py-10 text-sm text-muted-foreground">
                  {t(client.observed ? "managedNothingWaiting" : "nothingWaiting")}
                </p>
              ) : (
                data.requests.map((request) => (
                  <Approval
                    key={request.id}
                    client={client}
                    request={request}
                    task={data.tasks.find((task) => task.id === request.taskId)}
                    onChanged={refresh}
                  />
                ))
              )}
            </div>
          ) : (
            <TaskPanels
              storageKey={
                storageNamespace
                  ? JSON.stringify(["raypx.task-list-width.v1", storageNamespace])
                  : undefined
              }
              detailVisible={detailVisible}
              list={
                <>
                  <Composer
                    contextLibrary={contextLibrary}
                    key={workspaceScopeKey(scope)}
                    client={client}
                    initialDraft={initialDraft}
                    onDraftRestored={onDraftRestored}
                    devices={data.devices}
                    tasks={data.tasks}
                    local={local}
                    draftKey={workspaceDraftKey(scope)}
                    optionsOpen={optionsOpen}
                    onOptionsOpenChange={setOptionsOpen}
                    editorOpen={editorOpen ?? data.tasks.length === 0}
                    onEditorOpenChange={setEditorOpen}
                    promptRef={composer}
                    onCreated={(task) => {
                      setSelected(task.id);
                      setDetailVisible(true);
                      setPages([]);
                      refresh();
                    }}
                  />
                  <section
                    ref={taskHistory}
                    aria-label={t("taskHistory")}
                    className="@min-[58rem]:flex @min-[58rem]:min-h-0 @min-[58rem]:flex-1 @min-[58rem]:flex-col"
                  >
                    {data.tasks.length > 0 && (
                      <TaskOverview
                        tasks={data.tasks}
                        filters={activeFilters}
                        onChange={changeFilters}
                      />
                    )}
                    {data.tasks.length > 0 && (
                      <TaskFilterBar
                        filters={activeFilters}
                        devices={data.devices}
                        count={filtered.length}
                        total={data.tasks.length}
                        onChange={changeFilters}
                      />
                    )}
                    {data.tasks.length === 0 ? (
                      <div className="py-10">
                        <h2>{t("empty")}</h2>
                        <p className="mt-2 text-sm text-muted-foreground">
                          {t(local ? "localEmptyHint" : "emptyHint")}
                        </p>
                      </div>
                    ) : filtered.length === 0 ? (
                      <EmptyState
                        title={t("noMatches")}
                        description={t("noMatchesHint")}
                        action={
                          <Button variant="outline" onClick={() => changeFilters(emptyTaskFilters)}>
                            {t("clearFilters")}
                          </Button>
                        }
                      />
                    ) : (
                      <TaskList
                        fill
                        restoreFocus={returnToList}
                        key={JSON.stringify([data.before, activeFilters])}
                        tasks={filtered}
                        devices={data.devices}
                        selected={selected}
                        onSelect={(id) => {
                          setSelected(id);
                          setDetailVisible(true);
                          // Stacked layouts move focus to details instead of leaving them below the fold.
                          if (
                            detail.current &&
                            getComputedStyle(
                              detail.current.closest("[data-task-panels]")!,
                            ).gridTemplateColumns.split(" ").length === 1
                          ) {
                            requestAnimationFrame(() => {
                              detail.current?.scrollIntoView?.({
                                block: "start",
                                behavior: "instant",
                              });
                              detail.current?.focus({ preventScroll: true });
                            });
                          }
                        }}
                      />
                    )}
                    {(pages.length > 0 || data.next) && (
                      <nav aria-label={t("taskPages")} className="mt-4 flex flex-wrap gap-2">
                        <Button
                          variant="outline"
                          disabled={!pages.length}
                          onClick={() => {
                            revealPage.current = true;
                            setPages((previous) => previous.slice(0, -1));
                            setSelected(null);
                          }}
                        >
                          {t("newerTasks")}
                        </Button>
                        <Button
                          variant="outline"
                          disabled={!data.next || data.before !== before}
                          onClick={() => {
                            revealPage.current = true;
                            if (data.next) setPages((previous) => [...previous, data.next!]);
                            setSelected(null);
                          }}
                        >
                          {t("olderTasks")}
                        </Button>
                      </nav>
                    )}
                  </section>
                </>
              }
              detail={
                <div
                  ref={detail}
                  tabIndex={-1}
                  aria-label={t("taskDetails")}
                  role="region"
                  className="min-w-0 scroll-mt-5 outline-none"
                >
                  {selected && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="mb-4 @min-[58rem]:hidden"
                      onClick={() => {
                        setDetailVisible(false);
                        setReturnToList((value) => value + 1);
                      }}
                    >
                      <ArrowLeft aria-hidden="true" />
                      {t("backToTasks")}
                    </Button>
                  )}
                  {selected ? (
                    <TaskDetail
                      key={selected}
                      client={client}
                      id={selected}
                      scope={scope}
                      devices={data.devices}
                      onChanged={refresh}
                    />
                  ) : (
                    <div className="flex min-h-72 flex-col items-center justify-center gap-3 px-5 text-center">
                      <ListTodo aria-hidden="true" className="size-8 text-muted-foreground" />
                      <h2 className="text-base">{t("taskDetails")}</h2>
                      <p className="max-w-72 text-sm text-muted-foreground">{t("selectTask")}</p>
                    </div>
                  )}
                </div>
              }
            />
          )}
        </>
      )}
    </section>
  );
}
