import type {
  AgentProvider,
  AgentTask,
  ModelSelection,
  TaskContextSelection,
  TaskContextTarget,
} from "@raypx/core/tasks";
import type { SyncDevice } from "@raypx/contracts/tasks";
import {
  canCreateTask,
  projectOccupied,
  taskSelection,
  type TaskSubmission,
} from "./composition.js";
import {
  createTaskDraft,
  MAX_TASK_DRAFTS,
  sameDraft,
  type DraftInput,
  type TaskDraft,
} from "./drafts.js";
import type { TaskFailureCode } from "./failure.js";

/** Plain editor input an application restores; it never carries an execution receipt. */
export type ComposerDraft = Pick<DraftInput, "prompt" | "provider" | "mode"> &
  Partial<Pick<DraftInput, "deviceId" | "projectId" | "contextSelection" | "model">>;
/** An enclosing project workspace fixes the target; the composer cannot change it. */
export interface ComposerTarget {
  fixedDeviceId?: string | undefined;
  fixedProjectId?: string | undefined;
}
/** The injected memory budget view reports which input it measured. */
export interface ComposerBudget {
  key: string;
  status: "loading" | "ready" | "error";
  exceeded: boolean;
}
export type ComposerDraftStatus =
  | "draftSaved"
  | "draftSaveFailed"
  | "draftCleanupFailed"
  | "draftLimit"
  | "signInDraftFailed";
export interface ComposerState {
  open: boolean;
  restoreDismissed: boolean;
  deviceId: string;
  projectId: string;
  provider: AgentProvider;
  model: ModelSelection | undefined;
  modelReady: boolean;
  prompt: string;
  mode: DraftInput["mode"];
  contextSelection: TaskContextSelection | undefined;
  budget: ComposerBudget | undefined;
  busy: boolean;
  error: TaskFailureCode | undefined;
  draftId: string | null;
  draftStatus: ComposerDraftStatus | null;
}
export type ComposerAction =
  | { type: "expand"; open: boolean }
  | { type: "device"; deviceId: string }
  | { type: "project"; projectId: string }
  | { type: "provider"; provider: AgentProvider }
  | { type: "mode"; mode: DraftInput["mode"] }
  | { type: "model"; model: ModelSelection }
  | { type: "modelReady"; ready: boolean }
  | { type: "prompt"; prompt: string }
  | { type: "context"; selection: TaskContextSelection }
  | { type: "budget"; budget: ComposerBudget }
  | { type: "reset" }
  | { type: "restore"; draft: TaskDraft; target: ComposerTarget }
  | { type: "saved"; draftId: string }
  | { type: "deleted"; draftId: string }
  | { type: "status"; status: ComposerDraftStatus }
  | { type: "submit" }
  | { type: "failed"; error: TaskFailureCode }
  | { type: "settled" }
  | { type: "accepted"; cleaned: boolean };

function sameTarget(
  draft: Partial<Pick<DraftInput, "deviceId" | "projectId">>,
  { fixedDeviceId, fixedProjectId }: ComposerTarget,
) {
  return (
    (!fixedDeviceId || fixedDeviceId === draft.deviceId) &&
    (!fixedProjectId || fixedProjectId === draft.projectId)
  );
}
export function initialComposerState({
  devices,
  local,
  guest,
  initialDraft,
  ...target
}: ComposerTarget & {
  devices: SyncDevice[];
  local: boolean;
  guest: boolean;
  initialDraft?: ComposerDraft | undefined;
}): ComposerState {
  const { fixedDeviceId, fixedProjectId } = target;
  const localDevice = local ? devices[0] : undefined;
  const device =
    devices.find((entry) => entry.id === (fixedDeviceId ?? initialDraft?.deviceId)) ?? localDevice;
  const project = device?.projects.find(
    (entry) => entry.id === (fixedProjectId ?? initialDraft?.projectId),
  );
  return {
    open: true,
    restoreDismissed: false,
    deviceId: fixedDeviceId ?? initialDraft?.deviceId ?? localDevice?.id ?? "",
    projectId:
      fixedProjectId ??
      initialDraft?.projectId ??
      (localDevice?.projects.length === 1 ? localDevice.projects[0]!.id : ""),
    provider:
      initialDraft?.provider ??
      device?.capabilities.find(
        (capability) =>
          capability.available && (!project || project.providers.includes(capability.provider)),
      )?.provider ??
      "claude",
    model: initialDraft?.model,
    modelReady: false,
    prompt: initialDraft?.prompt ?? "",
    mode: initialDraft?.mode ?? "run",
    // Guests and other targets never inherit a reference selection.
    contextSelection:
      guest || !sameTarget(initialDraft ?? {}, target) ? undefined : initialDraft?.contextSelection,
    budget: undefined,
    busy: false,
    error: undefined,
    draftId: null,
    draftStatus: null,
  };
}
/** A controlled target stays authoritative; references saved for another target are dropped. */
export function restoreComposerDraft(draft: DraftInput, target: ComposerTarget): DraftInput {
  return {
    ...draft,
    deviceId: target.fixedDeviceId ?? draft.deviceId,
    projectId: target.fixedProjectId ?? draft.projectId,
    contextSelection: sameTarget(draft, target) ? draft.contextSelection : undefined,
  };
}
/** Restoring loads editor text only; sending always waits for an explicit submit. */
export function composerReducer(state: ComposerState, action: ComposerAction): ComposerState {
  switch (action.type) {
    case "expand":
      return { ...state, open: action.open, restoreDismissed: !action.open };
    case "device":
      return { ...state, deviceId: action.deviceId, projectId: "", contextSelection: undefined };
    case "project":
      return { ...state, projectId: action.projectId, contextSelection: undefined };
    case "provider":
      return { ...state, provider: action.provider };
    case "mode":
      return { ...state, mode: action.mode };
    case "model":
      return { ...state, model: action.model };
    case "modelReady":
      return { ...state, modelReady: action.ready };
    case "prompt":
      return { ...state, prompt: action.prompt, draftStatus: null };
    case "context":
      return { ...state, contextSelection: action.selection };
    case "budget":
      return { ...state, budget: action.budget };
    case "reset":
      return {
        ...state,
        prompt: "",
        contextSelection: undefined,
        draftId: null,
        draftStatus: null,
        error: undefined,
      };
    case "restore": {
      const draft = restoreComposerDraft(action.draft, action.target);
      return {
        ...state,
        open: true,
        restoreDismissed: false,
        deviceId: draft.deviceId,
        projectId: draft.projectId,
        provider: draft.provider,
        model: draft.model,
        mode: draft.mode,
        prompt: draft.prompt,
        contextSelection: draft.contextSelection,
        draftId: action.draft.id,
        draftStatus: null,
        error: undefined,
      };
    }
    case "saved":
      return { ...state, draftId: action.draftId, draftStatus: "draftSaved" };
    case "deleted":
      return state.draftId === action.draftId ? { ...state, draftId: null } : state;
    case "status":
      return { ...state, draftStatus: action.status };
    case "submit":
      return { ...state, busy: true, error: undefined };
    case "failed":
      return { ...state, error: action.error };
    case "settled":
      return { ...state, busy: false };
    case "accepted":
      return {
        ...state,
        draftStatus: action.cleaned ? null : "draftCleanupFailed",
        error: undefined,
      };
  }
}
/** A restored prompt stays visible until the editor is explicitly collapsed. */
export function composerExpanded(
  state: ComposerState,
  editorOpen: boolean | undefined,
  restoring: boolean,
) {
  return (editorOpen ?? state.open) || (restoring && !state.restoreDismissed);
}
function draftInput(state: ComposerState, requiresModel: boolean): DraftInput {
  return {
    deviceId: state.deviceId,
    projectId: state.projectId,
    provider: state.provider,
    prompt: state.prompt,
    mode: state.mode,
    ...(requiresModel && state.model ? { model: state.model } : {}),
    ...(state.contextSelection ? { contextSelection: state.contextSelection } : {}),
  };
}
/** The submitted and persisted input; a model is kept only when the capability selects one. */
export function composerDraft(state: ComposerState, devices: SyncDevice[]) {
  return draftInput(
    state,
    taskSelection(devices, state.deviceId, state.projectId, state.provider).requiresModel,
  );
}
/** References and their budget apply only to a signed-in editor with a complete target. */
export function composerContextTarget(
  state: ComposerState,
  guest: boolean,
): TaskContextTarget | undefined {
  return !guest && state.deviceId && state.projectId
    ? { deviceId: state.deviceId, projectId: state.projectId }
    : undefined;
}
export function composerView(
  state: ComposerState,
  {
    devices,
    tasks,
    drafts,
    guest,
    budgetKey,
  }: {
    devices: SyncDevice[];
    tasks: AgentTask[];
    drafts: TaskDraft[];
    guest: boolean;
    /** Identity of the budget measurement that must be ready before sending. */
    budgetKey?: string | undefined;
  },
) {
  const selection = taskSelection(devices, state.deviceId, state.projectId, state.provider);
  const draft = draftInput(state, selection.requiresModel);
  const saved =
    drafts.find((entry) => entry.id === state.draftId) ??
    drafts.find((entry) => sameDraft(entry, draft));
  const prompted = Boolean(state.prompt.trim());
  const occupied = projectOccupied(tasks, state.deviceId, state.projectId);
  const available = canCreateTask(selection, state.mode, state.model, state.modelReady);
  const budgetReady =
    budgetKey === undefined ||
    (state.budget?.key === budgetKey && state.budget.status === "ready" && !state.budget.exceeded);
  return {
    selection,
    draft,
    /** Saving or sending updates this stored draft instead of adding another. */
    draftId: state.draftId ?? saved?.id ?? null,
    prompted,
    dirty: prompted && (!saved || !sameDraft(saved, draft)),
    occupied,
    available,
    budgetReady,
    sendable: prompted && !state.busy && budgetReady && (guest || (available && !occupied)),
  };
}
/** Returns the next stored list, or undefined when a new draft would exceed the device limit. */
export function saveComposerDraft(latest: TaskDraft[], input: DraftInput, id: string) {
  if (!latest.some((draft) => draft.id === id) && latest.length >= MAX_TASK_DRAFTS) return;
  return [createTaskDraft(input, id), ...latest.filter((draft) => draft.id !== id)];
}
/** Removes the sent draft unless another window saved edits to it while delivery was in flight. */
export function withoutSentDraft(latest: TaskDraft[], submission: TaskSubmission) {
  const sent = latest.find((draft) => draft.id === submission.draftId);
  return sent && sameDraft(sent, submission.input)
    ? latest.filter((draft) => draft !== sent)
    : undefined;
}
/** The editor clears only while it still holds exactly the accepted input. */
export function holdsSubmission(submission: TaskSubmission | null, draft: DraftInput) {
  return submission?.key === JSON.stringify(draft);
}
/** A lost receipt is recovered from the authoritative projection, never by resending. */
export function recoveredSubmission(
  tasks: AgentTask[],
  submission: TaskSubmission | null,
  error: TaskFailureCode | undefined,
) {
  return error && submission ? tasks.find((task) => task.id === submission.id) : undefined;
}
