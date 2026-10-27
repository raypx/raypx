import { PersistentTaskComposer } from "./persistent-task-composer.js";
import { ContextSnapshot, type MemoryClientPort } from "@raypx/memory/client";
import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from "react";
import { useRemoteQuery, type TaskWorkspaceClient } from "./remote-query.js";
import type { AgentTask, SyncDevice, HumanRequest, HumanDecision } from "@raypx/contracts/tasks";
import { useFormatter, useTranslations } from "@raypx/i18n/browser";
import { Button } from "@raypx/ui/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@raypx/ui/components/ui/collapsible";
import { ArrowLeft, ChevronRight, ListTodo, Plus, X } from "lucide-react";
import { Badge } from "@raypx/ui/components/ui/badge";
import { TaskComposer, type TaskComposerDraft } from "./task-composer.js";
import { TaskOverview } from "./task-overview.js";
import { Checkbox } from "@raypx/ui/components/ui/checkbox";
import { Field, FieldLabel } from "@raypx/ui/components/ui/field";
import { Input } from "@raypx/ui/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@raypx/ui/components/ui/radio-group";
import { Textarea } from "@raypx/ui/components/ui/textarea";
import { isTaskActive } from "../index.js";
import { TaskList } from "./task-list.js";
import { emptyTaskFilters, filterTasks, TaskFilterBar } from "./task-filters.js";
import { EmptyState } from "@raypx/ui/empty-state";
import { LoadingState } from "@raypx/ui/loading-state";
import { Modal } from "@raypx/ui/modal";

import { failureCode } from "./failure.js";
import { Conversation } from "./conversation.js";
import { TaskInputComposer } from "./task-input.js";
import { ApprovalBody } from "./approval-body.js";
import { ObservedApprovals } from "./observed.js";
import { TaskPanels } from "./task-panels.js";
import { TaskMarkdown } from "./markdown.js";
import { useTaskConversation } from "./use-task-conversation.js";
import {
  isLocalWorkspace,
  workspaceDraftKey,
  workspaceOwner,
  workspaceScopeKey,
  type WorkspaceScope,
} from "../model/scope.js";
import type { DeviceManagementPort } from "../model/port.js";

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
function Gate({ pending }: { pending?: boolean }) {
  const t = useTranslations("tasks");
  return (
    <div className="py-10" aria-busy={pending}>
      {pending ? (
        <div className="h-24 animate-pulse rounded-lg bg-muted" />
      ) : (
        <>
          <h2>{t("signIn")}</h2>
          <p className="mt-2 text-sm text-muted-foreground">{t("signInHint")}</p>
        </>
      )}
    </div>
  );
}
export function TaskWorkspace(props: Props & { view?: "tasks" | "approvals" }) {
  if (!props.scope || props.pending)
    return (
      <section className="mx-auto max-w-5xl p-8">
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
        client.tasks.list({ limit: 100, ...(before ? { before } : {}) }, { signal }),
        client.devices.list({}, { signal }),
        client.approvals.list({}, { signal }),
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
    <section
      data-tasks
      className="@container mx-auto w-full max-w-[1600px] px-6 py-5 max-[760px]:px-5"
    >
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
function TaskDetail({
  devices,
  client,
  id,
  onChanged,
  scope,
}: {
  client: TaskWorkspaceClient;
  id: string;
  devices: SyncDevice[];
  onChanged: () => void;
  scope: WorkspaceScope;
}) {
  const t = useTranslations("tasks");
  const c = useTranslations("common");
  const format = useFormatter();
  const followField = useId();
  const local = isLocalWorkspace(scope);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<ReturnType<typeof failureCode>>();
  const [prompt, setPrompt] = useState("");
  const followId = useRef<{ prompt: string; id: string } | null>(null);
  const active = useRef(false);
  const { data, error, errorCode, refresh, loadingOlder, loadGap, loadOlder } = useTaskConversation(
    client,
    id,
    scope,
    setFailure,
  );
  async function cancel() {
    if (active.current) return;
    active.current = true;
    setFailure(undefined);
    setBusy(true);
    try {
      await client.tasks.cancel({ id }, { signal: AbortSignal.timeout(15_000) });
      refresh();
      onChanged();
    } catch (e) {
      setFailure(failureCode(e));
    } finally {
      active.current = false;
      setBusy(false);
    }
  }
  async function follow(event: FormEvent) {
    event.preventDefault();
    if (active.current || !prompt.trim()) return;
    active.current = true;
    setFailure(undefined);
    if (followId.current?.prompt !== prompt) followId.current = { prompt, id: crypto.randomUUID() };
    setBusy(true);
    try {
      await client.tasks.followUp(
        { id: followId.current.id, parentTaskId: id, prompt },
        { signal: AbortSignal.timeout(15_000) },
      );
      followId.current = null;
      setPrompt("");
      onChanged();
    } catch (e) {
      setFailure(failureCode(e));
    } finally {
      active.current = false;
      setBusy(false);
    }
  }
  if (!data)
    return (
      <div className="space-y-3">
        <p role={error ? "alert" : "status"}>
          {error
            ? t(
                errorCode === "UPGRADE_REQUIRED"
                  ? errorCode
                  : local
                    ? "LOCAL_UNAVAILABLE"
                    : errorCode,
              )
            : c("loading")}
        </p>
        {error && (
          <Button variant="outline" onClick={refresh}>
            {c("retry")}
          </Button>
        )}
      </div>
    );
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 space-y-3">
          <Badge
            variant={
              data.task.status === "waiting"
                ? "default"
                : ["failed", "interrupted", "delivery_failed"].includes(data.task.status)
                  ? "destructive"
                  : "secondary"
            }
          >
            {t(data.task.status)}
          </Badge>
          <h2 className="line-clamp-3 text-xl leading-snug font-semibold [overflow-wrap:anywhere]">
            {data.task.prompt}
          </h2>
        </div>
        {isTaskActive(data.task) && (
          <Button
            variant="outline"
            disabled={busy || data.task.status === "cancelling"}
            onClick={() => void cancel()}
          >
            {c("cancel")}
          </Button>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border pb-5 text-xs text-muted-foreground">
        <span>{data.task.provider === "claude" ? "Claude Code" : "Codex"}</span>
        <span>{devices.find((device) => device.id === data.task.deviceId)?.name}</span>
        <span>
          {
            devices
              .find((device) => device.id === data.task.deviceId)
              ?.projects.find((project) => project.id === data.task.projectId)?.name
          }
        </span>
        <time dateTime={data.task.updatedAt}>
          {format.dateTime(new Date(data.task.updatedAt), "timestamp")}
        </time>
      </div>
      {data.task.context && <ContextSnapshot snapshot={data.task.context} />}
      {data.requests.map((request) => (
        <Approval
          key={request.id}
          client={client}
          request={request}
          onChanged={() => {
            refresh();
            onChanged();
          }}
        />
      ))}
      {data.task.activityIncomplete && (
        <p role="status" className="text-xs text-muted-foreground">
          {t("snapshotIncomplete")}
        </p>
      )}
      {!isTaskActive(data.task) && (
        <section aria-label={t("taskResult")} className="space-y-3 border-b border-border pb-5">
          <h3 className="text-sm font-semibold">
            {t(data.task.status === "succeeded" ? "taskResult" : "failureDetails")}
          </h3>
          {data.task.summary ? (
            <TaskMarkdown>{data.task.summary}</TaskMarkdown>
          ) : (
            <p className="text-sm text-muted-foreground">{t("noTaskResult")}</p>
          )}
        </section>
      )}
      {isTaskActive(data.task) ? (
        <Conversation
          task={data.task}
          entries={data.activity}
          gaps={data.activityGaps}
          loadGap={loadGap}
          more={data.activityBefore !== undefined}
          loading={loadingOlder}
          loadOlder={loadOlder}
        />
      ) : (
        <Collapsible>
          <CollapsibleTrigger
            render={<Button type="button" variant="ghost" size="sm" className="group" />}
          >
            <ChevronRight aria-hidden="true" className="group-data-panel-open:rotate-90" />
            {t("viewConversation")}
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-3">
            <Conversation
              task={data.task}
              entries={data.activity}
              gaps={data.activityGaps}
              loadGap={loadGap}
              more={data.activityBefore !== undefined}
              loading={loadingOlder}
              loadOlder={loadOlder}
            />
          </CollapsibleContent>
        </Collapsible>
      )}
      {isTaskActive(data.task) && (
        <TaskInputComposer
          client={client}
          task={data.task}
          entries={data.activity}
          modes={
            devices
              .find((device) => device.id === data.task.deviceId)
              ?.capabilities.find((capability) => capability.provider === data.task.provider)
              ?.inputModes ?? []
          }
          waiting={data.requests.some((request) => ["pending", "decided"].includes(request.status))}
          onChanged={refresh}
        />
      )}
      <Collapsible>
        <CollapsibleTrigger render={<Button variant="ghost" size="sm" className="group" />}>
          <ChevronRight aria-hidden="true" className="group-data-panel-open:rotate-90" />
          {t("activity")}
        </CollapsibleTrigger>
        <CollapsibleContent>
          <ol className="mt-3 space-y-2 text-xs text-muted-foreground">
            {data.events.map(({ cursor: eventCursor, event }) => (
              <li key={eventCursor}>
                {event.kind === "status"
                  ? t(event.status)
                  : event.kind === "request"
                    ? event.request.title
                    : t("applied")}
              </li>
            ))}
          </ol>
        </CollapsibleContent>
      </Collapsible>
      {!isTaskActive(data.task) && (
        <form onSubmit={(event) => void follow(event)} className="space-y-3">
          <Field>
            <FieldLabel htmlFor={followField}>{t("followUp")}</FieldLabel>
            <Textarea
              id={followField}
              className="min-h-24"
              required
              maxLength={32000}
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
            />
          </Field>
          <Button type="submit" disabled={busy || !prompt.trim()}>
            {t("send")}
          </Button>
        </form>
      )}
      {failure && (
        <p role="alert" className="text-sm text-destructive">
          {t(failure)}
        </p>
      )}
    </div>
  );
}
function Approval({
  client,
  request,
  task,
  onChanged,
}: {
  client: TaskWorkspaceClient;
  request: HumanRequest;
  task?: AgentTask | undefined;
  onChanged: () => void;
}) {
  const t = useTranslations("tasks");
  const id = useId();
  const [note, setNote] = useState("");
  const [answers, setAnswers] = useState<Record<string, string[]>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ReturnType<typeof failureCode>>();
  const active = useRef(false);
  const closed = request.status !== "pending";
  async function decide(decision: HumanDecision) {
    if (active.current || closed) return;
    active.current = true;
    setError(undefined);
    setBusy(true);
    try {
      await client.approvals.decide(
        { id: request.id, decision },
        { signal: AbortSignal.timeout(15_000) },
      );
      onChanged();
    } catch (failure) {
      setError(failureCode(failure));
      onChanged();
    } finally {
      active.current = false;
      setBusy(false);
    }
  }
  return (
    <section className="rounded-lg border border-border p-4">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <h3 className="text-sm font-medium">{request.title || t(request.kind)}</h3>
        <span className="text-xs text-muted-foreground">{t(request.status)}</span>
      </div>
      {task && <p className="mb-3 line-clamp-2 text-xs text-muted-foreground">{task.prompt}</p>}
      {request.body && <ApprovalBody request={request} />}
      {!closed && (
        <div className="mt-4 space-y-4">
          {request.questions.map((question) => (
            <fieldset key={question.id} className="space-y-2">
              <legend className="mb-2 text-sm font-medium">{question.text}</legend>
              {question.multiSelect ? (
                question.options.map((option, index) => (
                  <Field key={option.label} orientation="horizontal">
                    <Checkbox
                      id={`${id}-${question.id}-${index}`}
                      checked={answers[question.id]?.includes(option.label) ?? false}
                      onCheckedChange={(checked) =>
                        setAnswers((previous) => ({
                          ...previous,
                          [question.id]: checked
                            ? [...(previous[question.id] ?? []), option.label]
                            : (previous[question.id] ?? []).filter((item) => item !== option.label),
                        }))
                      }
                    />
                    <OptionLabel htmlFor={`${id}-${question.id}-${index}`} option={option} />
                  </Field>
                ))
              ) : (
                <RadioGroup
                  value={answers[question.id]?.[0] ?? ""}
                  onValueChange={(value) =>
                    setAnswers((previous) => ({ ...previous, [question.id]: [String(value)] }))
                  }
                >
                  {question.options.map((option, index) => (
                    <Field key={option.label} orientation="horizontal">
                      <RadioGroupItem id={`${id}-${question.id}-${index}`} value={option.label} />
                      <OptionLabel htmlFor={`${id}-${question.id}-${index}`} option={option} />
                    </Field>
                  ))}
                </RadioGroup>
              )}
              <Field>
                <FieldLabel htmlFor={`${id}-${question.id}-custom`}>{t("customAnswer")}</FieldLabel>
                <Input
                  id={`${id}-${question.id}-custom`}
                  value={
                    answers[question.id]?.every((value) =>
                      question.options.every((option) => option.label !== value),
                    )
                      ? (answers[question.id]?.join(", ") ?? "")
                      : ""
                  }
                  onChange={(event) =>
                    setAnswers((previous) => ({
                      ...previous,
                      [question.id]: event.target.value ? [event.target.value] : [],
                    }))
                  }
                />
              </Field>
            </fieldset>
          ))}
          <Field>
            <FieldLabel htmlFor={`${id}-note`}>{t("note")}</FieldLabel>
            <Textarea
              id={`${id}-note`}
              value={note}
              maxLength={8000}
              onChange={(event) => setNote(event.target.value)}
            />
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={
                busy ||
                (request.kind === "question" &&
                  request.questions.some((q) => !answers[q.id]?.some((answer) => answer.trim())))
              }
              onClick={() =>
                void decide(
                  request.kind === "question" ? { type: "answer", answers } : { type: "allow" },
                )
              }
            >
              {t(
                request.kind === "question"
                  ? "submitAnswer"
                  : request.kind === "plan"
                    ? "approvePlan"
                    : "allowOnce",
              )}
            </Button>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => void decide({ type: "deny", note })}
            >
              {t(request.kind === "plan" ? "revisePlan" : "deny")}
            </Button>
          </div>
        </div>
      )}
      {request.status === "decided" && (
        <p className="mt-3 text-xs text-muted-foreground">{t("awaitingDevice")}</p>
      )}
      {error && (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {t(error)}
        </p>
      )}
    </section>
  );
}
function OptionLabel({
  htmlFor,
  option,
}: {
  htmlFor: string;
  option: { label: string; description: string };
}) {
  return (
    <FieldLabel htmlFor={htmlFor} className="block font-normal leading-normal">
      {option.label}
      <small className="block text-muted-foreground">{option.description}</small>
    </FieldLabel>
  );
}
export function DeviceSettings({
  client,
  accountId,
  pending,
}: {
  client: DeviceManagementPort;
  accountId: string | null;
  pending?: boolean;
}) {
  if (!accountId || pending) return <Gate {...(pending === undefined ? {} : { pending })} />;
  return <Devices key={accountId} accountId={accountId} client={client} />;
}
function Devices({ client, accountId }: { client: DeviceManagementPort; accountId: string }) {
  const t = useTranslations("tasks");
  const c = useTranslations("common");
  const format = useFormatter();
  const load = useCallback((signal: AbortSignal) => client.devices.list({}, { signal }), [client]);
  const { data, error, errorCode, refresh, refreshing } = useRemoteQuery(
    ["devices", accountId],
    load,
    true,
    client,
  );
  return (
    <section className="mt-8 border-t border-border pt-7" data-tasks>
      <h2 className="text-base">{t("devices")}</h2>
      <p className="mt-2 text-sm text-muted-foreground">{t("devicesHint")}</p>
      {error && (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <p role="alert" className="text-sm text-destructive-text">
            {t(errorCode)}
          </p>
          <Button variant="outline" disabled={refreshing} onClick={refresh}>
            {c("retry")}
          </Button>
        </div>
      )}
      {!data && !error && <LoadingState label={c("loading")} />}
      {data?.length === 0 && <p className="mt-5 text-sm text-muted-foreground">{t("noDevices")}</p>}
      {data?.map((device) => (
        <div
          key={device.id}
          className="flex flex-wrap items-center justify-between gap-3 border-b border-border py-5"
        >
          <div className="min-w-0 [overflow-wrap:anywhere]">
            <h3 className="text-sm font-medium">{device.name}</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              {device.platform} ·{" "}
              {t(device.revoked ? "revoked" : device.online ? "online" : "offline")}
              {device.lastSeenAt && (
                <> · {format.dateTime(new Date(device.lastSeenAt), "timestamp")}</>
              )}
            </p>
          </div>
          {!device.revoked && (
            <DisconnectComputer
              key={device.epoch}
              client={client}
              device={device}
              onChanged={refresh}
            />
          )}
        </div>
      ))}
    </section>
  );
}

function DisconnectComputer({
  client,
  device,
  onChanged,
}: {
  client: DeviceManagementPort;
  device: SyncDevice;
  onChanged: () => void;
}) {
  const t = useTranslations("tasks");
  const c = useTranslations("common");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [revoked, setRevoked] = useState(false);
  const active = useRef(false);
  async function revoke() {
    if (active.current) return;
    active.current = true;
    setBusy(true);
    setError(false);
    try {
      await client.devices.revoke(
        { deviceId: device.id, epoch: device.epoch },
        { signal: AbortSignal.timeout(15_000) },
      );
      setRevoked(true);
      setOpen(false);
      onChanged();
    } catch {
      setError(true);
    } finally {
      active.current = false;
      setBusy(false);
    }
  }
  return (
    <Modal
      title={t("revoke")}
      description={t("revokeConfirm")}
      closeLabel={c("close")}
      trigger={
        <Button variant="outline" disabled={revoked}>
          {t(revoked ? "revoked" : "revoke")}
        </Button>
      }
      open={open}
      onOpenChange={(value) => {
        setOpen(value);
        if (value) setError(false);
      }}
      busy={busy}
    >
      <p className="break-words text-sm font-medium">{device.name}</p>
      {error && (
        <p role="alert" className="text-sm text-destructive-text">
          {t("NETWORK_UNAVAILABLE")}
        </p>
      )}
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="outline" disabled={busy} onClick={() => setOpen(false)}>
          {c("cancel")}
        </Button>
        <Button variant="destructive" disabled={busy} onClick={() => void revoke()}>
          {busy ? c("working") : t("revoke")}
        </Button>
      </div>
    </Modal>
  );
}
