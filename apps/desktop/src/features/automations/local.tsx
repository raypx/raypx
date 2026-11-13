import { useTranslations } from "../../i18n.js";
import { AutomationFilters } from "@raypx/jobs/client";
import { formText } from "../../form-data.js";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { ClockIcon } from "@raypx/icons/clock";
import { PlusIcon } from "@raypx/icons/plus";
import { Alert, AlertAction, AlertDescription } from "@raypx/ui/components/ui/alert";
import { Button } from "@raypx/ui/components/ui/button";
import { EmptyState } from "@raypx/ui/empty-state";
import { useConfirmation } from "@raypx/ui/confirmation";
import { useFormatter } from "@raypx/i18n/browser";
import type { RootGrant } from "@raypx/contracts/local";
import {
  fileJobIntervals,
  githubJobEvents,
  nextJobRuns,
  type JobDefinition,
  type JobInput,
  type JobRun,
} from "@raypx/core/jobs";
import { LocalJobForm } from "./local-form.js";
import { LocalJobHistory } from "./local-history.js";
import { LocalJobList } from "./local-list.js";
import { localRequest, onLocalEvent } from "../../lib/desktop.js";
import { Link } from "@tanstack/react-router";
import { LocalJobTriggers } from "./local-triggers.js";

export function LocalJobsPage({
  data,
  local,
  desktopAvailable,
  refresh,
  projectId,
}: {
  data: { jobs: JobDefinition[] | null; failed: boolean };
  local: { roots: RootGrant[] | null };
  desktopAvailable: boolean;
  refresh: () => Promise<void>;
  projectId?: string | undefined;
}) {
  const t = useTranslations("automations");
  const commandText = useTranslations("command");
  const c = useTranslations("common");
  const format = useFormatter();
  const { confirm, dialog } = useConfirmation();
  const [jobs, setJobs] = useState(data.jobs);
  const [roots, setRoots] = useState<RootGrant[]>(local.roots ?? []);
  // Keep the last successful lists during a failed background reload.
  if (data.jobs !== null && data.jobs !== jobs) setJobs(data.jobs);
  if (local.roots !== null && local.roots !== roots) setRoots(local.roots);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<JobDefinition | null | false>(false);
  const [triggerJob, setTriggerJob] = useState<JobDefinition | null>(null);
  const [action, setAction] = useState<JobInput["action"]["type"]>("directory.scan");
  const [selectedRoot, setRootId] = useState<string | null>(null);
  const [association, setAssociation] = useState(projectId ?? "");
  const rootId = selectedRoot ?? roots[0]?.id ?? null;
  const [history, setHistory] = useState<{ job: JobDefinition; runs: JobRun[] } | null>(null);
  const historyGeneration = useRef(0);
  const historyTarget = useRef<JobDefinition | null>(null);
  useEffect(
    () => () => {
      historyGeneration.current++;
      historyTarget.current = null;
    },
    [],
  );
  function closeHistory() {
    historyGeneration.current++;
    historyTarget.current = null;
    setHistory(null);
  }
  function edit(job: JobDefinition | null) {
    setTriggerJob(null);
    setEditing(job);
    setAction(job?.action.type ?? "directory.scan");
    setRootId(
      job?.action.type === "directory.scan"
        ? job.action.rootId
        : (projectId ?? roots[0]?.id ?? null),
    );
    setAssociation(job ? (job.projectId ?? "") : (projectId ?? ""));
    setError("");
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const formData = new FormData(event.currentTarget);
    const value = (key: string) => formText(formData, key).trim();
    try {
      if (formData.has("cron")) nextJobRuns({ cron: value("cron"), timezone: value("timezone") });
    } catch {
      event.currentTarget.querySelector<HTMLInputElement>('[aria-invalid="true"]')?.focus();
      return;
    }
    let jobAction: JobInput["action"];
    switch (action) {
      case "directory.scan":
        jobAction = { type: action, rootId: value("rootId"), path: value("path") };
        break;
      case "agent.run": {
        if (!roots.some((root) => root.id === association)) {
          setError(t("local.chooseProject"));
          return;
        }
        const prompt = value("prompt");
        if (!prompt || prompt.length > 32_000) {
          setError(t("local.invalidPrompt"));
          return;
        }
        jobAction = { type: action, prompt };
        break;
      }
      case "command.run":
        try {
          const args: unknown = JSON.parse(value("args") || "[]");
          if (!Array.isArray(args) || args.some((entry) => typeof entry !== "string"))
            throw new Error("arguments");
          jobAction = {
            type: action,
            command: {
              executable: value("executable"),
              args,
              cwd: value("cwd"),
              timeoutMs: 600_000,
            },
          };
        } catch {
          setError(commandText("invalidArguments"));
          return;
        }
        break;
    }
    const triggers: NonNullable<JobInput["triggers"]> = {};
    if (action === "agent.run") {
      if (formData.has("webhook")) triggers.webhook = true;
      if (value("emailSender")) triggers.email = { sender: value("emailSender") };
      if (formData.has("github")) {
        const repository = value("githubRepository");
        const events = githubJobEvents.filter((kind) => formData.has(kind));
        if (!/^[a-z0-9-]+\/[a-z0-9_.-]+$/i.test(repository) || !events.length) {
          setError(t("local.invalidGitHub"));
          return;
        }
        triggers.github = { repository, events };
      }
      if (formData.has("files")) {
        const path = value("watchPath").replaceAll("\\", "/");
        const intervalMinutes = fileJobIntervals.find(
          (interval) => String(interval) === value("watchInterval"),
        );
        if (
          !intervalMinutes ||
          path.startsWith("/") ||
          path.includes(":") ||
          path.includes("\0") ||
          path.split("/").includes("..")
        ) {
          setError(t("local.invalidWatchPath"));
          return;
        }
        triggers.files = { path, intervalMinutes };
      }
      if (!formData.has("cron") && !Object.keys(triggers).length) {
        setError(t("local.invalidTrigger"));
        return;
      }
    }
    const input: JobInput = {
      ...(association ? { projectId: association } : {}),
      name: value("name"),
      ...(formData.has("cron") ? { cron: value("cron"), timezone: value("timezone") } : {}),
      ...(Object.keys(triggers).length ? { triggers } : {}),
      enabled: editing ? editing.enabled : true,
      action: jobAction,
    };
    setBusy(true);
    setError("");
    try {
      const saved = editing
        ? await localRequest("jobs.update", { ...input, id: editing.id })
        : await localRequest("jobs.create", input);
      setEditing(false);
      if (saved.triggers?.webhook || saved.triggers?.email || saved.triggers?.github)
        setTriggerJob(saved);
      await refresh();
    } catch {
      setError(c("error"));
    } finally {
      setBusy(false);
    }
  }
  async function update(job: JobDefinition) {
    setBusy(true);
    setError("");
    try {
      await localRequest("jobs.update", { ...job, enabled: !job.enabled });
      await refresh();
    } catch {
      setError(c("error"));
    } finally {
      setBusy(false);
    }
  }
  async function remove(job: JobDefinition) {
    if (
      !(await confirm({
        title: c("deleteNamed", { name: job.name }),
        description: c("confirmDelete"),
        confirmLabel: c("delete"),
        cancelLabel: c("cancel"),
      }))
    )
      return;
    setBusy(true);
    setError("");
    try {
      await localRequest("jobs.delete", { id: job.id });
      if (history?.job.id === job.id || historyTarget.current?.id === job.id) closeHistory();
      if (triggerJob?.id === job.id) setTriggerJob(null);
      await refresh();
    } catch {
      setError(c("error"));
    } finally {
      setBusy(false);
    }
  }
  const showHistory = useCallback(
    async (job: JobDefinition) => {
      const generation = ++historyGeneration.current;
      historyTarget.current = job;
      setError("");
      try {
        const runs = await localRequest("jobs.history", { id: job.id });
        if (generation === historyGeneration.current) setHistory({ job, runs });
      } catch {
        if (generation === historyGeneration.current) setError(c("error"));
      }
    },
    [c],
  );
  useEffect(() => {
    if (!desktopAvailable) return;
    return onLocalEvent((event) => {
      const job = historyTarget.current;
      if (
        job &&
        (((event.event === "job.finished" || event.event === "job.started") &&
          event.data.jobId === job.id) ||
          (event.event === "engine.status" && event.data.status === "ready"))
      )
        void showHistory(job);
    });
  }, [desktopAvailable, showHistory]);
  async function run(job: JobDefinition) {
    const generation = ++historyGeneration.current;
    historyTarget.current = job;
    setBusy(true);
    setError("");
    try {
      await localRequest("jobs.run", { id: job.id });
      if (generation === historyGeneration.current) await showHistory(job);
      await refresh();
    } catch {
      setError(c("error"));
    } finally {
      setBusy(false);
    }
  }
  const date = (value: string) => format.dateTime(new Date(value), "timestamp");
  const eligible = jobs?.filter((job) => !projectId || job.projectId === projectId);
  const shown = eligible?.filter(
    (job) =>
      job.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()) &&
      (status === "all" || job.enabled === (status === "enabled")),
  );
  function emptyTitle() {
    if (eligible?.length) return t("noMatches");
    return t("local.empty");
  }
  return (
    <section>
      <h1 className="sr-only">{c("jobs")}</h1>
      <header className="mb-6 flex flex-wrap items-center justify-end gap-3">
        <Button disabled={!desktopAvailable} onClick={() => edit(null)}>
          <PlusIcon data-icon="inline-start" />
          {t("local.create")}
        </Button>
      </header>
      {projectId && (
        <Link
          to="/automations"
          search={{ scope: "local" }}
          className="mb-5 inline-block text-sm underline underline-offset-4"
        >
          {t("local.allAutomations")}
        </Link>
      )}
      {!desktopAvailable && (
        <Alert role="status" className="mb-4">
          <AlertDescription className="wrap-anywhere">{c("desktopOnly")}</AlertDescription>
        </Alert>
      )}
      {(error || data.failed) && (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription className="wrap-anywhere">{error || c("error")}</AlertDescription>
          {data.failed && (
            <AlertAction>
              <Button size="xs" variant="ghost" disabled={busy} onClick={() => void refresh()}>
                {c("refresh")}
              </Button>
            </AlertAction>
          )}
        </Alert>
      )}
      {editing !== false && (
        <LocalJobForm
          key={editing?.id ?? "new"}
          editing={editing}
          busy={busy}
          roots={roots}
          projectId={projectId}
          action={action}
          rootId={rootId}
          association={association}
          onActionChange={setAction}
          onRootChange={setRootId}
          onAssociationChange={setAssociation}
          onSubmit={(event) => void save(event)}
          onCancel={() => setEditing(false)}
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
      {shown?.length === 0 && editing === false ? (
        <EmptyState
          icon={<ClockIcon />}
          title={emptyTitle()}
          description={eligible?.length ? undefined : t("local.emptyHint")}
        />
      ) : (
        <LocalJobList
          jobs={shown ?? []}
          roots={roots}
          busy={busy}
          date={date}
          onRun={(job) => void run(job)}
          onHistory={(job) => void showHistory(job)}
          onToggle={(job) => void update(job)}
          onEdit={edit}
          onRemove={(job) => void remove(job)}
          onTriggers={setTriggerJob}
        />
      )}
      {triggerJob && desktopAvailable && (
        <LocalJobTriggers
          key={triggerJob.id}
          job={triggerJob}
          onClose={() => setTriggerJob(null)}
        />
      )}
      {dialog}
      {history && <LocalJobHistory history={history} date={date} onClose={closeHistory} />}
    </section>
  );
}
