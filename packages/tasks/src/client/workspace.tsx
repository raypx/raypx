import { PersistentTaskComposer } from "./persistent-task-composer.js";
import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from "react";
import type { TaskClient } from "@raypx/client";
import { applyActivityEvent } from "@raypx/contracts/tasks";
import { useRemoteQuery, type TaskWorkspaceClient } from "./remote-query.js";
import type {
  AgentTask,
  SyncDevice,
  HumanRequest,
  HumanDecision,
  AgentEvent,
  TaskActivity,
} from "@raypx/contracts/tasks";
import { useTranslations } from "@raypx/i18n/browser";
import { Button } from "@raypx/ui/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@raypx/ui/components/ui/collapsible";
import { ArrowLeft, ChevronRight, ListTodo, Plus } from "lucide-react";
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

interface Props {
  client: TaskWorkspaceClient;
  accountId: string | null;
  pending?: boolean;
  persistEditor?: boolean;
  initialDraft?: TaskComposerDraft | undefined;
  onDraftRestored?: (() => void) | undefined;
  local?: boolean;
  /** Server identity for account-scoped device-only drafts. */
  draftNamespace?: string;
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
  if (!props.accountId || props.pending)
    return (
      <section className="mx-auto max-w-5xl p-8">
        <Gate {...(props.pending === undefined ? {} : { pending: props.pending })} />
      </section>
    );
  return <Workspace key={props.accountId} {...props} accountId={props.accountId} />;
}
function Workspace({
  client,
  accountId,
  view = "tasks",
  local = false,
  draftNamespace = "default",
  initialDraft,
  onDraftRestored,
  persistEditor = false,
}: Props & { view?: "tasks" | "approvals"; accountId: string }) {
  const t = useTranslations("tasks");
  const c = useTranslations("common");
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
    ["workspace", accountId, view, before ?? null],
    load,
    true,
    client,
  );
  const [selected, setSelected] = useState<string | null>(null);
  const composer = useRef<HTMLTextAreaElement>(null);
  const detail = useRef<HTMLDivElement>(null);
  const taskHistory = useRef<HTMLElement>(null);
  const revealPage = useRef(false);
  const [optionsOpen, setOptionsOpen] = useState(false);
  useEffect(() => {
    if (!data || !revealPage.current) return;
    revealPage.current = false;
    const list = taskHistory.current?.querySelector<HTMLElement>("[data-task-list]");
    list?.scrollIntoView?.({ block: "start", behavior: "instant" });
    list?.querySelector<HTMLButtonElement>("button")?.focus({ preventScroll: true });
  }, [data]);
  const [filters, setFilters] = useState(emptyTaskFilters);
  const filtered = filterTasks(data?.tasks ?? [], data?.devices ?? [], filters);
  return (
    <section
      data-tasks
      className="@container mx-auto max-w-[1600px] px-8 py-7 max-[760px]:px-5 max-[760px]:py-6"
    >
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1>{t(view === "approvals" ? "inbox" : "title")}</h1>
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
                composer.current?.focus();
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
            <div className="grid items-start grid-cols-1 gap-7 @min-[58rem]:grid-cols-[minmax(21rem,0.9fr)_minmax(0,1.3fr)] @min-[58rem]:gap-8">
              <div className="min-w-0 space-y-6">
                <Composer
                  key={JSON.stringify([draftNamespace, accountId, local])}
                  client={client}
                  initialDraft={initialDraft}
                  onDraftRestored={onDraftRestored}
                  devices={data.devices}
                  tasks={data.tasks}
                  local={local}
                  draftKey={JSON.stringify([
                    "raypx.task-drafts.v1",
                    draftNamespace,
                    accountId,
                    local,
                  ])}
                  optionsOpen={optionsOpen}
                  onOptionsOpenChange={setOptionsOpen}
                  promptRef={composer}
                  onCreated={(task) => {
                    setSelected(task.id);
                    setPages([]);
                    refresh();
                  }}
                />
                <section ref={taskHistory} aria-label={t("taskHistory")}>
                  {data.tasks.length > 0 && (
                    <TaskOverview tasks={data.tasks} filters={filters} onChange={setFilters} />
                  )}
                  {data.tasks.length > 0 && (
                    <TaskFilterBar
                      filters={filters}
                      devices={data.devices}
                      count={filtered.length}
                      total={data.tasks.length}
                      onChange={setFilters}
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
                        <Button variant="outline" onClick={() => setFilters(emptyTaskFilters)}>
                          {t("clearFilters")}
                        </Button>
                      }
                    />
                  ) : (
                    <TaskList
                      key={JSON.stringify([data.before, filters])}
                      tasks={filtered}
                      devices={data.devices}
                      selected={selected}
                      onSelect={(id) => {
                        setSelected(id);
                        // Stacked layouts move focus to details instead of leaving them below the fold.
                        if (
                          detail.current &&
                          getComputedStyle(detail.current.parentElement!).gridTemplateColumns.split(
                            " ",
                          ).length === 1
                        ) {
                          detail.current.scrollIntoView?.({ block: "start", behavior: "instant" });
                          detail.current.focus({ preventScroll: true });
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
              </div>
              <div
                ref={detail}
                tabIndex={-1}
                aria-label={t("taskDetails")}
                role="region"
                className="min-w-0 scroll-mt-5 border-t border-border pt-6 outline-none @min-[58rem]:border-t-0 @min-[58rem]:border-l @min-[58rem]:pl-8 @min-[58rem]:pt-0"
              >
                {selected && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="mb-4 @min-[58rem]:hidden"
                    onClick={() => {
                      const row = taskHistory.current?.querySelector<HTMLButtonElement>(
                        '[data-task-list] [aria-pressed="true"]',
                      );
                      (row ?? taskHistory.current)?.scrollIntoView?.({
                        block: "start",
                        behavior: "instant",
                      });
                      row?.focus({ preventScroll: true });
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
                    local={local}
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
            </div>
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
  local,
}: {
  client: TaskWorkspaceClient;
  id: string;
  devices: SyncDevice[];
  onChanged: () => void;
  local: boolean;
}) {
  const t = useTranslations("tasks");
  const c = useTranslations("common");
  const followField = useId();
  const cursor = useRef(0);
  const history = useRef(new Map<number, AgentEvent>());
  const activity = useRef(new Map<string, TaskActivity>());
  const olderBefore = useRef<number | undefined>(undefined);
  const initialized = useRef(false);
  const gaps = useRef<{ id: number; before: number; after: number }[]>([]);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const mergeActivity = useCallback((entries: TaskActivity[]) => {
    for (const entry of entries) {
      const previous = activity.current.get(entry.id);
      if (!previous || entry.revision > previous.revision) activity.current.set(entry.id, entry);
    }
  }, []);
  const load = useCallback(
    async (signal: AbortSignal) => {
      const result = await client.tasks.get({ id, after: cursor.current }, { signal });
      const latestOrder = Math.max(
        0,
        ...[...activity.current.values()].map((entry) => entry.order),
      );
      if (!initialized.current) {
        olderBefore.current = result.activityBefore;
        initialized.current = true;
      } else if (
        result.activity?.[0] &&
        latestOrder &&
        result.activityBefore !== undefined &&
        result.activityBefore > latestOrder
      ) {
        const next = {
          id: result.activityBefore,
          before: result.activityBefore,
          after: latestOrder,
        };
        const overlapping = gaps.current.filter(
          (gap) => gap.after < next.before && gap.before > next.after,
        );
        gaps.current = gaps.current.filter((gap) => !overlapping.includes(gap));
        for (const gap of overlapping) {
          next.before = Math.max(next.before, gap.before);
          next.after = Math.min(next.after, gap.after);
        }
        gaps.current.push(next);
      }
      mergeActivity(result.activity ?? []);
      for (const item of result.events) {
        history.current.set(item.cursor, item.event);
        cursor.current = Math.max(cursor.current, item.cursor);
      }
      return {
        ...result,
        activityBefore: olderBefore.current,
        activityGaps: [...gaps.current],
        activity: [...activity.current.values()].sort((a, b) => a.order - b.order),
        events: [...history.current.entries()].map(([position, event]) => ({
          cursor: position,
          event,
        })),
      };
    },
    [client, id, mergeActivity],
  );
  const mergeEvents = useCallback((events: AgentEvent[]) => {
    for (const event of events) {
      if (event.kind !== "activity" && event.kind !== "activity_delta") return undefined;
      const entryId = event.kind === "activity" ? event.entry.id : event.entryId;
      const entry = applyActivityEvent(activity.current.get(entryId), event);
      if (!entry) return undefined;
      activity.current.set(entryId, entry);
    }
    return [...activity.current.values()].sort((a, b) => a.order - b.order);
  }, []);
  const { data, error, errorCode, refresh } = useRemoteQuery(
    ["task", id],
    load,
    true,
    client,
    mergeEvents,
  );
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<ReturnType<typeof failureCode>>();
  const [prompt, setPrompt] = useState("");
  const followId = useRef<{ prompt: string; id: string } | null>(null);
  const active = useRef(false);
  async function loadGap(gapId: number) {
    const boundary = gaps.current.find((gap) => gap.id === gapId);
    if (!boundary || loadingOlder) return;
    setLoadingOlder(true);
    try {
      const result = await client.tasks.get(
        { id, beforeActivity: boundary.before },
        { signal: AbortSignal.timeout(15_000) },
      );
      mergeActivity(result.activity ?? []);
      gaps.current = gaps.current.flatMap((gap) =>
        gap.id !== boundary.id
          ? [gap]
          : result.activityBefore !== undefined && result.activityBefore > gap.after
            ? [{ ...gap, before: result.activityBefore }]
            : [],
      );
      refresh();
    } catch (caught) {
      setFailure(failureCode(caught));
    } finally {
      setLoadingOlder(false);
    }
  }
  async function loadOlder() {
    if (loadingOlder || olderBefore.current === undefined) return;
    setLoadingOlder(true);
    try {
      const result = await client.tasks.get(
        { id, beforeActivity: olderBefore.current },
        { signal: AbortSignal.timeout(15_000) },
      );
      mergeActivity(result.activity ?? []);
      olderBefore.current = result.activityBefore;
      refresh();
    } catch (caught) {
      setFailure(failureCode(caught));
    } finally {
      setLoadingOlder(false);
    }
  }
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
        <time dateTime={data.task.updatedAt}>{new Date(data.task.updatedAt).toLocaleString()}</time>
      </div>
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
      <Conversation
        task={data.task}
        entries={data.activity}
        gaps={data.activityGaps}
        loadGap={loadGap}
        more={data.activityBefore !== undefined}
        loading={loadingOlder}
        loadOlder={loadOlder}
      />
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
            {data.events.map(
              ({ cursor: eventCursor, event }: { cursor: number; event: AgentEvent }) => (
                <li key={eventCursor}>
                  {event.kind === "status"
                    ? t(event.status)
                    : event.kind === "request"
                      ? event.request.title
                      : t("applied")}
                </li>
              ),
            )}
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
}: Omit<Props, "client"> & { client: TaskClient }) {
  if (!accountId || pending) return <Gate {...(pending === undefined ? {} : { pending })} />;
  return <Devices key={accountId} accountId={accountId} client={client} />;
}
function Devices({ client, accountId }: { client: TaskClient; accountId: string }) {
  const t = useTranslations("tasks");
  const c = useTranslations("common");
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
              {device.lastSeenAt && <> · {new Date(device.lastSeenAt).toLocaleString()}</>}
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
  client: TaskClient;
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
