import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { CalendarClock, ChevronRight, Pause, Pencil, Play, Plus, Trash2 } from "lucide-react";
import { useFormatter, useTranslations } from "@raypx/i18n/browser";
import { Button } from "@raypx/ui/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@raypx/ui/components/ui/collapsible";
import { useConfirmation } from "@raypx/ui/confirmation";
import { LoadingState } from "@raypx/ui/loading-state";
import type { CloudJob, CloudJobInput, CloudJobRun } from "../model.js";
import type { CloudJobsPort, JobDevicesPort, JobDevice, JobReadOptions } from "./ports.js";
import { JobForm } from "./job-form.js";
import { jobFailure, jobReason } from "./errors.js";
import type { MemoryClientPort } from "@raypx/memory/client";

export interface CloudJobsPageProps {
  accountId: string;
  client: CloudJobsPort;
  devices: JobDevicesPort;
  renderTaskLink: (taskId: string) => ReactNode;
  contextLibrary?: MemoryClientPort | undefined;
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
}: CloudJobsPageProps) {
  const t = useTranslations("cloudJobs"),
    j = useTranslations("jobs"),
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
        const target = historyTarget.current;
        if (target) {
          const runs = await request((options) =>
            client.history({ id: target.id, limit: 50 }, options),
          );
          if (alive.current && historyTarget.current?.id === target.id)
            setHistory({
              job:
                (value.status === "fulfilled"
                  ? value.value.jobs.find((job) => job.id === target.id)
                  : undefined) ?? target,
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
        description: t("deleteHint"),
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
  return (
    <section>
      <header className="mb-7 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1>{t("title")}</h1>
          <p className="mt-2 max-w-[65ch] text-sm text-muted-foreground">{t("intro")}</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            disabled={loading || busy}
            onClick={() => {
              setLoading(true);
              void load();
            }}
          >
            {c("refresh")}
          </Button>
          <Button
            disabled={!data || busy}
            onClick={() => {
              if (editing === null) return;
              setEditing(null);
              setError(undefined);
            }}
          >
            <Plus aria-hidden="true" />
            {t("create")}
          </Button>
        </div>
      </header>
      <p className="mb-5 max-w-[75ch] text-xs leading-relaxed text-muted-foreground">
        {t("ownership")}
      </p>
      {data && !data.enabled && (
        <p role="status" className="mb-5 rounded-md bg-muted p-3 text-sm">
          {t("JOBS_DISABLED")}
        </p>
      )}
      {error && (
        <div role="alert" className="mb-5 space-y-2 text-sm text-destructive-text">
          <p>{t(error)}</p>
          {(error === "CONFLICT" || error === "JOB_CONFLICT") && (
            <p className="text-xs">{t("conflictHint")}</p>
          )}
        </div>
      )}
      {editing !== false && data && (
        <JobForm
          key={editing ? `${editing.id}:${editing.revision}` : "new"}
          job={editing}
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
      {!data && loading && <LoadingState label={c("loading")} />}
      {data?.jobs.length === 0 && editing === false && (
        <div className="py-14 text-center">
          <CalendarClock className="mx-auto mb-4 size-9 text-muted-foreground" />
          <h2 className="text-lg">{t("empty")}</h2>
          <p className="mx-auto mt-2 max-w-[55ch] text-sm text-muted-foreground">
            {t("emptyHint")}
          </p>
        </div>
      )}
      {data?.jobs.map((job) => (
        <article
          key={job.id}
          className="flex flex-wrap items-start gap-4 border-t border-border py-5"
        >
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-medium wrap-anywhere">{job.name}</h2>
              <span className="rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                {j(job.enabled ? "enabled" : "disabled")}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              <code>{job.cron}</code> · {job.timezone} ·{" "}
              {t(job.action.type === "device.sync" ? "sync" : "agent")}
            </p>
            <p className="text-xs text-muted-foreground">
              {data.devices.find((item) => item.id === job.action.deviceId)?.name ??
                t("targetUnavailable")}
            </p>
            {job.enabled && job.nextRunAt && (
              <p className="text-xs text-muted-foreground">
                {j("next")}: {date(job.nextRunAt)}
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-1">
            <Button
              variant="outline"
              disabled={busy || !data.enabled}
              onClick={() => void runNow(job)}
            >
              <Play aria-hidden="true" />
              {pendingRuns.includes(job.id) ? t("checkRun") : j("run")}
            </Button>
            <Button variant="ghost" disabled={busy} onClick={() => void showHistory(job)}>
              {j("history")}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label={`${j(job.enabled ? "pause" : "enable")}: ${job.name}`}
              disabled={busy}
              onClick={() => void toggle(job)}
            >
              {job.enabled ? <Pause /> : <Play />}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label={`${c("edit")}: ${job.name}`}
              disabled={busy}
              onClick={() => {
                setEditing(job);
                setError(undefined);
              }}
            >
              <Pencil />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label={c("deleteNamed", { name: job.name })}
              disabled={busy}
              onClick={() => void remove(job)}
            >
              <Trash2 />
            </Button>
          </div>
        </article>
      ))}
      {history && (
        <section className="mt-8 space-y-3">
          <header className="flex items-center justify-between gap-3">
            <h2 className="text-base font-semibold">
              {history.job.name} · {j("history")}
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
            <p className="text-sm text-muted-foreground">{j("noHistory")}</p>
          )}
          {history.runs.map((run) => (
            <Collapsible key={run.id} className="border-t border-border">
              <CollapsibleTrigger
                render={
                  <Button
                    variant="ghost"
                    className="group h-auto w-full flex-wrap justify-start gap-3 rounded-none px-0 py-3 text-xs font-normal"
                  />
                }
              >
                <ChevronRight className="group-data-panel-open:rotate-90" aria-hidden="true" />
                <span>{date(run.startedAt)}</span>
                <span>{t(`status_${run.status}`)}</span>
                <span>{t(run.trigger === "manual" ? "manual" : "scheduled")}</span>
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-3 pb-4 text-sm">
                <p>{t(run.action.type === "device.sync" ? "sync" : "agent")}</p>
                {run.action.type === "agent.run" && (
                  <pre className="max-h-48 overflow-auto rounded-md bg-muted p-3 text-xs whitespace-pre-wrap wrap-anywhere">
                    {run.action.prompt}
                  </pre>
                )}
                {run.code && <p>{t(jobReason(run.code))}</p>}
                {run.status === "unknown" && (
                  <p className="max-w-[65ch] text-muted-foreground">{t("unknownHint")}</p>
                )}
                {run.taskId && <div>{renderTaskLink(run.taskId)}</div>}
                {run.sync && (
                  <p className="text-xs text-muted-foreground">
                    {t("syncCompleted", { sequence: String(run.sync.sequence) })}
                  </p>
                )}
                {run.finishedAt && (
                  <p className="text-xs text-muted-foreground">
                    {t("finishedAt", { date: date(run.finishedAt) })}
                  </p>
                )}
              </CollapsibleContent>
            </Collapsible>
          ))}
        </section>
      )}
      {dialog}
    </section>
  );
}
