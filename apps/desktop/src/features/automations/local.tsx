import { formText } from "../../form-data";
import { useState, type FormEvent } from "react";
import { ChevronRight, Clock, Pause, Pencil, Play, Plus, Trash2 } from "lucide-react";
import { Button } from "@raypx/ui/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@raypx/ui/components/ui/collapsible";
import { Input } from "@raypx/ui/components/ui/input";
import { SelectField } from "@raypx/ui/select-field";
import { useConfirmation } from "@raypx/ui/confirmation";
import { useLocale, useTranslations } from "@raypx/i18n/browser";
import type { JobDefinition, JobInput, JobRun, RootGrant } from "@raypx/contracts/local";
import { localRequest } from "../../lib/desktop";

export function LocalJobsPage({
  data,
  local,
  desktopAvailable,
  refresh,
}: {
  data: { jobs: JobDefinition[] | null; failed: boolean };
  local: { roots: RootGrant[] | null };
  desktopAvailable: boolean;
  refresh: () => Promise<void>;
}) {
  const t = useTranslations("jobs");
  const c = useTranslations("common");
  const locale = useLocale();
  const { confirm, dialog } = useConfirmation();
  const [jobs, setJobs] = useState(data.jobs);
  const [roots, setRoots] = useState<RootGrant[]>(local.roots ?? []);
  // Keep the last successful lists during a failed background reload.
  if (data.jobs !== null && data.jobs !== jobs) setJobs(data.jobs);
  if (local.roots !== null && local.roots !== roots) setRoots(local.roots);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<JobDefinition | null | false>(false);
  const [action, setAction] = useState("directory.scan");
  const [selectedRoot, setRootId] = useState<string | null>(null);
  const rootId = selectedRoot ?? roots[0]?.id ?? null;
  const [history, setHistory] = useState<{ job: JobDefinition; runs: JobRun[] } | null>(null);
  function edit(job: JobDefinition | null) {
    setEditing(job);
    setAction(job?.action.type ?? "directory.scan");
    setRootId(job?.action.type === "directory.scan" ? job.action.rootId : (roots[0]?.id ?? null));
    setError("");
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const formData = new FormData(event.currentTarget);
    const value = (key: string) => formText(formData, key).trim();
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
        <section className="mb-8 rounded-lg border border-border bg-sidebar p-6">
          <h2 className="mb-5.5">{t("create")}</h2>
          <form
            key={editing?.id ?? "new"}
            onSubmit={save}
            className="flex max-w-180 flex-col gap-[19px] [&_label]:flex [&_label]:flex-col [&_label]:gap-[7px] [&_label]:text-[13px] [&_label]:font-medium [&_input]:min-h-[39px] [&>button]:mt-1"
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
            <div className="flex gap-5 [&>label]:min-w-0 [&>label]:flex-1">
              <label htmlFor="job-cron">
                {t("schedule")}
                <Input
                  id="job-cron"
                  name="cron"
                  defaultValue={editing?.cron ?? "0 9 * * 1-5"}
                  required
                />
                <span className="text-[12px] leading-[1.6] font-normal text-muted-foreground">
                  {t("timezoneHint")}
                </span>
              </label>
              <label htmlFor="job-timezone">
                {t("timezone")}
                <Input
                  id="job-timezone"
                  name="timezone"
                  defaultValue={
                    editing?.timezone ?? new Intl.DateTimeFormat().resolvedOptions().timeZone
                  }
                  required
                />
              </label>
            </div>
            <label htmlFor="job-action">
              {t("action")}
              <SelectField
                id="job-action"
                value={action}
                onValueChange={setAction}
                options={[
                  { value: "directory.scan", label: t("scan") },
                  { value: "command.run", label: t("command") },
                ]}
              />
            </label>
            {action === "directory.scan" ? (
              <div className="flex gap-5 [&>label]:min-w-0 [&>label]:flex-1">
                <label htmlFor="job-root">
                  {t("folder")}
                  <SelectField
                    id="job-root"
                    name="rootId"
                    value={rootId}
                    onValueChange={setRootId}
                    required
                    placeholder={t("chooseFolderFirst")}
                    options={roots.map((root) => ({ value: root.id, label: root.name }))}
                  />
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
                <p className="text-[12px] leading-[1.6] font-normal text-muted-foreground">
                  {t("commandHint")}
                </p>
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
        <div>
          {jobs?.map((job) => (
            <article
              className="flex items-start gap-4 border-t border-border py-6 max-[1100px]:flex-wrap"
              key={job.id}
            >
              <div className="grid size-9.5 shrink-0 place-items-center rounded-[9px] border border-border text-muted-foreground">
                <Clock size={21} />
              </div>
              <div className="min-w-30 flex-1">
                <div className="mb-2 flex items-center gap-2.5">
                  <h2 className="text-[15px]">{job.name}</h2>
                  <span className="rounded-[5px] bg-muted px-1.75 py-0.5 text-[11px] whitespace-nowrap text-muted-foreground">
                    {t(job.enabled ? "enabled" : "disabled")}
                  </span>
                </div>
                <p className="flex flex-wrap items-center gap-1.75 text-[12px] text-muted-foreground">
                  <code>{job.cron}</code>
                  <span>·</span>
                  {job.timezone}
                  <span>·</span>
                  {t(job.action.type === "directory.scan" ? "scan" : "command")}
                </p>
                {job.nextRuns[0] && job.enabled && (
                  <p className="mt-1.5 flex flex-wrap items-center gap-1.75 text-[12px] text-muted-foreground">
                    {t("next")}: {date(job.nextRuns[0])}
                  </p>
                )}
              </div>
              <div className="flex max-w-82.5 flex-wrap items-center justify-end gap-0.75 max-[1100px]:ml-13.5 max-[1100px]:max-w-none">
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
                  aria-label={c("deleteNamed", { name: job.name })}
                  onClick={() => void remove(job)}
                >
                  <Trash2 />
                </Button>
              </div>
            </article>
          ))}
        </div>
      )}
      {dialog}
      {history && (
        <section className="mt-8">
          <header className="flex items-center justify-between gap-5 border-b border-border py-3 pr-4">
            <h2 className="text-[length:inherit] leading-[inherit] font-medium wrap-anywhere">
              {history.job.name} · {t("history")}
            </h2>
            <Button variant="ghost" onClick={() => setHistory(null)}>
              {c("close")}
            </Button>
          </header>
          {history.runs.length === 0 ? (
            <p className="text-muted-foreground">{t("noHistory")}</p>
          ) : (
            history.runs.map((jobRun) => (
              <Collapsible className="border-b border-border" key={jobRun.id}>
                <CollapsibleTrigger
                  render={
                    <Button
                      variant="ghost"
                      className="group h-auto w-full flex-wrap justify-start gap-5 rounded-none px-0 py-3.5 text-xs font-normal"
                    />
                  }
                >
                  <ChevronRight aria-hidden="true" className="group-data-panel-open:rotate-90" />
                  <span>{date(jobRun.startedAt)}</span>
                  <span className="rounded-[5px] bg-muted px-1.75 py-0.5 text-[11px] whitespace-nowrap text-muted-foreground">
                    {c(jobRun.status)}
                  </span>
                  <span>{jobRun.exitCode === null ? "" : `${t("exit")}: ${jobRun.exitCode}`}</span>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  {jobRun.output && (
                    <pre className="max-h-90 overflow-auto rounded-[7px] bg-muted p-4 font-mono text-xs leading-[1.65] whitespace-pre-wrap wrap-anywhere">
                      {jobRun.output}
                    </pre>
                  )}
                </CollapsibleContent>
              </Collapsible>
            ))
          )}
          {history.job.nextRuns.length > 0 && (
            <div className="mt-6 text-[12px] text-muted-foreground">
              <h3 className="text-[13px] font-medium text-foreground">{t("preview")}</h3>
              <ul className="pl-4.5 leading-[1.9]">
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
