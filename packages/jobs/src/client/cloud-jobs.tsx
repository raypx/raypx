import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ScheduleIcon } from "@raypx/icons/schedule";
import { ChevronRightIcon } from "@raypx/icons/chevron-right";
import { PauseIcon } from "@raypx/icons/pause";
import { EditIcon } from "@raypx/icons/edit";
import { PlayIcon } from "@raypx/icons/play";
import { PlusIcon } from "@raypx/icons/plus";
import { RefreshIcon } from "@raypx/icons/refresh";
import { DeleteIcon } from "@raypx/icons/delete";
import { useFormatter, useTranslations } from "@raypx/i18n/browser";
import { Button } from "@raypx/ui/components/ui/button";
import { Badge } from "@raypx/ui/components/ui/badge";
import { Alert, AlertDescription } from "@raypx/ui/components/ui/alert";
import { EmptyState } from "@raypx/ui/empty-state";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@raypx/ui/components/ui/collapsible";
import { useConfirmation } from "@raypx/ui/confirmation";
import { LoadingState } from "@raypx/ui/loading-state";
import { HelpHint } from "@raypx/ui/help-hint";
import { IconButton } from "@raypx/ui/icon-button";
import type { CloudJob, CloudJobInput, CloudJobRun } from "@raypx/jobs-model";
import type { CloudJobsPort, JobDevicesPort, JobDevice, JobReadOptions } from "./ports.ts";
import { AutomationFilters } from "./automation-filters.tsx";
import { JobForm } from "./job-form.tsx";
import { jobFailure, jobReason } from "./errors.ts";
import type { MemoryClientPort } from "@raypx/memory/client";

export interface CloudJobsPageProps {
  accountId: string;
  client: CloudJobsPort;
  devices: JobDevicesPort;
  renderTaskLink: (taskId: string) => ReactNode;
  contextLibrary?: MemoryClientPort | undefined;
  target?: { deviceId: string; projectId: string } | undefined;
}
const identities = new WeakMap<object, number>();
let identity = 0;
function key(value: object) {
  let id = identities.get(value);
  if (id === undefined) identities.set(value, (id = ++identity));
  return id;
}
/** Remount private state and cancel requests when either its account or transport changes. */
export function CloudJobsPage(props: CloudJobsPageProps) {
  return (
    <CloudJobs
      key={JSON.stringify([
        props.accountId,
        key(props.client),
        key(props.devices),
        props.contextLibrary ? key(props.contextLibrary) : null,
        props.target?.deviceId,
        props.target?.projectId,
      ])}
      {...props}
    />
  );
}
function CloudJobs({
  client,
  devices: devicePort,
  renderTaskLink,
  contextLibrary,
  accountId,
  target,
}: CloudJobsPageProps) {
  const t = useTranslations("automations"),
    c = useTranslations("common");
  const format = useFormatter();
  const { confirm, dialog } = useConfirmation();
  const alive = useRef(true),
    requests = useRef(new Set<AbortController>()),
    busyRef = useRef(false);
  const loadGeneration = useRef(0),
    historyGeneration = useRef(0);
  const manualIds = useRef(new Map<string, string>());
  const createId = useRef<string | undefined>(undefined);
  const historyTarget = useRef<CloudJob | undefined>(undefined);
  const [data, setData] = useState<{ enabled: boolean; jobs: CloudJob[]; devices: JobDevice[] }>();
  const [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false);
  const [error, setError] = useState<ReturnType<typeof jobFailure>>();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [pendingRuns, setPendingRuns] = useState<string[]>([]);
  const [editing, setEditing] = useState<CloudJob | null | false>(false);
  const [history, setHistory] = useState<{ job: CloudJob; runs: CloudJobRun[] }>();
  useEffect(() => {
    alive.current = true;
    const active = requests.current;
    return () => {
      alive.current = false;
      for (const controller of active) controller.abort();
      active.clear();
    };
  }, []);
  const request = useCallback(async <T,>(run: (options: JobReadOptions) => Promise<T>) => {
    if (!alive.current) throw new DOMException("Cancelled", "AbortError");
    const controller = new AbortController();
    requests.current.add(controller);
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(30_000)]);
    try {
      const value = await run({ signal });
      signal.throwIfAborted();
      if (!alive.current) throw new DOMException("Cancelled", "AbortError");
      return value;
    } finally {
      requests.current.delete(controller);
    }
  }, []);
  const load = useCallback(async () => {
    if (!alive.current) return;
    const generation = ++loadGeneration.current;
    try {
      const [value, devices] = await Promise.allSettled([
        request((options) => client.list({}, options)),
        request((options) => devicePort.list({}, options)),
      ]);
      if (alive.current && generation === loadGeneration.current) {
        setData((previous) => {
          if (value.status === "fulfilled")
            return {
              ...value.value,
              devices: devices.status === "fulfilled" ? devices.value : (previous?.devices ?? []),
            };
          return previous && devices.status === "fulfilled"
            ? { ...previous, devices: devices.value }
            : previous;
        });
        setError(
          value.status === "rejected"
            ? jobFailure(value.reason)
            : devices.status === "rejected"
              ? jobFailure(devices.reason)
              : undefined,
        );
        const historyJob = historyTarget.current;
        if (historyJob) {
          const runs = await request((options) =>
            client.history({ id: historyJob.id, limit: 50 }, options),
          );
          if (alive.current && historyTarget.current?.id === historyJob.id)
            setHistory({
              job:
                (value.status === "fulfilled"
                  ? value.value.jobs.find((job) => job.id === historyJob.id)
                  : undefined) ?? historyJob,
              runs,
            });
        }
      }
    } catch (failure) {
      if (alive.current && generation === loadGeneration.current) setError(jobFailure(failure));
    } finally {
      if (alive.current && generation === loadGeneration.current) setLoading(false);
    }
  }, [client, devicePort, request, setHistory]);
  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);
  useEffect(() => {
    const timer = setInterval(() => {
      if (!document.hidden && !busyRef.current) void load();
    }, 15_000);
    const visible = () => {
      if (!document.hidden) void load();
    };
    document.addEventListener("visibilitychange", visible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [load]);
  async function mutate(run: () => Promise<void>) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError(undefined);
    try {
      await run();
    } catch (failure) {
      if (alive.current) setError(jobFailure(failure));
    } finally {
      busyRef.current = false;
      if (alive.current) setBusy(false);
    }
  }
  async function save(input: CloudJobInput) {
    await mutate(async () => {
      if (editing)
        await request((options) =>
          client.update({ id: editing.id, revision: editing.revision, job: input }, options),
        );
      else {
        createId.current ??= crypto.randomUUID();
        const requestId = createId.current;
        await request((options) => client.create({ ...input, requestId }, options));
        createId.current = undefined;
      }
      if (!alive.current) return;
      setEditing(false);
      await load();
    });
  }
  async function toggle(job: CloudJob) {
    await mutate(async () => {
      const { name, cron, timezone, action } = job;
      await request((options) =>
        client.update(
          {
            id: job.id,
            revision: job.revision,
            job: { name, cron, timezone, action, enabled: !job.enabled },
          },
          options,
        ),
      );
      await load();
    });
  }
  async function remove(job: CloudJob) {
    if (
      !(await confirm({
        requestKey: `job-delete:${job.id}`,
        title: c("deleteNamed", { name: job.name }),
        description: t("cloud.deleteHint"),
        confirmLabel: c("delete"),
        cancelLabel: c("cancel"),
      })) ||
      !alive.current
    )
      return;
    await mutate(async () => {
      await request((options) => client.remove({ id: job.id, revision: job.revision }, options));
      if (!alive.current) return;
      if (history?.job.id === job.id) {
        historyTarget.current = undefined;
        setHistory(undefined);
      }
      if (editing && editing.id === job.id) setEditing(false);
      await load();
    });
  }
  async function showHistory(job: CloudJob) {
    const generation = ++historyGeneration.current;
    historyTarget.current = job;
    setError(undefined);
    try {
      const runs = await request((options) => client.history({ id: job.id, limit: 50 }, options));
      if (alive.current && generation === historyGeneration.current) setHistory({ job, runs });
    } catch (failure) {
      if (alive.current && generation === historyGeneration.current) setError(jobFailure(failure));
    }
  }
  async function runNow(job: CloudJob) {
    await mutate(async () => {
      let requestId = manualIds.current.get(job.id);
      if (!requestId) manualIds.current.set(job.id, (requestId = crypto.randomUUID()));
      setPendingRuns([...manualIds.current.keys()]);
      const receipt = await request((options) => client.run({ id: job.id, requestId }, options));
      if (receipt.status !== "unknown") manualIds.current.delete(job.id);
      setPendingRuns([...manualIds.current.keys()]);
      if (!alive.current) return;
      historyTarget.current = job;
      setHistory({
        job,
        runs: [
          receipt,
          ...(history?.job.id === job.id
            ? history.runs.filter((item) => item.id !== receipt.id)
            : []),
        ],
      });
      await load();
    });
  }
  const date = (value: string) => format.dateTime(new Date(value), "timestamp");
  const eligible = data?.jobs.filter(
    (job) =>
      !target ||
      (job.action.type === "agent.run" &&
        job.action.deviceId === target.deviceId &&
        job.action.projectId === target.projectId),
  );
  const shown = eligible?.filter(
    (job) =>
      job.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()) &&
      (status === "all" || job.enabled === (status === "enabled")),
  );
  function emptyTitle() {
    if (eligible?.length) return t("noMatches");
    return t("cloud.empty");
  }
  return (
    <section>
      <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1">
            <h1>{t("cloud.title")}</h1>
            <HelpHint label={t("cloud.help")} description={t("cloud.ownership")} />
          </div>
          <p className="mt-1 max-w-[65ch] text-sm text-muted-foreground">{t("cloud.intro")}</p>
        </div>
        <div className="flex items-center gap-2">
          <IconButton
            label={c("refresh")}
            variant="outline"
            disabled={loading || busy}
            onClick={() => {
              setLoading(true);
              void load();
            }}
          >
            <RefreshIcon aria-hidden="true" />
          </IconButton>
          <Button
            disabled={!data || busy}
            onClick={() => {
              if (editing === null) return;
              setEditing(null);
              setError(undefined);
            }}
          >
            <PlusIcon aria-hidden="true" />
            {t("cloud.create")}
          </Button>
        </div>
      </header>
      {data && !data.enabled && (
        <Alert role="status" className="mb-4">
          <AlertDescription>{t("cloud.JOBS_DISABLED")}</AlertDescription>
        </Alert>
      )}
      {error && (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>
            <p>{t(`cloud.${error}`)}</p>
            {(error === "CONFLICT" || error === "JOB_CONFLICT") && (
              <p className="text-xs">{t("cloud.conflictHint")}</p>
            )}
          </AlertDescription>
        </Alert>
      )}
      {editing !== false && data && (
        <JobForm
          key={editing ? `${editing.id}:${editing.revision}` : "new"}
          job={editing}
          target={target}
          devices={data.devices}
          busy={busy}
          contextLibrary={contextLibrary}
          ownerKey={accountId}
          onSave={save}
          onCancel={() => {
            if (editing === null) createId.current = undefined;
            setEditing(false);
          }}
        />
      )}
      {Boolean(eligible?.length) && (
        <AutomationFilters
          query={query}
          status={status}
          onQueryChange={setQuery}
          onStatusChange={setStatus}
          shown={shown?.length ?? 0}
          total={eligible?.length ?? 0}
        />
      )}
      {!data && loading && <LoadingState label={c("loading")} />}
      {shown?.length === 0 && editing === false && (
        <EmptyState
          className="py-10"
          icon={<ScheduleIcon aria-hidden="true" />}
          title={emptyTitle()}
          description={eligible?.length ? undefined : t("cloud.emptyHint")}
        />
      )}
      {data &&
        shown?.map((job) => (
          <article
            key={job.id}
            className="flex flex-wrap items-center gap-x-4 gap-y-3 border-t border-border py-4"
          >
            <div className="min-w-0 basis-64 flex-1 space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-sm font-medium wrap-anywhere">{job.name}</h2>
                <Badge variant={job.enabled ? "secondary" : "outline"}>
                  {t(job.enabled ? "enabled" : "disabled")}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground wrap-anywhere">
                <code>{job.cron}</code> · {job.timezone} ·{" "}
                {t(job.action.type === "device.sync" ? "cloud.sync" : "cloud.agent")}
              </p>
              <p className="text-xs text-muted-foreground wrap-anywhere">
                {data.devices.find((item) => item.id === job.action.deviceId)?.name ??
                  t("cloud.targetUnavailable")}
              </p>
              {job.enabled && job.nextRunAt && (
                <p className="text-xs text-foreground tabular-nums">
                  {t("next")}: <time dateTime={job.nextRunAt}>{date(job.nextRunAt)}</time>
                </p>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-1">
              <Button
                variant="outline"
                disabled={busy || !data.enabled}
                onClick={() => void runNow(job)}
              >
                <PlayIcon aria-hidden="true" />
                {pendingRuns.includes(job.id) ? t("cloud.checkRun") : t("run")}
              </Button>
              <Button variant="ghost" disabled={busy} onClick={() => void showHistory(job)}>
                {t("history")}
              </Button>
              <IconButton
                label={`${t(job.enabled ? "pause" : "enable")}: ${job.name}`}
                hint={t(job.enabled ? "pause" : "enable")}
                disabled={busy}
                onClick={() => void toggle(job)}
              >
                {job.enabled ? <PauseIcon aria-hidden="true" /> : <PlayIcon aria-hidden="true" />}
              </IconButton>
              <IconButton
                label={`${c("edit")}: ${job.name}`}
                hint={c("edit")}
                disabled={busy}
                onClick={() => {
                  setEditing(job);
                  setError(undefined);
                }}
              >
                <EditIcon aria-hidden="true" />
              </IconButton>
              <IconButton
                label={c("deleteNamed", { name: job.name })}
                hint={c("delete")}
                className="text-destructive-text"
                disabled={busy}
                onClick={() => void remove(job)}
              >
                <DeleteIcon aria-hidden="true" />
              </IconButton>
            </div>
          </article>
        ))}
      {history && (
        <section className="mt-6 space-y-2 border-t border-border pt-4">
          <header className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="min-w-0 text-sm font-semibold wrap-anywhere">
              {history.job.name} · {t("history")}
            </h2>
            <Button
              variant="ghost"
              onClick={() => {
                historyGeneration.current++;
                historyTarget.current = undefined;
                setHistory(undefined);
              }}
            >
              {c("close")}
            </Button>
          </header>
          {!history.runs.length && (
            <p className="text-sm text-muted-foreground">{t("noHistory")}</p>
          )}
          {history.runs.map((run) => (
            <Collapsible key={run.id} className="border-t border-border">
              <CollapsibleTrigger
                render={
                  <Button
                    variant="ghost"
                    className="group h-auto w-full justify-start gap-2 rounded-none px-0 py-3 text-left text-xs font-normal whitespace-normal"
                  />
                }
              >
                <ChevronRightIcon
                  className="shrink-0 group-data-panel-open:rotate-90 motion-safe:transition-transform motion-safe:duration-200 group-focus-visible:transition-none"
                  aria-hidden="true"
                />
                <span className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
                  <time dateTime={run.startedAt} className="tabular-nums">
                    {date(run.startedAt)}
                  </time>
                  <Badge variant={run.status === "failed" ? "destructive" : "secondary"}>
                    {t(`cloud.status_${run.status}`)}
                  </Badge>
                  <span>{t(run.trigger === "manual" ? "cloud.manual" : "cloud.scheduled")}</span>
                </span>
              </CollapsibleTrigger>
              <CollapsibleContent animated>
                <div className="space-y-3 pb-4 pl-6 text-sm">
                  <p>{t(run.action.type === "device.sync" ? "cloud.sync" : "cloud.agent")}</p>
                  {run.action.type === "agent.run" && (
                    <pre className="max-h-48 overflow-auto rounded-md bg-muted p-3 text-xs leading-relaxed whitespace-pre-wrap wrap-anywhere">
                      {run.action.prompt}
                    </pre>
                  )}
                  {run.code && (
                    <Alert variant={run.status === "failed" ? "destructive" : "default"}>
                      <AlertDescription>{t(`cloud.${jobReason(run.code)}`)}</AlertDescription>
                    </Alert>
                  )}
                  {run.status === "unknown" && (
                    <p className="max-w-[65ch] text-muted-foreground">{t("cloud.unknownHint")}</p>
                  )}
                  {run.taskId && <div>{renderTaskLink(run.taskId)}</div>}
                  {run.sync && (
                    <p className="text-xs text-muted-foreground">
                      {t("cloud.syncCompleted", { sequence: String(run.sync.sequence) })}
                    </p>
                  )}
                  {run.finishedAt && (
                    <p className="text-xs text-muted-foreground">
                      {t("cloud.finishedAt", { date: date(run.finishedAt) })}
                    </p>
                  )}
                </div>
              </CollapsibleContent>
            </Collapsible>
          ))}
        </section>
      )}
      {dialog}
    </section>
  );
}
