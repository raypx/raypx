import {
  useCallback,
  useEffect,
  useEffectEvent,
  useReducer,
  useRef,
  type FormEvent,
  type RefObject,
} from "react";
import type { AgentTask } from "@raypx/core/tasks";
import type { SyncDevice } from "@raypx/contracts/tasks";
import { contextBudgetKey, type MemoryClientPort } from "@raypx/memory/client";
import { useTranslations } from "@raypx/i18n/browser";
import { useConfirmation } from "@raypx/ui/confirmation";
import { prepareTaskSubmission, type TaskSubmission } from "../model/composition.ts";
import {
  composerContextTarget,
  composerDraft,
  composerExpanded,
  composerReducer,
  composerView,
  holdsSubmission,
  initialComposerState,
  recoveredSubmission,
  saveComposerDraft,
  withoutSentDraft,
  type ComposerAction,
  type ComposerBudget,
  type ComposerDraft,
} from "../model/composer.ts";
import type { DraftInput, TaskDraft } from "../model/drafts.ts";
import { failureCode } from "../model/failure.ts";
import type { TaskWorkspacePort } from "../model/port.ts";
import { useTaskDrafts } from "./use-task-drafts.ts";

export interface TaskComposerProps {
  editorOpen?: boolean;
  contextLibrary?: MemoryClientPort | undefined;
  onEditorOpenChange?: (open: boolean) => void;
  onEditorChange?: (draft: DraftInput) => void;
  /** When set by an enclosing project workspace, the target cannot be changed here. */
  fixedProjectId?: string | undefined;
  fixedDeviceId?: string | undefined;
  guest?: {
    signIn(draft: ComposerDraft): void | Promise<void>;
    changed?(draft: ComposerDraft): void;
  };
  initialDraft?: ComposerDraft | undefined;
  onDraftRestored?: (() => void) | undefined;
  client: TaskWorkspacePort;
  devices: SyncDevice[];
  tasks: AgentTask[];
  onCreated: (task: AgentTask) => void;
  local: boolean;
  draftKey: string;
  optionsOpen: boolean;
  onOptionsOpenChange: (open: boolean) => void;
  promptRef: RefObject<HTMLTextAreaElement | null>;
}

/** Adapts the pure composer model to React, storage, confirmation and task creation. */
export function useTaskComposer({
  client,
  devices,
  tasks,
  onCreated,
  local,
  draftKey,
  promptRef,
  onOptionsOpenChange,
  guest,
  initialDraft,
  onDraftRestored,
  onEditorChange,
  fixedProjectId,
  fixedDeviceId,
  editorOpen,
  onEditorOpenChange,
  contextLibrary,
}: TaskComposerProps) {
  const t = useTranslations("tasks");
  const c = useTranslations("common");
  const target = { fixedDeviceId, fixedProjectId };
  const [state, dispatch] = useReducer(
    composerReducer,
    { devices, local, guest: Boolean(guest), initialDraft, ...target },
    initialComposerState,
  );
  const stored = useTaskDrafts(draftKey);
  const contextTarget = composerContextTarget(state, Boolean(guest));
  const context =
    contextLibrary && contextTarget
      ? {
          client: contextLibrary,
          ownerKey: draftKey,
          target: contextTarget,
          value: state.contextSelection ?? { sources: [] },
          prompt: state.prompt.trim(),
        }
      : undefined;
  const view = composerView(state, {
    devices,
    tasks,
    drafts: stored.drafts,
    guest: Boolean(guest),
    budgetKey: context && contextBudgetKey(context),
  });
  const submission = useRef<TaskSubmission | null>(null);
  const submitting = useRef(false);
  const { confirm, dialog } = useConfirmation();
  const expanded = composerExpanded(state, editorOpen, Boolean(initialDraft?.prompt));
  const wasExpanded = useRef(expanded);
  useEffect(() => {
    const revealed = expanded && !wasExpanded.current;
    wasExpanded.current = expanded;
    if (!revealed) return;
    const frame = requestAnimationFrame(() => promptRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [expanded, promptRef]);
  useEffect(() => {
    if (initialDraft) onDraftRestored?.();
  }, [initialDraft, onDraftRestored]);
  /** Applies an editor change and reports the resulting draft to injected persistence. */
  function edit(action: ComposerAction) {
    dispatch(action);
    const draft = composerDraft(composerReducer(state, action), devices);
    try {
      guest?.changed?.({ prompt: draft.prompt, provider: draft.provider, mode: draft.mode });
      onEditorChange?.(draft);
      return true;
    } catch {
      dispatch({ type: "status", status: "draftSaveFailed" });
      return false;
    }
  }
  function persist(next: TaskDraft[]) {
    try {
      stored.write(next);
      return true;
    } catch {
      dispatch({ type: "status", status: "draftSaveFailed" });
      return false;
    }
  }
  // Clean editors switch synchronously; only unsaved changes wait for confirmation.
  const confirmDiscard = () =>
    confirm({
      title: t("draft.discard"),
      description: t("draft.discardHint"),
      confirmLabel: t("discardChanges"),
      cancelLabel: c("cancel"),
    });
  function accepted(task: AgentTask) {
    const receipt = submission.current;
    let cleaned = true;
    if (receipt?.draftId) {
      try {
        // Preserve edits saved from another window while delivery was in flight.
        const next = withoutSentDraft(stored.read(), receipt);
        if (next) cleaned = persist(next);
      } catch {
        cleaned = false;
      }
    }
    if (holdsSubmission(receipt, view.draft)) {
      if (!edit({ type: "reset" })) cleaned = false;
      onOptionsOpenChange(false);
    }
    submission.current = null;
    dispatch({ type: "accepted", cleaned });
    onCreated(task);
  }
  const recover = useEffectEvent(accepted);
  useEffect(() => {
    // Recover a lost receipt from its authoritative projection without resending.
    const recovered = recoveredSubmission(tasks, submission.current, state.error);
    if (recovered) recover(recovered);
  }, [state.error, tasks]);
  // The budget view reports from an effect keyed on this callback.
  const budget = useCallback(
    (measured: ComposerBudget) => dispatch({ type: "budget", budget: measured }),
    [],
  );
  function expand(open: boolean) {
    dispatch({ type: "expand", open });
    onEditorOpenChange?.(open);
  }
  function saveDraft() {
    try {
      const id = view.draftId ?? crypto.randomUUID();
      const next = saveComposerDraft(stored.read(), view.draft, id);
      if (!next) dispatch({ type: "status", status: "draftLimit" });
      else if (persist(next)) dispatch({ type: "saved", draftId: id });
    } catch {
      dispatch({ type: "status", status: "draftSaveFailed" });
    }
  }
  async function newDraft() {
    if (view.dirty && !(await confirmDiscard())) return;
    edit({ type: "reset" });
    submission.current = null;
    promptRef.current?.focus();
  }
  async function openDraft(draft: TaskDraft) {
    if (view.dirty && !(await confirmDiscard())) return;
    onEditorOpenChange?.(true);
    onOptionsOpenChange(true);
    edit({ type: "restore", draft, target });
    promptRef.current?.focus();
  }
  function deleteDraft(id: string) {
    try {
      if (persist(stored.read().filter((draft) => draft.id !== id)))
        dispatch({ type: "deleted", draftId: id });
    } catch {
      dispatch({ type: "status", status: "draftSaveFailed" });
    }
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (submitting.current || !view.sendable) return;
    submitting.current = true;
    dispatch({ type: "submit" });
    try {
      if (guest) {
        await guest.signIn(view.draft);
      } else {
        submission.current = prepareTaskSubmission(
          submission.current,
          view.draft,
          view.draftId,
          () => crypto.randomUUID(),
        );
        accepted(
          await client.tasks.create(
            { id: submission.current.id, ...view.draft },
            { signal: AbortSignal.timeout(15_000) },
          ),
        );
      }
    } catch (failure) {
      dispatch(
        guest
          ? { type: "status", status: "signInDraftFailed" }
          : { type: "failed", error: failureCode(failure) },
      );
    } finally {
      submitting.current = false;
      dispatch({ type: "settled" });
    }
  }
  return {
    state,
    view,
    expanded,
    context,
    dialog,
    drafts: stored.drafts,
    draftsReady: stored.ready,
    draftsFailed: stored.failed,
    edit,
    expand,
    modelReady: (ready: boolean) => dispatch({ type: "modelReady", ready }),
    budget,
    saveDraft,
    newDraft,
    openDraft,
    deleteDraft,
    submit,
  };
}
