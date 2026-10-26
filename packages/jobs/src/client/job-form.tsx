import { useId, useMemo, useState, type FormEvent } from "react";
import { useLocale, useTranslations } from "@raypx/i18n/browser";
import { Button } from "@raypx/ui/components/ui/button";
import { Input } from "@raypx/ui/components/ui/input";
import { Textarea } from "@raypx/ui/components/ui/textarea";
import { SelectField } from "@raypx/ui/select-field";
import { RadioGroup, RadioGroupItem } from "@raypx/ui/components/ui/radio-group";
import { Field, FieldLabel } from "@raypx/ui/components/ui/field";
import { cloudJobInputSchema, type CloudJob, type CloudJobInput } from "../model.js";
import type { JobDevice } from "./ports.js";
import { nextJobRuns } from "../schedule.js";
import {
  ContextPicker,
  ContextBudget,
  contextBudgetKey,
  type ContextBudgetState,
  type MemoryClientPort,
} from "@raypx/memory/client";
import type { TaskContextSelection } from "@raypx/core/tasks";

const deviceKey = (device: { id: string; epoch: number }) => `${device.id}:${device.epoch}`;
export function JobForm({
  job,
  devices,
  busy,
  onSave,
  onCancel,
  contextLibrary,
  ownerKey,
}: {
  job: CloudJob | null;
  devices: JobDevice[];
  busy: boolean;
  onSave: (input: CloudJobInput) => Promise<void>;
  onCancel: () => void;
  contextLibrary?: MemoryClientPort | undefined;
  ownerKey: string;
}) {
  const t = useTranslations("cloudJobs"),
    c = useTranslations("common"),
    j = useTranslations("jobs");
  const locale = useLocale(),
    prefix = useId();
  const [name, setName] = useState(job?.name ?? "");
  const [cron, setCron] = useState(job?.cron ?? "0 9 * * 1-5");
  const [timezone, setTimezone] = useState(
    job?.timezone ?? new Intl.DateTimeFormat().resolvedOptions().timeZone,
  );
  const [action, setAction] = useState<"device.sync" | "agent.run">(
    job?.action.type ?? "device.sync",
  );
  const [selected, setSelected] = useState(
    job ? `${job.action.deviceId}:${job.action.epoch}` : devices[0] ? deviceKey(devices[0]) : "",
  );
  const device = devices.find((item) => deviceKey(item) === selected);
  const [project, setProject] = useState(
    job?.action.type === "agent.run" ? job.action.projectId : (devices[0]?.projects[0]?.id ?? ""),
  );
  const [provider, setProvider] = useState<"claude" | "codex">(
    job?.action.type === "agent.run"
      ? job.action.provider
      : (devices[0]?.capabilities.find((item) => item.available)?.provider ?? "codex"),
  );
  const [mode, setMode] = useState<"run" | "plan">(
    job?.action.type === "agent.run" ? job.action.mode : "run",
  );
  const [prompt, setPrompt] = useState(job?.action.type === "agent.run" ? job.action.prompt : "");
  const [contextSelection, setContextSelection] = useState<TaskContextSelection>(
    job?.action.type === "agent.run"
      ? (job.action.contextSelection ?? { sources: [] })
      : { sources: [] },
  );
  const [invalid, setInvalid] = useState(false);
  const [budget, setBudget] = useState<ContextBudgetState>();
  const budgetProps =
    action === "agent.run" && contextLibrary && device && project
      ? {
          client: contextLibrary,
          ownerKey,
          target: { deviceId: device.id, projectId: project },
          value: contextSelection,
          prompt: prompt.trim(),
        }
      : undefined;
  const budgetReady =
    !budgetProps ||
    (budget?.key === contextBudgetKey(budgetProps) &&
      budget.status === "ready" &&
      !budget.exceeded);
  const preview = useMemo(() => {
    try {
      return nextJobRuns({ cron, timezone });
    } catch {
      return [];
    }
  }, [cron, timezone]);
  const available = Boolean(
    device &&
    (action === "device.sync" ||
      (device.projects.some((item) => item.id === project) &&
        device.capabilities.some((item) => item.provider === provider && item.available))),
  );
  function chooseDevice(value: string) {
    setSelected(value);
    const next = devices.find((item) => deviceKey(item) === value);
    setProject(next?.projects[0]?.id ?? "");
    setProvider(next?.capabilities.find((item) => item.available)?.provider ?? "codex");
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !device || !budgetReady) return;
    const result = cloudJobInputSchema.safeParse({
      name,
      cron,
      timezone,
      enabled: job?.enabled ?? true,
      action:
        action === "device.sync"
          ? { type: action, deviceId: device.id, epoch: device.epoch }
          : {
              type: action,
              deviceId: device.id,
              epoch: device.epoch,
              projectId: project,
              provider,
              mode,
              prompt,
              ...(contextSelection.sources.length ? { contextSelection } : {}),
            },
    });
    if (!result.success || !preview.length || !available) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    await onSave(result.data);
  }
  const options = devices.map((item) => ({
    value: deviceKey(item),
    label: `${item.name}${item.online ? "" : ` (${t("offline")})`}`,
  }));
  if (selected && !device) options.unshift({ value: selected, label: t("targetUnavailable") });
  return (
    <section className="mb-8 rounded-lg border border-border bg-sidebar p-5 sm:p-6">
      <h2 className="mb-5 text-base font-semibold">{t(job ? "edit" : "create")}</h2>
      <form onSubmit={(event) => void submit(event)} className="flex max-w-3xl flex-col gap-5">
        <Field>
          <FieldLabel htmlFor={`${prefix}-name`}>{c("name")}</FieldLabel>
          <Input
            id={`${prefix}-name`}
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={120}
            required
            disabled={busy}
          />
        </Field>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor={`${prefix}-cron`}>{j("schedule")}</FieldLabel>
            <Input
              id={`${prefix}-cron`}
              value={cron}
              onChange={(event) => setCron(event.target.value)}
              maxLength={120}
              required
              disabled={busy}
            />
            <p className="text-xs text-muted-foreground">{j("timezoneHint")}</p>
          </Field>
          <Field>
            <FieldLabel htmlFor={`${prefix}-zone`}>{j("timezone")}</FieldLabel>
            <Input
              id={`${prefix}-zone`}
              value={timezone}
              onChange={(event) => setTimezone(event.target.value)}
              maxLength={100}
              required
              disabled={busy}
            />
          </Field>
        </div>
        <fieldset className="space-y-3">
          <legend className="mb-2 text-sm font-medium">{j("action")}</legend>
          <RadioGroup
            value={action}
            onValueChange={(value) =>
              setAction(value === "agent.run" ? "agent.run" : "device.sync")
            }
            disabled={busy}
          >
            <Field orientation="horizontal">
              <RadioGroupItem id={`${prefix}-sync`} value="device.sync" />
              <FieldLabel htmlFor={`${prefix}-sync`}>{t("sync")}</FieldLabel>
            </Field>
            <Field orientation="horizontal">
              <RadioGroupItem id={`${prefix}-agent`} value="agent.run" />
              <FieldLabel htmlFor={`${prefix}-agent`}>{t("agent")}</FieldLabel>
            </Field>
          </RadioGroup>
          <p className="max-w-[65ch] text-xs text-muted-foreground">
            {t(action === "device.sync" ? "syncHint" : "agentHint")}
          </p>
        </fieldset>
        <Field>
          <FieldLabel htmlFor={`${prefix}-device`}>{t("computer")}</FieldLabel>
          <SelectField
            id={`${prefix}-device`}
            value={selected || null}
            onValueChange={chooseDevice}
            options={options}
            placeholder={t("chooseDevice")}
            disabled={busy}
            required
          />
        </Field>
        {!device && (
          <p role="status" className="text-sm text-muted-foreground">
            {t(devices.length ? "epochHint" : "noDevices")}
          </p>
        )}
        {action === "agent.run" && (
          <>
            <Field>
              <FieldLabel htmlFor={`${prefix}-project`}>{t("project")}</FieldLabel>
              <SelectField
                id={`${prefix}-project`}
                value={project || null}
                onValueChange={setProject}
                options={(device?.projects ?? []).map((item) => ({
                  value: item.id,
                  label: item.name,
                }))}
                placeholder={t("chooseProject")}
                disabled={busy}
                required
              />
            </Field>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor={`${prefix}-provider`}>{t("provider")}</FieldLabel>
                <SelectField
                  id={`${prefix}-provider`}
                  value={provider}
                  onValueChange={setProvider}
                  options={(device?.capabilities ?? [])
                    .filter((item) => item.available)
                    .map((item) => ({
                      value: item.provider,
                      label: item.provider === "claude" ? "Claude Code" : "Codex",
                    }))}
                  disabled={busy}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor={`${prefix}-mode`}>{t("mode")}</FieldLabel>
                <SelectField
                  id={`${prefix}-mode`}
                  value={mode}
                  onValueChange={setMode}
                  options={[
                    { value: "run", label: t("runMode") },
                    { value: "plan", label: t("planMode") },
                  ]}
                  disabled={busy}
                />
              </Field>
            </div>
            <Field>
              <FieldLabel htmlFor={`${prefix}-prompt`}>{t("prompt")}</FieldLabel>
              <Textarea
                id={`${prefix}-prompt`}
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                maxLength={32_000}
                required
                disabled={busy}
                className="max-h-80 min-h-32 overflow-y-auto"
              />
            </Field>
            {contextLibrary && device && project && (
              <ContextPicker
                client={contextLibrary}
                ownerKey={ownerKey}
                target={{ deviceId: device.id, projectId: project }}
                value={contextSelection}
                onChange={setContextSelection}
                disabled={busy}
              />
            )}
          </>
        )}
        {budgetProps && <ContextBudget {...budgetProps} onChange={setBudget} />}
        <section className="space-y-2 text-xs text-muted-foreground">
          <h3 className="font-medium text-foreground">{j("preview")}</h3>
          {preview.length ? (
            <ul className="space-y-1">
              {preview.map((date) => (
                <li key={date}>
                  {new Intl.DateTimeFormat(locale, {
                    dateStyle: "medium",
                    timeStyle: "short",
                    timeZone: timezone,
                  }).format(new Date(date))}
                </li>
              ))}
            </ul>
          ) : (
            <p role="status">{t("INVALID_CRON")}</p>
          )}
        </section>
        {invalid && (
          <p role="alert" className="text-sm text-destructive-text">
            {t("invalid")}
          </p>
        )}
        <div className="flex gap-3">
          <Button type="submit" disabled={busy || !available || !preview.length || !budgetReady}>
            {c(busy ? "working" : "save")}
          </Button>
          <Button type="button" variant="ghost" disabled={busy} onClick={onCancel}>
            {c("cancel")}
          </Button>
        </div>
      </form>
    </section>
  );
}
