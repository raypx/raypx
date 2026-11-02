import { Gate } from "./workspace-gate.js";
import { TaskDetail } from "./task-detail.js";
import { Approval } from "./approval.js";
import { PersistentTaskComposer } from "./persistent-task-composer.js";
import { type MemoryClientPort } from "@raypx/memory/client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRemoteQuery } from "./remote-query.js";
import type { TaskWorkspacePort } from "../model/port.js";
import type { SyncDevice } from "@raypx/contracts/tasks";
import type { AgentTask, HumanRequest } from "@raypx/core/tasks";
import { useTranslations } from "@raypx/i18n/browser";
import { Button } from "@raypx/ui/components/ui/button";

import { ArrowLeft, ArrowUpRight, Inbox, ListTodo, Plus, RefreshCw, X } from "lucide-react";
import { IconButton } from "@raypx/ui/icon-button";

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
  client: TaskWorkspacePort;
  scope: WorkspaceScope | null;
  pending?: boolean;
  persistEditor?: boolean;
  storageNamespace?: string;
  initialDraft?: TaskComposerDraft | undefined;
  onDraftRestored?: (() => void) | undefined;
  projectId?: string;
  deviceId?: string;
  onProjectChange?: (project: string) => void;
  initialTaskId?: string | undefined;
  onTaskChange?: ((taskId: string | undefined) => void) | undefined;
  onOpenTask?: ((task: AgentTask) => void) | undefined;
  contextLibrary?: MemoryClientPort | undefined;
}
export function TaskWorkspace(props: Props & { view?: "tasks" | "approvals" }) {
  if (!props.scope || props.pending)
    return (
      <section>
        <Gate {...(props.pending === undefined ? {} : { pending: props.pending })} />
      </section>
    );
  return (
    <Workspace
      key={JSON.stringify([workspaceScopeKey(props.scope), props.deviceId, props.projectId])}
      {...props}
      scope={props.scope}
    />
  );
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
  deviceId,
  onProjectChange,
  initialTaskId,
  onTaskChange,
  onOpenTask,
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
          ? client.tasks.list(
              {
                limit: 100,
                ...(before ? { before } : {}),
                ...(projectId ? { projectId } : {}),
                ...(deviceId ? { deviceId } : {}),
              },
              { signal },
            )
          : Promise.resolve([] as AgentTask[]),
        client.devices.list({}, { signal }).catch((error: unknown) => {
          if (view === "tasks") throw error;
          return [] as SyncDevice[];
        }),
        view === "approvals"
          ? client.approvals.list({}, { signal })
          : Promise.resolve([] as HumanRequest[]),
      ]);
      const last = tasks.at(-1);
      const cursor = last ? `${last.createdAt}:${last.id}` : undefined;
      // A short page may hit the local byte budget before the record limit.
      const more =
        view === "tasks" && cursor
          ? await client.tasks.list(
              {
                limit: 1,
                before: cursor,
                ...(projectId ? { projectId } : {}),
                ...(deviceId ? { deviceId } : {}),
              },
              { signal },
            )
          : [];
      return { tasks, devices, requests, before, next: more.length ? cursor : undefined };
    },
    [client, before, projectId, deviceId, view],
  );
  const { data, error, errorCode, refresh, refreshing } = useRemoteQuery(
    [
      "workspace",
      accountId,
      workspaceScopeKey(scope),
      view,
      deviceId ?? null,
      projectId ?? null,
      before ?? null,
    ],
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
  function selectTask(id: string | null) {
    setSelected(id);
    onTaskChange?.(id ?? undefined);
  }
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
    onTaskChange?.(undefined);
    setDetailVisible(false);
  }, [onTaskChange, projectId]);
  useEffect(() => {
    if (!data || !revealPage.current) return;
    revealPage.current = false;
    const list = taskHistory.current?.querySelector<HTMLElement>("[data-task-list]");
    list?.scrollIntoView?.({ block: "start", behavior: "instant" });
    list?.querySelector<HTMLButtonElement>("button")?.focus({ preventScroll: true });
  }, [data]);
  const [filters, setFilters] = useState(emptyTaskFilters);
  const activeFilters = {
    ...filters,
    device: deviceId ?? filters.device,
    project: projectId ?? filters.project,
  };
  function changeFilters(next: typeof filters) {
    setFilters(next);
    if (next.project !== activeFilters.project) onProjectChange?.(next.project);
  }
  const filtered = filterTasks(data?.tasks ?? [], data?.devices ?? [], activeFilters);
  const selectedProject = data?.devices
    .filter((device) => !deviceId || device.id === deviceId)
    .flatMap((device) => device.projects)
    .find((project) => project.id === activeFilters.project);
  const targetDevice = data?.devices.find((device) => device.id === deviceId);
  const targetUnavailable = Boolean(
    projectId && data && (!selectedProject || !targetDevice?.online || targetDevice.revoked),
  );
  return (
    <section data-tasks className="@container">
      <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h1>
              {view === "tasks" && projectId
                ? (selectedProject?.name ?? t("projectUnavailable"))
                : t(view === "approvals" ? "inbox" : "title")}
            </h1>
            {activeFilters.project && !projectId && (
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
          {view === "approvals" && (
            <p className="mt-1 max-w-[65ch] text-sm text-muted-foreground">{t("inboxHint")}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <IconButton
            label={c(refreshing ? "loading" : "refresh")}
            variant="outline"
            onClick={refresh}
            disabled={refreshing}
          >
            <RefreshCw
              aria-hidden="true"
              className={refreshing ? "animate-spin motion-reduce:animate-none" : undefined}
            />
          </IconButton>
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
      {view === "approvals" && <ObservedApprovals client={client} accountId={accountId} />}
      {targetUnavailable && (
        <p role="alert" className="mb-4 max-w-[65ch] text-sm text-destructive-text">
          {t(
            targetDevice && !targetDevice.revoked && selectedProject && !targetDevice.online
              ? "DEVICE_OFFLINE"
              : "projectUnavailableHint",
          )}
        </p>
      )}
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
                <EmptyState
                  className="py-10"
                  icon={<Inbox aria-hidden="true" />}
                  title={t(client.observed ? "managedNothingWaiting" : "nothingWaiting")}
                />
              ) : (
                data.requests.map((request) => (
                  <PendingSessionRequest
                    key={request.id}
                    client={client}
                    request={request}
                    scope={scope}
                    devices={data.devices}
                    onOpenTask={onOpenTask}
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
                    key={`${workspaceScopeKey(scope)}:${projectId ?? "all"}`}
                    client={client}
                    fixedProjectId={projectId}
                    fixedDeviceId={
                      projectId
                        ? (deviceId ?? (local ? (data.devices[0]?.id ?? "") : ""))
                        : undefined
                    }
                    initialDraft={initialDraft}
                    onDraftRestored={onDraftRestored}
                    devices={data.devices}
                    tasks={data.tasks}
                    local={local}
                    draftKey={workspaceDraftKey(scope, projectId, deviceId)}
                    optionsOpen={optionsOpen}
                    onOptionsOpenChange={setOptionsOpen}
                    editorOpen={editorOpen ?? data.tasks.length === 0}
                    onEditorOpenChange={setEditorOpen}
                    promptRef={composer}
                    onCreated={(task) => {
                      selectTask(task.id);
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
                        fixedTarget={Boolean(projectId)}
                        onChange={changeFilters}
                      />
                    )}
                    {data.tasks.length === 0 ? (
                      <EmptyState
                        className="py-10"
                        icon={<ListTodo aria-hidden="true" />}
                        title={t("empty")}
                        description={t(local ? "localEmptyHint" : "emptyHint")}
                      />
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
                          selectTask(id);
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
                            selectTask(null);
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
                            selectTask(null);
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
                      target={projectId ? { projectId, deviceId } : undefined}
                      onFollowUp={
                        projectId
                          ? (id) => {
                              selectTask(id);
                              setDetailVisible(true);
                              setPages([]);
                            }
                          : undefined
                      }
                    />
                  ) : (
                    <div className="flex min-h-72 flex-col items-center justify-center gap-2 px-5 text-center text-muted-foreground">
                      <ListTodo aria-hidden="true" className="size-8" />
                      <h2 className="text-sm font-normal">{t("selectTask")}</h2>
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

function PendingSessionRequest({
  client,
  scope,
  request,
  devices,
  onChanged,
  onOpenTask,
}: {
  client: TaskWorkspacePort;
  scope: WorkspaceScope;
  request: HumanRequest;
  devices: SyncDevice[];
  onChanged: () => void;
  onOpenTask?: ((task: AgentTask) => void) | undefined;
}) {
  const t = useTranslations("tasks");
  const load = useCallback(
    (signal: AbortSignal) => client.tasks.get({ id: request.taskId }, { signal }),
    [client, request.taskId],
  );
  const { data } = useRemoteQuery(
    ["pending-session", workspaceScopeKey(scope), request.taskId],
    load,
    true,
    client,
  );
  const device = devices.find((candidate) => candidate.id === data?.task.deviceId);
  return (
    <Approval
      client={client}
      request={request}
      {...(data ? { task: data.task } : {})}
      onChanged={onChanged}
      context={
        data && (
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            <span className="truncate">{device?.name ?? t("device")}</span>
            <span aria-hidden="true">·</span>
            <span className="truncate">
              {device?.projects.find((project) => project.id === data.task.projectId)?.name ??
                t("projectUnavailable")}
            </span>
            {onOpenTask && (
              <Button variant="ghost" size="xs" onClick={() => onOpenTask(data.task)}>
                {t("viewSession")}
                <ArrowUpRight aria-hidden="true" />
              </Button>
            )}
          </div>
        )
      }
    />
  );
}
