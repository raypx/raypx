import { useEffect, useId, useMemo, useState, type FormEvent } from "react";
import { useLocale } from "@raypx/i18n/browser";
import type { Routine, RoutineHistory } from "@raypx/core/routines";
import { Button } from "@raypx/ui/components/ui/button";
import { Badge } from "@raypx/ui/components/ui/badge";
import { Checkbox } from "@raypx/ui/components/ui/checkbox";
import { Field, FieldGroup, FieldLabel } from "@raypx/ui/components/ui/field";
import { Input } from "@raypx/ui/components/ui/input";
import { Textarea } from "@raypx/ui/components/ui/textarea";
import { SelectField } from "@raypx/ui/select-field";
import { useConfirmation } from "@raypx/ui/confirmation";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@raypx/ui/components/ui/dialog";
import {
  createRoutineForm,
  routineFormInput,
  routineOccurrences,
  routineTriggerKinds,
  routineHistoryState,
  routineLastOutcome,
  routineDelayMinutes,
  routineErrorKey,
  clearRoutineSecrets,
  revealedRoutineSecrets,
  routineIngressAddress,
  type RoutineIngressKind,
  type RoutineIngressReason,
  type RoutinesPort,
  type RoutineFormState,
  type RoutineSecrets,
} from "../model.js";
import { useTranslations } from "./i18n.js";

export interface RoutinesPanelProps {
  showTitle?: boolean;
  spaceId: string;
  agentId: string;
  accountId: string;
  port: RoutinesPort;
  onOpenRun: (runId: string) => void;
}

function returnFocus(target: HTMLElement | null) {
  return () => (target?.isConnected ? target : false);
}

function formatTime(value: string, timezone: string, locale: string) {
  return new Intl.DateTimeFormat(locale, {
    timeZone: timezone,
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function RoutinesPanel(props: RoutinesPanelProps) {
  const { spaceId, agentId, accountId, port, onOpenRun } = props;
  const t = useTranslations("routines");
  const locale = useLocale();
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [last, setLast] = useState<Record<string, RoutineHistory | undefined>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ReturnType<typeof routineErrorKey> | null>(null);
  const [notice, setNotice] = useState("");
  const [revision, setRevision] = useState(0);
  const [pending, setPending] = useState(false);
  const [editor, setEditor] = useState<{
    routine: Routine | null;
    focus: HTMLElement | null;
  } | null>(null);
  const [history, setHistory] = useState<{ routine: Routine; focus: HTMLElement | null } | null>(
    null,
  );
  const confirmation = useConfirmation();

  useEffect(() => {
    let current = true;
    queueMicrotask(() => {
      if (!current) return;
      setLoading(true);
      setRoutines([]);
      setLast({});
      setError(null);
    });
    void port
      .list({ spaceId, agentId, limit: 100 })
      .then(async (items) => {
        if (!current) return;
        setRoutines(items);
        const latest: (readonly [string, RoutineHistory | undefined])[] = [];
        for (let offset = 0; offset < items.length; offset += 8) {
          if (!current) return;
          const batch = await Promise.all(
            items.slice(offset, offset + 8).map(async (routine) => {
              const entries = await port.history({ spaceId, id: routine.id, limit: 1 });
              return [routine.id, entries[0]] as const;
            }),
          );
          latest.push(...batch);
        }
        if (current) setLast(Object.fromEntries(latest));
      })
      .catch((failure: unknown) => {
        if (current) setError(routineErrorKey(failure));
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => {
      current = false;
    };
  }, [spaceId, agentId, port, revision]);

  async function perform(operation: () => Promise<unknown>, success: string) {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      await operation();
      setNotice(success);
      setRevision((value) => value + 1);
    } catch (failure) {
      setError(routineErrorKey(failure));
    } finally {
      setPending(false);
    }
  }

  async function remove(routine: Routine) {
    if (
      !(await confirmation.confirm({
        title: t("deleteTitle"),
        description: t("deleteDescription", { name: routine.name }),
        confirmLabel: t("delete"),
        cancelLabel: t("cancel"),
      }))
    )
      return;
    await perform(() => port.delete({ spaceId, id: routine.id }), t("deleted"));
  }

  async function toggle(routine: Routine) {
    if (
      routine.ownerAccountId !== accountId &&
      !(await confirmation.confirm({
        title: routine.enabled ? t("pause") : t("resume"),
        description: t("ownershipNotice"),
        confirmLabel: t("save"),
        cancelLabel: t("cancel"),
      }))
    )
      return;
    await perform(
      () =>
        routine.enabled
          ? port.pause({ spaceId, id: routine.id })
          : port.resume({ spaceId, id: routine.id }),
      t("saved"),
    );
  }

  function openEditor(routine: Routine | null) {
    setEditor({
      routine,
      focus: document.activeElement instanceof HTMLElement ? document.activeElement : null,
    });
  }

  return (
    <section
      aria-label={t("title")}
      className="flex min-h-0 min-w-0 flex-col gap-4 overflow-y-auto p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        {props.showTitle !== false && <h2 className="text-lg font-medium">{t("title")}</h2>}
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            disabled={loading || pending}
            onClick={() => setRevision((value) => value + 1)}
          >
            {t("refresh")}
          </Button>
          <Button size="sm" onClick={() => openEditor(null)}>
            {t("newRoutine")}
          </Button>
        </div>
      </div>
      <p role="status" aria-live="polite" className="text-sm text-muted-foreground">
        {notice}
      </p>
      {error ? (
        <p role="status" aria-live="polite" className="text-sm text-destructive-text">
          {t(error)}{" "}
          <Button size="xs" variant="ghost" onClick={() => setRevision((value) => value + 1)}>
            {t("retry")}
          </Button>
        </p>
      ) : null}
      {loading && !routines.length ? (
        <p className="text-sm text-muted-foreground">{t("loading")}</p>
      ) : null}
      {!loading && !error && !routines.length ? (
        <p className="text-sm text-muted-foreground">{t("empty")}</p>
      ) : null}
      <div className="divide-y">
        {routines.map((routine) => (
          <article
            key={routine.id}
            aria-label={routine.name}
            className="flex min-w-0 flex-col gap-2 py-4 first:pt-0"
          >
            <div className="flex items-start justify-between gap-2">
              <h3 className="min-w-0 font-medium wrap-anywhere">{routine.name}</h3>
              <Badge variant="secondary">{routine.enabled ? t("enabled") : t("paused")}</Badge>
            </div>
            <p className="line-clamp-2 text-sm text-muted-foreground wrap-anywhere">
              {routine.prompt}
            </p>
            <div className="flex flex-wrap gap-1">
              {routineTriggerKinds
                .filter((kind) => Boolean(routine.triggers[kind]))
                .map((kind) => (
                  <Badge key={kind} variant="outline">
                    {t(kind)}
                  </Badge>
                ))}
            </div>
            {routine.nextDueAt && routine.triggers.schedule ? (
              <p className="text-xs text-muted-foreground tabular-nums">
                {t("nextDue", {
                  time: formatTime(routine.nextDueAt, routine.triggers.schedule.timezone, locale),
                  zone: routine.triggers.schedule.timezone,
                })}
              </p>
            ) : null}
            <p className="text-xs text-muted-foreground">
              {t("lastOutcome", {
                outcome: last[routine.id] ? t(routineLastOutcome(last[routine.id]!)) : t("noRuns"),
              })}
            </p>
            <div className="flex flex-wrap gap-1">
              <Button
                size="xs"
                variant="outline"
                disabled={pending}
                onClick={() =>
                  void perform(async () => {
                    const result = await port.test({
                      spaceId,
                      id: routine.id,
                      idempotencyKey: crypto.randomUUID(),
                    });
                    if (result.runId) onOpenRun(result.runId);
                  }, t("runRequested"))
                }
              >
                {t("runNow")}
              </Button>
              <Button size="xs" variant="ghost" onClick={() => openEditor(routine)}>
                {t("edit")}
              </Button>
              <Button
                size="xs"
                variant="ghost"
                onClick={() =>
                  setHistory({
                    routine,
                    focus:
                      document.activeElement instanceof HTMLElement ? document.activeElement : null,
                  })
                }
              >
                {t("history")}
              </Button>
              <Button
                size="xs"
                variant="ghost"
                disabled={pending}
                onClick={() => void toggle(routine)}
              >
                {routine.enabled ? t("pause") : t("resume")}
              </Button>
              <Button
                size="xs"
                variant="ghost"
                disabled={pending}
                onClick={() => void remove(routine)}
              >
                {t("delete")}
              </Button>
            </div>
          </article>
        ))}
      </div>
      {editor ? (
        <RoutineEditor
          {...props}
          initial={editor.routine}
          returnTarget={editor.focus}
          onClose={() => setEditor(null)}
          onSaved={() => {
            setRevision((value) => value + 1);
            setNotice(t("saved"));
          }}
          accountId={accountId}
        />
      ) : null}
      {history ? (
        <RoutineHistoryDialog
          port={port}
          spaceId={spaceId}
          routine={history.routine}
          returnTarget={history.focus}
          onClose={() => setHistory(null)}
          onOpenRun={(runId) => {
            setHistory(null);
            onOpenRun(runId);
          }}
        />
      ) : null}
      {confirmation.dialog}
    </section>
  );
}

function RoutineEditor({
  initial,
  returnTarget,
  onClose,
  onSaved,
  spaceId,
  agentId,
  accountId,
  port,
}: RoutinesPanelProps & {
  initial: Routine | null;
  returnTarget: HTMLElement | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useTranslations("routines");
  const locale = useLocale();
  const prefix = useId();
  const [form, setForm] = useState(() =>
    createRoutineForm(initial, Intl.DateTimeFormat().resolvedOptions().timeZone),
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<ReturnType<typeof routineErrorKey> | null>(null);
  const [saved, setSaved] = useState<Routine | null>(null);
  const [secrets, setSecrets] = useState<RoutineSecrets>(clearRoutineSecrets);
  const [copied, setCopied] = useState(false);
  const [now] = useState(() => new Date());
  const occurrences = useMemo(
    () => routineOccurrences(form.cron, form.timezone, now),
    [form.cron, form.timezone, now],
  );
  const zones = useMemo(
    () =>
      [...new Set([form.timezone, "UTC", ...Intl.supportedValuesOf("timeZone")])].map((zone) => ({
        value: zone,
        label: zone,
      })),
    [form.timezone],
  );
  const input = routineFormInput(form, agentId);
  const selected = saved ?? initial;
  const [readRoutine, setReadRoutine] = useState<Routine | null>(initial);
  useEffect(() => {
    if (!selected) return;
    let current = true;
    void port
      .get({ spaceId, id: selected.id })
      .then((routine) => {
        if (current) setReadRoutine(routine);
      })
      .catch(() => {
        if (current) setError("requestFailed");
      });
    return () => {
      current = false;
    };
  }, [port, spaceId, selected]);
  const ingressRoutine = readRoutine?.id === selected?.id ? readRoutine : selected;
  function change<Key extends keyof RoutineFormState>(key: Key, value: RoutineFormState[Key]) {
    setForm((previous) => ({ ...previous, [key]: value }));
  }
  function close() {
    setSecrets(clearRoutineSecrets());
    onClose();
  }
  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
    } catch {
      setError("requestFailed");
    }
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || !input) return;
    setPending(true);
    setError(null);
    try {
      const result = initial
        ? await port.update({ spaceId, id: initial.id, routine: input })
        : await port.create({ spaceId, routine: input });
      setSaved(result.routine);
      setSecrets(revealedRoutineSecrets(result));
      onSaved();
      if (initial && !result.webhookKey && !result.repositorySecret) close();
    } catch (failure) {
      setError(routineErrorKey(failure));
    } finally {
      setPending(false);
    }
  }
  async function rotate() {
    if (!selected || pending) return;
    setPending(true);
    setError(null);
    try {
      const result = await port.rotateWebhookKey({ spaceId, id: selected.id });
      setSecrets({ webhookKey: result.webhookKey, repositorySecret: null });
      setSaved(result.routine);
      onSaved();
    } catch (failure) {
      setError(routineErrorKey(failure));
    } finally {
      setPending(false);
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !pending) close();
      }}
    >
      <DialogContent
        closeLabel={t("close")}
        finalFocus={returnFocus(returnTarget)}
        className="sm:max-w-xl motion-reduce:animate-none"
      >
        <DialogHeader>
          <DialogTitle>{initial ? t("editRoutine") : t("newRoutine")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="flex min-w-0 flex-col gap-4">
          {saved ? (
            <p role="status" aria-live="polite">
              {t("saved")}
            </p>
          ) : (
            <>
              {initial && initial.ownerAccountId !== accountId ? (
                <p className="text-sm text-muted-foreground">{t("ownershipNotice")}</p>
              ) : null}
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor={`${prefix}-name`}>{t("name")}</FieldLabel>
                  <Input
                    id={`${prefix}-name`}
                    value={form.name}
                    maxLength={120}
                    required
                    disabled={pending}
                    onChange={(event) => change("name", event.target.value)}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor={`${prefix}-prompt`}>{t("prompt")}</FieldLabel>
                  <Textarea
                    id={`${prefix}-prompt`}
                    value={form.prompt}
                    maxLength={32_000}
                    required
                    rows={4}
                    disabled={pending}
                    onChange={(event) => change("prompt", event.target.value)}
                  />
                </Field>
              </FieldGroup>
              <fieldset className="flex min-w-0 flex-col gap-4" disabled={pending}>
                <legend className="mb-2 text-sm font-medium">{t("triggers")}</legend>
                {routineTriggerKinds.map((kind) => (
                  <div key={kind} className="flex min-w-0 flex-col gap-3">
                    <Field orientation="horizontal">
                      <Checkbox
                        id={`${prefix}-${kind}`}
                        checked={form.selected[kind]}
                        onCheckedChange={(checked) =>
                          change("selected", { ...form.selected, [kind]: checked })
                        }
                      />
                      <FieldLabel htmlFor={`${prefix}-${kind}`}>{t(kind)}</FieldLabel>
                    </Field>
                    {kind === "schedule" && form.selected.schedule ? (
                      <FieldGroup>
                        <Field>
                          <FieldLabel htmlFor={`${prefix}-cron`}>{t("cronExpression")}</FieldLabel>
                          <Input
                            id={`${prefix}-cron`}
                            value={form.cron}
                            onChange={(event) => change("cron", event.target.value)}
                          />
                        </Field>
                        <Field>
                          <FieldLabel htmlFor={`${prefix}-zone`}>{t("timezone")}</FieldLabel>
                          <SelectField
                            id={`${prefix}-zone`}
                            options={zones}
                            value={form.timezone}
                            onValueChange={(value) => change("timezone", value)}
                          />
                        </Field>
                        {occurrences.length ? (
                          <div className="text-xs text-muted-foreground">
                            <p>{t("nextOccurrences")}</p>
                            <ul className="list-inside list-disc tabular-nums">
                              {occurrences.map((value) => (
                                <li key={value}>{formatTime(value, form.timezone, locale)}</li>
                              ))}
                            </ul>
                          </div>
                        ) : (
                          <p role="status" className="text-xs text-destructive-text">
                            {t("invalidCron")}
                          </p>
                        )}
                      </FieldGroup>
                    ) : null}
                    {kind === "email" && form.selected.email ? (
                      <Field>
                        <FieldLabel htmlFor={`${prefix}-sender`}>{t("allowedSender")}</FieldLabel>
                        <Input
                          id={`${prefix}-sender`}
                          type="email"
                          value={form.allowedSender}
                          onChange={(event) => change("allowedSender", event.target.value)}
                        />
                      </Field>
                    ) : null}
                    {kind === "repository" && form.selected.repository ? (
                      <Field>
                        <FieldLabel htmlFor={`${prefix}-events`}>{t("eventKinds")}</FieldLabel>
                        <Input
                          id={`${prefix}-events`}
                          value={form.repositoryEvents}
                          onChange={(event) => change("repositoryEvents", event.target.value)}
                        />
                        <p className="text-xs text-muted-foreground">{t("eventKindsHint")}</p>
                      </Field>
                    ) : null}
                  </div>
                ))}
              </fieldset>
            </>
          )}
          {selected?.triggers.webhook ? (
            <div className="flex min-w-0 flex-col gap-2">
              <p className="text-sm font-medium">{t("webhookUrl")}</p>
              <IngressAddress routine={ingressRoutine!} kind="webhook" />
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={() => void rotate()}
              >
                {t("rotateKey")}
              </Button>
            </div>
          ) : null}
          {selected?.triggers.email ? (
            <div>
              <p className="text-sm font-medium">{t("emailAddress")}</p>
              <IngressAddress routine={ingressRoutine!} kind="email" />
              <p className="text-sm font-medium">{t("allowedSender")}</p>
              <p className="text-xs wrap-anywhere">{selected.triggers.email?.allowedSender}</p>
            </div>
          ) : null}
          {selected?.triggers.repository ? (
            <div>
              <p className="text-sm font-medium">{t("repositoryUrl")}</p>
              <IngressAddress routine={ingressRoutine!} kind="repository" />
            </div>
          ) : null}
          {secrets.webhookKey || secrets.repositorySecret ? (
            <div className="flex min-w-0 flex-col gap-3 rounded-lg border p-3">
              <p className="text-sm">{t("secretOnce")}</p>
              {secrets.webhookKey ? (
                <div className="flex min-w-0 flex-col gap-2">
                  <p className="text-sm font-medium">{t("webhookKey")}</p>
                  <code className="select-all text-xs break-all">{secrets.webhookKey}</code>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => void copy(secrets.webhookKey!)}
                  >
                    {t("copyKey")}
                  </Button>
                </div>
              ) : null}
              {secrets.repositorySecret ? (
                <div className="flex min-w-0 flex-col gap-2">
                  <p className="text-sm font-medium">{t("signingSecret")}</p>
                  <code className="select-all text-xs break-all">{secrets.repositorySecret}</code>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => void copy(secrets.repositorySecret!)}
                  >
                    {t("copySecret")}
                  </Button>
                </div>
              ) : null}
            </div>
          ) : null}
          {copied ? (
            <p role="status" aria-live="polite" className="text-xs text-muted-foreground">
              {t("copied")}
            </p>
          ) : null}
          {error ? (
            <p role="status" aria-live="polite" className="text-sm text-destructive-text">
              {t(error)}
            </p>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" disabled={pending} onClick={close}>
              {saved ? t("done") : t("cancel")}
            </Button>
            {!saved ? (
              <Button type="submit" disabled={pending || !input}>
                {initial ? t("save") : t("createRoutine")}
              </Button>
            ) : null}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const ingressReasonKeys = {
  TRIGGER_NOT_CONFIGURED: "triggerUnavailable",
  PUBLIC_API_ORIGIN_NOT_CONFIGURED: "publicAddressUnavailable",
  EMAIL_NOT_CONFIGURED: "emailUnavailable",
  ADDRESS_UNAVAILABLE: "ingressUnavailable",
} as const satisfies Record<RoutineIngressReason, string>;

function IngressAddress({ routine, kind }: { routine: Routine; kind: RoutineIngressKind }) {
  const t = useTranslations("routines");
  const address = routineIngressAddress(routine, kind);
  if (address.value)
    return <code className="select-all text-xs wrap-anywhere">{address.value}</code>;
  return (
    <p className="text-xs text-muted-foreground">
      {t(ingressReasonKeys[address.unavailableReason ?? "ADDRESS_UNAVAILABLE"])}
    </p>
  );
}

function RoutineHistoryDialog({
  routine,
  spaceId,
  port,
  returnTarget,
  onClose,
  onOpenRun,
}: {
  routine: Routine;
  spaceId: string;
  port: RoutinesPort;
  returnTarget: HTMLElement | null;
  onClose: () => void;
  onOpenRun: (id: string) => void;
}) {
  const t = useTranslations("routines");
  const locale = useLocale();
  const [entries, setEntries] = useState<RoutineHistory[] | null>(null);
  const [error, setError] = useState<ReturnType<typeof routineErrorKey> | null>(null);
  useEffect(() => {
    let current = true;
    void Promise.all([
      port.history({ spaceId, id: routine.id, limit: 100 }),
      port.events({ spaceId, id: routine.id, limit: 100 }),
    ])
      .then(async ([result, events]) => {
        // Separate queries may straddle a firing; reread when the event query
        // has an occurrence that the history snapshot has not included yet.
        const missingOccurrence = events.some(
          (event) => !result.some((entry) => entry.id === event.occurrenceId),
        );
        const currentEntries = missingOccurrence
          ? await port.history({ spaceId, id: routine.id, limit: 100 })
          : result;
        if (current) setEntries(currentEntries);
      })
      .catch((failure: unknown) => {
        if (current) setError(routineErrorKey(failure));
      });
    return () => {
      current = false;
    };
  }, [port, spaceId, routine.id]);
  const zone =
    routine.triggers.schedule?.timezone ?? new Intl.DateTimeFormat().resolvedOptions().timeZone;
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        closeLabel={t("close")}
        finalFocus={returnFocus(returnTarget)}
        className="sm:max-w-xl motion-reduce:animate-none"
      >
        <DialogHeader>
          <DialogTitle>{t("runHistory")}</DialogTitle>
        </DialogHeader>
        {error ? (
          <p role="status" aria-live="polite" className="text-sm text-destructive-text">
            {t(error)}
          </p>
        ) : null}
        {!entries && !error ? <p>{t("loading")}</p> : null}
        {entries?.length === 0 ? <p className="text-muted-foreground">{t("noRuns")}</p> : null}
        <ol className="min-w-0 divide-y">
          {entries?.map((entry) => (
            <li key={entry.id} className="flex min-w-0 flex-col gap-2 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{t(routineHistoryState(entry))}</span>
                <Badge variant="outline">{t(entry.kind)}</Badge>
                {routineLastOutcome(entry) !== routineHistoryState(entry) ? (
                  <Badge variant="secondary">{t(routineLastOutcome(entry))}</Badge>
                ) : null}
              </div>
              <p className="text-xs text-muted-foreground tabular-nums">
                {t("dueAt", { time: formatTime(entry.dueAt, zone, locale), zone })}
              </p>
              {entry.startedAt ? (
                <p className="text-xs text-muted-foreground tabular-nums">
                  {t("startedAt", { time: formatTime(entry.startedAt, zone, locale), zone })}
                </p>
              ) : null}
              {routineDelayMinutes(entry) !== null ? (
                <p className="text-xs">
                  {t("startedLate", { minutes: String(routineDelayMinutes(entry)) })}
                </p>
              ) : null}
              {entry.runId ? (
                <Button
                  variant="outline"
                  size="xs"
                  className="self-start"
                  onClick={() => onOpenRun(entry.runId!)}
                >
                  {t("openRun")}
                </Button>
              ) : null}
            </li>
          ))}
        </ol>
      </DialogContent>
    </Dialog>
  );
}
