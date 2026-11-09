import { formText } from "../../form-data.ts";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { ChevronRightIcon } from "@raypx/icons/chevron-right";
import { ClockIcon } from "@raypx/icons/clock";
import { PauseIcon } from "@raypx/icons/pause";
import { EditIcon } from "@raypx/icons/edit";
import { PlayIcon } from "@raypx/icons/play";
import { PlusIcon } from "@raypx/icons/plus";
import { DeleteIcon } from "@raypx/icons/delete";
import { Alert, AlertAction, AlertDescription } from "@raypx/ui/components/ui/alert";
import { Badge } from "@raypx/ui/components/ui/badge";
import { Button } from "@raypx/ui/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@raypx/ui/components/ui/collapsible";
import { Field, FieldGroup, FieldLabel } from "@raypx/ui/components/ui/field";
import { Input } from "@raypx/ui/components/ui/input";
import { EmptyState } from "@raypx/ui/empty-state";
import { IconButton } from "@raypx/ui/icon-button";
import { SelectField } from "@raypx/ui/select-field";
import { useConfirmation } from "@raypx/ui/confirmation";
import { useFormatter, useTranslations } from "@raypx/i18n/browser";
import type { RootGrant } from "@raypx/contracts/local";
import { nextJobRuns, type JobDefinition, type JobInput, type JobRun } from "@raypx/jobs-model";
import { ScheduleFields } from "./schedule-fields.tsx";
import { localRequest, onLocalEvent } from "../../lib/desktop.ts";
import { Link } from "@tanstack/react-router";

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
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<JobDefinition | null | false>(false);
  const [action, setAction] = useState("directory.scan");
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
      nextJobRuns({ cron: value("cron"), timezone: value("timezone") });
    } catch {
      event.currentTarget.querySelector<HTMLInputElement>('[aria-invalid="true"]')?.focus();
      return;
    }
    let input: JobInput;
    try {
      const args: unknown = JSON.parse(value("args") || "[]");
      if (!Array.isArray(args) || args.some((entry) => typeof entry !== "string"))
        throw new Error("arguments");
      input = {
        ...(association ? { projectId: association } : {}),
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
      setError(commandText("invalidArguments"));
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
      if (history?.job.id === job.id || historyTarget.current?.id === job.id) closeHistory();
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
        ((event.event === "job.finished" && event.data.jobId === job.id) ||
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
  const command = editing && editing.action.type === "command.run" ? editing.action.command : null;
  const shown = projectId ? jobs?.filter((job) => job.projectId === projectId) : jobs;
  return (
    <section>
      <h1 className="sr-only">{t("local.title")}</h1>
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
        <section className="mb-8 rounded-lg border border-border bg-sidebar p-6">
          <h2 className="mb-6 text-sm font-medium">{t(editing ? "local.edit" : "local.create")}</h2>
          <form key={editing?.id ?? "new"} onSubmit={save} className="max-w-3xl">
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="job-project">{t("local.projectAssociation")}</FieldLabel>
                <SelectField
                  id="job-project"
                  value={association}
                  onValueChange={setAssociation}
                  options={[
                    { value: "", label: t("local.globalAutomation") },
                    ...roots.map((root) => ({ value: root.id, label: root.name })),
                    ...(association && !roots.some((root) => root.id === association)
                      ? [{ value: association, label: t("local.projectUnavailable") }]
                      : []),
                  ]}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="job-name">{c("name")}</FieldLabel>
                <Input
                  id="job-name"
                  name="name"
                  defaultValue={editing?.name ?? ""}
                  maxLength={120}
                  required
                />
              </Field>
              <ScheduleFields
                cron={editing?.cron ?? "0 9 * * 1-5"}
                timezone={editing?.timezone ?? new Intl.DateTimeFormat().resolvedOptions().timeZone}
                disabled={busy}
              />
              <Field>
                <FieldLabel htmlFor="job-action">{t("action")}</FieldLabel>
                <SelectField
                  id="job-action"
                  value={action}
                  onValueChange={setAction}
                  options={[
                    { value: "directory.scan", label: t("local.scan") },
                    { value: "command.run", label: t("local.command") },
                  ]}
                />
              </Field>
              {action === "directory.scan" ? (
                <FieldGroup className="@md/field-group:flex-row">
                  <Field className="min-w-0 flex-1">
                    <FieldLabel htmlFor="job-root">{t("local.folder")}</FieldLabel>
                    <SelectField
                      id="job-root"
                      name="rootId"
                      value={rootId}
                      onValueChange={setRootId}
                      required
                      placeholder={t("local.chooseFolderFirst")}
                      options={roots.map((root) => ({ value: root.id, label: root.name }))}
                    />
                  </Field>
                  <Field className="min-w-0 flex-1">
                    <FieldLabel htmlFor="job-path">{t("local.relativePath")}</FieldLabel>
                    <Input
                      id="job-path"
                      name="path"
                      defaultValue={
                        editing && editing.action.type === "directory.scan"
                          ? editing.action.path
                          : ""
                      }
                    />
                  </Field>
                </FieldGroup>
              ) : (
                <>
                  <Field>
                    <FieldLabel htmlFor="job-executable">{commandText("executable")}</FieldLabel>
                    <Input
                      id="job-executable"
                      name="executable"
                      defaultValue={command?.executable ?? ""}
                      aria-describedby="job-command-hint"
                      required
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="job-args">{commandText("arguments")}</FieldLabel>
                    <Input
                      id="job-args"
                      name="args"
                      defaultValue={JSON.stringify(command?.args ?? [])}
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="job-cwd">{commandText("cwd")}</FieldLabel>
                    <Input
                      id="job-cwd"
                      name="cwd"
                      defaultValue={
                        command?.cwd ?? roots.find((root) => root.id === projectId)?.path ?? ""
                      }
                      required
                    />
                  </Field>
                  <p id="job-command-hint" className="text-sm/relaxed text-muted-foreground">
                    {t("local.commandHint")}
                  </p>
                </>
              )}
              <Field orientation="horizontal" className="flex-wrap gap-3">
                <Button
                  type="submit"
                  disabled={busy || (action === "directory.scan" && !roots.length)}
                >
                  {busy ? c("working") : c("save")}
                </Button>
                <Button variant="ghost" disabled={busy} onClick={() => setEditing(false)}>
                  {c("cancel")}
                </Button>
              </Field>
            </FieldGroup>
          </form>
        </section>
      )}
      {shown?.length === 0 && editing === false ? (
        <EmptyState
          icon={<ClockIcon />}
          title={t("local.empty")}
          description={t("local.emptyHint")}
        />
      ) : (
        <div>
          {shown?.map((job) => (
            <article
              className="flex items-start gap-4 border-t border-border py-6 @max-4xl/main:flex-wrap"
              key={job.id}
            >
              <div className="grid size-10 shrink-0 place-items-center rounded-lg border border-border text-muted-foreground">
                <ClockIcon size={20} />
              </div>
              <div className="min-w-30 flex-1">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <h2 className="text-sm font-medium wrap-anywhere">{job.name}</h2>
                  <span className="text-xs wrap-anywhere text-muted-foreground">
                    {job.projectId
                      ? (roots.find((root) => root.id === job.projectId)?.name ??
                        t("local.projectUnavailable"))
                      : t("local.globalAutomation")}
                  </span>
                  <Badge variant={job.enabled ? "secondary" : "outline"}>
                    {t(job.enabled ? "enabled" : "disabled")}
                  </Badge>
                </div>
                <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <code>{job.cron}</code>
                  <span>·</span>
                  {job.timezone}
                  <span>·</span>
                  {t(job.action.type === "directory.scan" ? "local.scan" : "local.command")}
                </p>
                {job.nextRuns[0] && job.enabled && (
                  <p className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    {t("next")}: {date(job.nextRuns[0])}
                  </p>
                )}
              </div>
              <div className="flex max-w-sm flex-wrap items-center justify-end gap-1 @max-4xl/main:ml-14 @max-4xl/main:max-w-none">
                <Button variant="outline" disabled={busy} onClick={() => void run(job)}>
                  <PlayIcon data-icon="inline-start" />
                  {t("run")}
                </Button>
                <Button variant="ghost" disabled={busy} onClick={() => void showHistory(job)}>
                  {t("history")}
                </Button>
                <IconButton
                  disabled={busy}
                  label={`${t(job.enabled ? "pause" : "enable")}: ${job.name}`}
                  onClick={() => void update(job)}
                >
                  {job.enabled ? <PauseIcon /> : <PlayIcon />}
                </IconButton>
                <IconButton
                  disabled={busy}
                  label={`${c("edit")}: ${job.name}`}
                  onClick={() => edit(job)}
                >
                  <EditIcon />
                </IconButton>
                <IconButton
                  disabled={busy}
                  label={c("deleteNamed", { name: job.name })}
                  onClick={() => void remove(job)}
                >
                  <DeleteIcon />
                </IconButton>
              </div>
            </article>
          ))}
        </div>
      )}
      {dialog}
      {history && (
        <section className="mt-8">
          <header className="flex items-center justify-between gap-4 border-b border-border py-3 pr-4">
            <h2 className="text-sm font-medium wrap-anywhere">
              {history.job.name} · {t("history")}
            </h2>
            <Button variant="ghost" onClick={closeHistory}>
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
                      className="group h-auto w-full flex-wrap justify-start gap-4 rounded-none px-0 py-3"
                    />
                  }
                >
                  <ChevronRightIcon
                    aria-hidden="true"
                    className="group-data-panel-open:rotate-90"
                  />
                  <span className="text-xs tabular-nums">{date(jobRun.startedAt)}</span>
                  <Badge variant="secondary">{c(jobRun.status)}</Badge>
                  <span className="text-xs">
                    {jobRun.exitCode === null ? "" : `${t("local.exit")}: ${jobRun.exitCode}`}
                  </span>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  {jobRun.output && (
                    <pre className="max-h-96 overflow-auto rounded-lg bg-muted p-4 font-mono text-xs/relaxed whitespace-pre-wrap wrap-anywhere">
                      {jobRun.output}
                    </pre>
                  )}
                </CollapsibleContent>
              </Collapsible>
            ))
          )}
          {history.job.nextRuns.length > 0 && (
            <div className="mt-6 text-xs text-muted-foreground">
              <h3 className="text-sm font-medium text-foreground">{t("preview")}</h3>
              <ul className="mt-2 pl-4 leading-relaxed tabular-nums">
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
