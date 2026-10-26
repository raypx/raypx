import {
  useEffect,
  useEffectEvent,
  useId,
  useRef,
  useState,
  type FormEvent,
  type RefObject,
} from "react";
import type { AgentTask, AgentProvider, SyncDevice } from "@raypx/contracts/tasks";
import type { TaskWorkspaceClient } from "./remote-query.js";
import { useTranslations } from "@raypx/i18n/browser";
import { Button } from "@raypx/ui/components/ui/button";
import { Field, FieldLabel } from "@raypx/ui/components/ui/field";
import { Textarea } from "@raypx/ui/components/ui/textarea";
import { SelectField } from "@raypx/ui/select-field";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@raypx/ui/components/ui/collapsible";
import { useConfirmation } from "@raypx/ui/confirmation";
import { ChevronDown, FilePenLine, Plus, Save, Send, Trash2 } from "lucide-react";
import { isTaskActive } from "../index.js";
import { failureCode } from "./failure.js";
import { useTaskDrafts } from "./use-task-drafts.js";
import {
  MAX_TASK_DRAFTS,
  readTaskDrafts,
  createTaskDraft,
  sameDraft,
  type TaskDraft,
  type DraftInput,
} from "./task-drafts.js";

export type TaskComposerDraft = Pick<DraftInput, "prompt" | "provider" | "mode"> &
  Partial<Pick<DraftInput, "deviceId" | "projectId">>;

export function TaskComposer({
  client,
  devices,
  tasks,
  onCreated,
  local,
  draftKey,
  promptRef,
  optionsOpen,
  onOptionsOpenChange,
  guest,
  initialDraft,
  onDraftRestored,
  onEditorChange,
}: {
  onEditorChange?: (draft: DraftInput) => void;
  guest?: {
    signIn(draft: TaskComposerDraft): void | Promise<void>;
    changed?(draft: TaskComposerDraft): void;
  };
  initialDraft?: TaskComposerDraft | undefined;
  onDraftRestored?: (() => void) | undefined;
  client: TaskWorkspaceClient;
  devices: SyncDevice[];
  tasks: AgentTask[];
  onCreated: (task: AgentTask) => void;
  local: boolean;
  draftKey: string;
  optionsOpen: boolean;
  onOptionsOpenChange: (open: boolean) => void;
  promptRef: RefObject<HTMLTextAreaElement | null>;
}) {
  const t = useTranslations("tasks");
  const c = useTranslations("common");
  const fieldId = useId();
  const localDevice = local ? devices[0] : undefined;
  const [deviceId, setDeviceId] = useState(initialDraft?.deviceId ?? localDevice?.id ?? "");
  const [projectId, setProjectId] = useState(
    initialDraft?.projectId ??
      (localDevice?.projects.length === 1 ? localDevice.projects[0]!.id : ""),
  );
  const [provider, setProvider] = useState<AgentProvider>(
    initialDraft?.provider ??
      localDevice?.capabilities.find((capability) => capability.available)?.provider ??
      "claude",
  );
  const [prompt, setPrompt] = useState(initialDraft?.prompt ?? "");
  const [mode, setMode] = useState<"run" | "plan">(initialDraft?.mode ?? "run");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ReturnType<typeof failureCode>>();
  const submission = useRef<{
    key: string;
    id: string;
    input: DraftInput;
    draftId: string | null;
  } | null>(null);
  const submitting = useRef(false);
  const {
    drafts,
    ready: draftReady,
    failed: draftLoadFailed,
    write: writeDrafts,
  } = useTaskDrafts(draftKey);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [draftStatus, setDraftStatus] = useState<
    | "draftSaved"
    | "draftSaveFailed"
    | "draftCleanupFailed"
    | "draftLimit"
    | "signInDraftFailed"
    | null
  >(null);
  const { confirm, dialog } = useConfirmation();
  const snapshot = { deviceId, projectId, provider, prompt, mode };
  useEffect(() => {
    if (initialDraft) onDraftRestored?.();
  }, [initialDraft, onDraftRestored]);
  function changed(next: Partial<DraftInput>) {
    try {
      guest?.changed?.({ prompt, provider, mode, ...next });
      onEditorChange?.({ ...snapshot, ...next });
      return true;
    } catch {
      setDraftStatus("draftSaveFailed");
      return false;
    }
  }
  const savedDraft =
    drafts.find((draft) => draft.id === draftId) ??
    drafts.find((draft) => sameDraft(draft, snapshot));
  const dirty = Boolean(prompt.trim()) && (!savedDraft || !sameDraft(savedDraft, snapshot));
  function persist(next: TaskDraft[]) {
    try {
      writeDrafts(next);
      return true;
    } catch {
      setDraftStatus("draftSaveFailed");
      return false;
    }
  }
  function saveDraft() {
    try {
      const latest = readTaskDrafts(localStorage.getItem(draftKey));
      if (!latest.some((draft) => draft.id === draftId) && latest.length >= MAX_TASK_DRAFTS) {
        setDraftStatus("draftLimit");
        return;
      }
      const id = draftId ?? savedDraft?.id ?? crypto.randomUUID();
      const next = [createTaskDraft(snapshot, id), ...latest.filter((draft) => draft.id !== id)];
      if (persist(next)) {
        setDraftId(id);
        setDraftStatus("draftSaved");
      }
    } catch {
      setDraftStatus("draftSaveFailed");
    }
  }
  async function newDraft() {
    if (
      dirty &&
      !(await confirm({
        title: t("discardDraftChanges"),
        description: t("discardDraftHint"),
        confirmLabel: t("discardChanges"),
        cancelLabel: c("cancel"),
      }))
    )
      return;
    setPrompt("");
    changed({ prompt: "" });
    setDraftId(null);
    setDraftStatus(null);
    setError(undefined);
    submission.current = null;
    promptRef.current?.focus();
  }
  async function openDraft(draft: TaskDraft) {
    if (
      dirty &&
      !(await confirm({
        title: t("discardDraftChanges"),
        description: t("discardDraftHint"),
        confirmLabel: t("discardChanges"),
        cancelLabel: c("cancel"),
      }))
    )
      return;
    onOptionsOpenChange(true);
    setDeviceId(draft.deviceId);
    setProjectId(draft.projectId);
    setProvider(draft.provider);
    setMode(draft.mode);
    setPrompt(draft.prompt);
    changed(draft);
    setDraftId(draft.id);
    setDraftStatus(null);
    setError(undefined);
    promptRef.current?.focus();
  }
  function deleteDraft(id: string) {
    try {
      if (
        persist(
          readTaskDrafts(localStorage.getItem(draftKey)).filter((draft) => draft.id !== id),
        ) &&
        draftId === id
      )
        setDraftId(null);
    } catch {
      setDraftStatus("draftSaveFailed");
    }
  }
  function accepted(task: AgentTask) {
    const receipt = submission.current;
    let cleaned = true;
    if (receipt?.draftId) {
      try {
        const latest = readTaskDrafts(localStorage.getItem(draftKey));
        const sent = latest.find((draft) => draft.id === receipt.draftId);
        // Preserve edits saved from another window while delivery was in flight.
        if (sent && sameDraft(sent, receipt.input))
          cleaned = persist(latest.filter((draft) => draft.id !== sent.id));
      } catch {
        cleaned = false;
      }
    }
    if (receipt?.key === JSON.stringify(snapshot)) {
      setPrompt("");
      if (!changed({ prompt: "" })) cleaned = false;
      setDraftId(null);
      onOptionsOpenChange(false);
    }
    submission.current = null;
    setDraftStatus(cleaned ? null : "draftCleanupFailed");
    setError(undefined);
    onCreated(task);
  }
  const recover = useEffectEvent(accepted);
  useEffect(() => {
    // Recover a lost receipt from its authoritative projection without resending.
    if (!error || !submission.current) return;
    const recovered = tasks.find((task) => task.id === submission.current?.id);
    if (recovered) recover(recovered);
  }, [error, tasks]);
  const device = devices.find((item) => item.id === deviceId);
  const project = device?.projects.find((item) => item.id === projectId);
  const occupied = tasks.some(
    (task) => task.deviceId === deviceId && task.projectId === projectId && isTaskActive(task),
  );
  const available = Boolean(
    device?.online &&
    !device.revoked &&
    project?.providers.includes(provider) &&
    device.capabilities.some(
      (capability) => capability.provider === provider && capability.available,
    ),
  );
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (submitting.current || !prompt.trim()) return;
    if (guest) {
      submitting.current = true;
      setBusy(true);
      try {
        await guest.signIn(snapshot);
      } catch {
        setDraftStatus("signInDraftFailed");
      } finally {
        submitting.current = false;
        setBusy(false);
      }
      return;
    }
    if (!available || occupied) return;
    submitting.current = true;
    const key = JSON.stringify({ deviceId, projectId, provider, prompt, mode });
    if (submission.current?.key !== key)
      submission.current = {
        key,
        id: crypto.randomUUID(),
        input: snapshot,
        draftId: draftId ?? savedDraft?.id ?? null,
      };
    setBusy(true);
    setError(undefined);
    try {
      accepted(
        await client.tasks.create(
          { id: submission.current.id, deviceId, projectId, provider, prompt, mode },
          { signal: AbortSignal.timeout(15_000) },
        ),
      );
    } catch (failure) {
      setError(failureCode(failure));
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }
  return (
    <div className="space-y-4">
      <form
        aria-label={t("create")}
        onSubmit={(event) => void submit(event)}
        className="@container space-y-4 rounded-xl border border-border bg-sidebar p-4"
      >
        <div className="flex items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-base">
            <Send aria-hidden="true" className="size-4 text-muted-foreground" />
            {t("create")}
          </h2>
          <div className="flex items-center gap-1">
            <Button
              size="icon-sm"
              type="button"
              variant="ghost"
              aria-label={t("newDraft")}
              disabled={busy || (!prompt && !draftId)}
              onClick={() => void newDraft()}
            >
              <Plus aria-hidden="true" />
            </Button>
            <Button
              size="sm"
              type="button"
              variant="ghost"
              disabled={busy || !draftReady || !prompt.trim()}
              onClick={saveDraft}
            >
              <Save aria-hidden="true" />
              {t("saveDraft")}
            </Button>
          </div>
        </div>
        <Field>
          <FieldLabel htmlFor={`${fieldId}-prompt`}>{t("prompt")}</FieldLabel>
          <Textarea
            ref={promptRef}
            id={`${fieldId}-prompt`}
            className="min-h-24 resize-y bg-background"
            required
            maxLength={32000}
            value={prompt}
            placeholder={t("promptPlaceholder")}
            disabled={busy}
            onChange={(event) => {
              setPrompt(event.target.value);
              setDraftStatus(null);
              changed({ prompt: event.target.value });
            }}
          />
        </Field>
        <Collapsible open={optionsOpen} onOpenChange={onOptionsOpenChange}>
          <CollapsibleTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="group max-w-full justify-start gap-2 px-0"
              />
            }
          >
            <ChevronDown aria-hidden="true" className="shrink-0 group-data-panel-open:rotate-180" />
            {t("taskOptions")}
            <span className="truncate font-normal text-muted-foreground">
              {project?.name ?? device?.name}
            </span>
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-3 pt-3">
            <div className="grid grid-cols-1 gap-3 @min-[20rem]:grid-cols-2">
              <Field>
                <FieldLabel htmlFor={`${fieldId}-device`}>{t("device")}</FieldLabel>
                <SelectField
                  id={`${fieldId}-device`}
                  className="w-full"
                  disabled={busy || Boolean(guest)}
                  required={!guest}
                  value={deviceId || null}
                  placeholder={t("chooseDevice")}
                  onValueChange={(value) => {
                    setDeviceId(value);
                    setProjectId("");
                    changed({ deviceId: value, projectId: "" });
                  }}
                  options={devices
                    .filter((d) => !d.revoked)
                    .map((d) => ({
                      value: d.id,
                      label: `${d.name} · ${t(d.online ? "online" : "offline")}`,
                      disabled: !d.online,
                    }))}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor={`${fieldId}-project`}>{t("project")}</FieldLabel>
                <SelectField
                  id={`${fieldId}-project`}
                  className="w-full"
                  disabled={busy || Boolean(guest)}
                  required={!guest}
                  value={projectId || null}
                  placeholder={t("chooseProject")}
                  onValueChange={(value) => {
                    setProjectId(value);
                    changed({ projectId: value });
                  }}
                  options={device?.projects.map((p) => ({ value: p.id, label: p.name })) ?? []}
                />
              </Field>
            </div>
            {project?.dirty && <p className="text-sm text-muted-foreground">{t("dirty")}</p>}
            <div className="grid grid-cols-1 gap-3 @min-[20rem]:grid-cols-2">
              <Field>
                <FieldLabel htmlFor={`${fieldId}-agent`}>{t("agent")}</FieldLabel>
                <SelectField<AgentProvider>
                  id={`${fieldId}-agent`}
                  className="w-full"
                  disabled={busy}
                  value={provider}
                  onValueChange={(value) => {
                    setProvider(value);
                    changed({ provider: value });
                  }}
                  options={[
                    { value: "claude", label: "Claude Code" },
                    { value: "codex", label: "Codex" },
                  ]}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor={`${fieldId}-mode`}>{t("mode")}</FieldLabel>
                <SelectField<"run" | "plan">
                  id={`${fieldId}-mode`}
                  className="w-full"
                  disabled={busy}
                  value={mode}
                  onValueChange={(value) => {
                    setMode(value);
                    changed({ mode: value });
                  }}
                  options={[
                    { value: "run", label: t("runMode") },
                    { value: "plan", label: t("planMode") },
                  ]}
                />
              </Field>
            </div>
            <p className="text-xs text-muted-foreground">{t("executionHint")}</p>
          </CollapsibleContent>
        </Collapsible>
        {occupied && prompt.trim() && (
          <p role="status" className="text-sm">
            {t("PROJECT_BUSY")}
          </p>
        )}
        {!available && !guest && (
          <p className="text-sm text-muted-foreground">{t("availabilityHint")}</p>
        )}
        {guest && <p className="text-sm text-muted-foreground">{t("guestSendHint")}</p>}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {t(error)}
          </p>
        )}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
          <p className="text-xs text-muted-foreground">{t("draftDeviceOnly")}</p>
          <Button
            type="submit"
            disabled={(!guest && (!available || occupied)) || busy || !prompt.trim()}
          >
            <Send aria-hidden="true" />
            {t(busy ? "sending" : guest ? "signInToSend" : "send")}
          </Button>
        </div>
        {(draftStatus || draftLoadFailed) && (
          <p
            role={draftStatus === "draftSaved" ? "status" : "alert"}
            className={
              draftStatus === "draftSaved"
                ? "text-xs text-muted-foreground"
                : "text-xs text-destructive-text"
            }
          >
            {t(draftStatus ?? "draftSaveFailed")}
          </p>
        )}
      </form>
      {drafts.length > 0 && (
        <section aria-label={t("drafts")}>
          <h3 className="mb-2 flex items-center gap-2 text-sm font-medium">
            {t("drafts")}
            <span className="text-xs text-muted-foreground">{drafts.length}</span>
          </h3>
          <ul className="divide-y divide-border rounded-lg border border-border">
            {drafts.map((draft) => (
              <li key={draft.id} className="flex items-center gap-1 px-1">
                <Button
                  type="button"
                  variant="ghost"
                  aria-pressed={draft.id === draftId}
                  className="h-auto min-h-12 min-w-0 flex-1 justify-start gap-2.5 px-2 py-2 text-left whitespace-normal"
                  disabled={busy}
                  onClick={() => void openDraft(draft)}
                >
                  <FilePenLine aria-hidden="true" className="shrink-0 text-muted-foreground" />
                  <span className="min-w-0">
                    <span className="line-clamp-1 text-sm">{draft.prompt}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {devices
                        .find((item) => item.id === draft.deviceId)
                        ?.projects.find((item) => item.id === draft.projectId)?.name ??
                        t("chooseProject")}{" "}
                      · {draft.provider === "claude" ? "Claude Code" : "Codex"}
                    </span>
                  </span>
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={t("deleteDraft", { name: draft.prompt.slice(0, 80) })}
                  disabled={busy}
                  onClick={() => deleteDraft(draft.id)}
                >
                  <Trash2 aria-hidden="true" />
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}
      {dialog}
    </div>
  );
}
