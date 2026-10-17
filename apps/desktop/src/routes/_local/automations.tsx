import { createFileRoute, getRouteApi, useRouter } from "@tanstack/react-router";
import { formText } from "../../form-data";
import { useState, type FormEvent } from "react";
import { Clock, Pause, Pencil, Play, Plus, Trash2 } from "lucide-react";
import { Button } from "@raypx/ui/components/ui/button";
import { Input } from "@raypx/ui/components/ui/input";
import { useLocale, useTranslations } from "@raypx/i18n/browser";
import type { JobDefinition, JobInput, JobRun, RootGrant } from "@raypx/contracts/local";
import { localRequest } from "../../lib/desktop";

export const Route = createFileRoute("/_local/automations")({
  preload: false,
  loader: async ({ context }) => {
    if (!context.desktopAvailable) return { jobs: null, failed: false };
    try {
      return { jobs: await localRequest<JobDefinition[]>("jobs.list", {}), failed: false };
    } catch {
      return { jobs: null, failed: true };
    }
  },
  pendingComponent: JobsPending,
  component: JobsPage,
});

function JobsPending() {
  const c = useTranslations("common");
  return (
    <section className="mx-auto max-w-[1320px] px-14 pt-13 pb-20 max-[1100px]:px-8 max-[1100px]:pt-9 max-[1100px]:pb-14">
      <p role="status">{c("loading")}</p>
    </section>
  );
}

function JobsPage() {
  const router = useRouter();
  const data = Route.useLoaderData();
  const local = getRouteApi("/_local").useLoaderData();
  const { desktopAvailable } = Route.useRouteContext();
  const t = useTranslations("jobs");
  const c = useTranslations("common");
  const locale = useLocale();
  const [jobs, setJobs] = useState(data.jobs);
  const [roots, setRoots] = useState<RootGrant[]>(local.roots ?? []);
  // Keep the last successful lists during a failed background reload.
  if (data.jobs !== null && data.jobs !== jobs) setJobs(data.jobs);
  if (local.roots !== null && local.roots !== roots) setRoots(local.roots);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<JobDefinition | null | false>(false);
  const [action, setAction] = useState("directory.scan");
  const [history, setHistory] = useState<{ job: JobDefinition; runs: JobRun[] } | null>(null);
  function refresh() {
    return router.invalidate({
      filter: (match) =>
        match.routeId === Route.id || (local.roots === null && match.routeId === "/_local"),
    });
  }
  function edit(job: JobDefinition | null) {
    setEditing(job);
    setAction(job?.action.type ?? "directory.scan");
    setError("");
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const data = new FormData(event.currentTarget);
    const value = (key: string) => formText(data, key).trim();
    let input: JobInput;
    try {
      const args: unknown = JSON.parse(value("args") || "[]");
      if (!Array.isArray(args) || args.some((entry) => typeof entry !== "string"))
        throw new Error("arguments");
      input = {
        name: value("name"),
        cron: value("cron"),
        timezone: value("timezone"),
        enabled: editing ? editing.enabled : true,
        action:
          action === "directory.scan"
            ? { type: "directory.scan", rootId: value("rootId"), path: value("path") }
            : {
                type: "command.run",
                command: {
                  executable: value("executable"),
                  args,
                  cwd: value("cwd"),
                  timeoutMs: 600000,
                },
              },
      };
    } catch {
      setError(t("invalidArguments"));
      return;
    }
    setBusy(true);
    setError("");
    try {
      if (editing) await localRequest("jobs.update", { ...input, id: editing.id });
      else await localRequest("jobs.create", input);
      setEditing(false);
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
    if (!window.confirm(c("confirmDelete"))) return;
    setBusy(true);
    setError("");
    try {
      await localRequest("jobs.delete", { id: job.id });
      if (history?.job.id === job.id) setHistory(null);
      await refresh();
    } catch {
      setError(c("error"));
    } finally {
      setBusy(false);
    }
  }
  async function showHistory(job: JobDefinition) {
    setError("");
    try {
      setHistory({ job, runs: await localRequest<JobRun[]>("jobs.history", { id: job.id }) });
    } catch {
      setError(c("error"));
    }
  }
  async function run(job: JobDefinition) {
    setBusy(true);
    setError("");
    try {
      await localRequest("jobs.run", { id: job.id });
      await showHistory(job);
      await refresh();
    } catch {
      setError(c("error"));
    } finally {
      setBusy(false);
    }
  }
  const date = (value: string) =>
    new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(
      new Date(value),
    );
  const command = editing && editing.action.type === "command.run" ? editing.action.command : null;
  return (
    <section className="mx-auto max-w-[1320px] px-14 pt-13 pb-20 max-[1100px]:px-8 max-[1100px]:pt-9 max-[1100px]:pb-14">
      <header className="mb-10 flex items-start justify-between gap-6 max-[1100px]:flex-col max-[1100px]:gap-5">
        <div>
          <h1>{t("title")}</h1>
          <p className="mt-[9px] max-w-[64ch] text-muted-foreground">{t("intro")}</p>
        </div>
        <Button disabled={!desktopAvailable} onClick={() => edit(null)}>
          <Plus size={16} />
          {t("create")}
        </Button>
      </header>
      {!desktopAvailable && (
        <p className="mb-5 flex items-center gap-2 rounded-lg bg-muted px-3.5 py-3 text-[13px] [overflow-wrap:anywhere]">
          {c("desktopOnly")}
        </p>
      )}
      {(error || data.failed) && (
        <p
          role="alert"
          className="mb-5 flex items-center gap-2 rounded-lg bg-[color-mix(in_oklch,var(--destructive)_8%,var(--background))] px-3.5 py-3 text-[13px] text-destructive [overflow-wrap:anywhere]"
        >
          {error || c("error")}
          {data.failed && (
            <Button variant="ghost" disabled={busy} onClick={() => void refresh()}>
              {c("refresh")}
            </Button>
          )}
        </p>
      )}
      {editing !== false && (
        <section className="job-form-panel">
          <h2>{t("create")}</h2>
          <form
            key={editing?.id ?? "new"}
            onSubmit={save}
            className="job-form flex flex-col gap-[19px] [&_label]:flex [&_label]:flex-col [&_label]:gap-[7px] [&_label]:text-[13px] [&_label]:font-medium [&_input]:min-h-[39px] [&>button]:mt-1"
          >
            <label htmlFor="job-name">
              {c("name")}
              <Input
                id="job-name"
                name="name"
                defaultValue={editing?.name ?? ""}
                maxLength={120}
                required
              />
            </label>
            <div className="form-row">
              <label htmlFor="job-cron">
                {t("schedule")}
                <Input
                  id="job-cron"
                  name="cron"
                  defaultValue={editing?.cron ?? "0 9 * * 1-5"}
                  required
                />
                <span className="field-hint">{t("timezoneHint")}</span>
              </label>
              <label htmlFor="job-timezone">
                {t("timezone")}
                <Input
                  id="job-timezone"
                  name="timezone"
                  defaultValue={
                    editing?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone
                  }
                  required
                />
              </label>
            </div>
            <label htmlFor="job-action">
              {t("action")}
              <select
                id="job-action"
                value={action}
                onChange={(event) => setAction(event.target.value)}
              >
                <option value="directory.scan">{t("scan")}</option>
                <option value="command.run">{t("command")}</option>
              </select>
            </label>
            {action === "directory.scan" ? (
              <div className="form-row">
                <label htmlFor="job-root">
                  {t("folder")}
                  <select
                    id="job-root"
                    name="rootId"
                    defaultValue={
                      editing && editing.action.type === "directory.scan"
                        ? editing.action.rootId
                        : roots[0]?.id
                    }
                    required
                  >
                    {!roots.length && <option value="">{t("chooseFolderFirst")}</option>}
                    {roots.map((root) => (
                      <option value={root.id} key={root.id}>
                        {root.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label htmlFor="job-path">
                  {t("relativePath")}
                  <Input
                    id="job-path"
                    name="path"
                    defaultValue={
                      editing && editing.action.type === "directory.scan" ? editing.action.path : ""
                    }
                  />
                </label>
              </div>
            ) : (
              <>
                <label htmlFor="job-executable">
                  {t("executable")}
                  <Input
                    id="job-executable"
                    name="executable"
                    defaultValue={command?.executable ?? ""}
                    required
                  />
                </label>
                <label htmlFor="job-args">
                  {t("arguments")}
                  <Input
                    id="job-args"
                    name="args"
                    defaultValue={JSON.stringify(command?.args ?? [])}
                  />
                </label>
                <label htmlFor="job-cwd">
                  {t("cwd")}
                  <Input id="job-cwd" name="cwd" defaultValue={command?.cwd ?? ""} required />
                </label>
                <p className="field-hint">{t("commandHint")}</p>
              </>
            )}
            <div className="flex flex-wrap items-center gap-5">
              <Button
                type="submit"
                disabled={busy || (action === "directory.scan" && !roots.length)}
              >
                {busy ? c("working") : c("save")}
              </Button>
              <Button variant="ghost" disabled={busy} onClick={() => setEditing(false)}>
                {c("cancel")}
              </Button>
            </div>
          </form>
        </section>
      )}
      {jobs?.length === 0 && editing === false ? (
        <div className="flex flex-col items-center px-6 py-20 text-center">
          <Clock size={44} strokeWidth={1} className="mb-5 text-muted-foreground" />
          <h2 className="text-xl">{t("empty")}</h2>
          <p className="mt-[9px] max-w-[50ch] text-muted-foreground">{t("emptyHint")}</p>
        </div>
      ) : (
        <div className="job-list">
          {jobs?.map((job) => (
            <article className="job-row" key={job.id}>
              <div className="job-icon">
                <Clock size={21} />
              </div>
              <div className="job-main">
                <div className="job-title">
                  <h2>{job.name}</h2>
                  <span className="small-badge">{t(job.enabled ? "enabled" : "disabled")}</span>
                </div>
                <p>
                  <code>{job.cron}</code>
                  <span>·</span>
                  {job.timezone}
                  <span>·</span>
                  {t(job.action.type === "directory.scan" ? "scan" : "command")}
                </p>
                {job.nextRuns[0] && job.enabled && (
                  <p>
                    {t("next")}: {date(job.nextRuns[0])}
                  </p>
                )}
              </div>
              <div className="job-actions">
                <Button variant="outline" disabled={busy} onClick={() => void run(job)}>
                  <Play size={14} />
                  {t("run")}
                </Button>
                <Button variant="ghost" disabled={busy} onClick={() => void showHistory(job)}>
                  {t("history")}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  disabled={busy}
                  aria-label={`${t(job.enabled ? "pause" : "enable")}: ${job.name}`}
                  onClick={() => void update(job)}
                >
                  {job.enabled ? <Pause /> : <Play />}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  disabled={busy}
                  aria-label={`${c("edit")}: ${job.name}`}
                  onClick={() => edit(job)}
                >
                  <Pencil />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  disabled={busy}
                  aria-label={`${c("delete")}: ${job.name}`}
                  onClick={() => void remove(job)}
                >
                  <Trash2 />
                </Button>
              </div>
            </article>
          ))}
        </div>
      )}
      {history && (
        <section className="history-panel">
          <header className="editor-header">
            <h2>
              {history.job.name} · {t("history")}
            </h2>
            <Button variant="ghost" onClick={() => setHistory(null)}>
              {c("close")}
            </Button>
          </header>
          {history.runs.length === 0 ? (
            <p className="text-muted-foreground">{t("noHistory")}</p>
          ) : (
            history.runs.map((run) => (
              <details className="run-row" key={run.id}>
                <summary>
                  <span>{date(run.startedAt)}</span>
                  <span className="small-badge">{c(run.status)}</span>
                  <span>{run.exitCode === null ? "" : `${t("exit")}: ${run.exitCode}`}</span>
                </summary>
                {run.output && <pre>{run.output}</pre>}
              </details>
            ))
          )}
          {history.job.nextRuns.length > 0 && (
            <div className="next-runs">
              <h3>{t("preview")}</h3>
              <ul>
                {history.job.nextRuns.map((value) => (
                  <li key={value}>{date(value)}</li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}
    </section>
  );
}
