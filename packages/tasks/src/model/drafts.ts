import {
  taskContextSelectionSchema,
  type AgentProvider,
  type TaskContextSelection,
} from "@raypx/core/tasks";

export const MAX_TASK_DRAFTS = 20;
export interface DraftInput {
  deviceId: string;
  projectId: string;
  provider: AgentProvider;
  prompt: string;
  mode: "run" | "plan";
  contextSelection?: TaskContextSelection | undefined;
}
export interface TaskDraft extends DraftInput {
  id: string;
  updatedAt: string;
}
/** Called only by editor/save events, never while rendering a component. */
export function createTaskDraft(input: DraftInput, id: string): TaskDraft {
  return { ...input, id, updatedAt: new Date().toISOString() };
}
/** Bound untrusted device storage before it becomes editable form state. */
export function readTaskDrafts(raw: string | null): TaskDraft[] {
  if (!raw) return [];
  if (raw.length > 2_000_000) throw new Error("Invalid draft storage");
  const values: unknown = JSON.parse(raw);
  if (!Array.isArray(values) || values.length > MAX_TASK_DRAFTS) throw new Error("Invalid drafts");
  const ids = new Set<string>();
  return values.map((value: unknown) => {
    if (!value || typeof value !== "object") throw new Error("Invalid draft");
    const draft = value as Record<string, unknown>;
    for (const key of ["id", "deviceId", "projectId", "prompt", "updatedAt"]) {
      if (typeof draft[key] !== "string" || draft[key].length > (key === "prompt" ? 32000 : 2000))
        throw new Error("Invalid draft field");
    }
    if (
      !draft.id ||
      ids.has(draft.id as string) ||
      !(draft.prompt as string).trim() ||
      !Number.isFinite(Date.parse(draft.updatedAt as string)) ||
      (draft.provider !== "claude" && draft.provider !== "codex") ||
      (draft.mode !== "run" && draft.mode !== "plan")
    )
      throw new Error("Invalid draft value");
    ids.add(draft.id as string);
    const contextSelection =
      draft.contextSelection === undefined
        ? undefined
        : taskContextSelectionSchema.parse(draft.contextSelection);
    // Drop unknown fields, including any externally inserted executable content.
    return {
      id: draft.id,
      deviceId: draft.deviceId,
      projectId: draft.projectId,
      prompt: draft.prompt,
      updatedAt: draft.updatedAt,
      provider: draft.provider,
      mode: draft.mode,
      ...(contextSelection ? { contextSelection } : {}),
    } as TaskDraft;
  });
}
export function sameDraft(a: DraftInput, b: DraftInput) {
  return (
    a.deviceId === b.deviceId &&
    a.projectId === b.projectId &&
    a.provider === b.provider &&
    a.prompt === b.prompt &&
    a.mode === b.mode &&
    JSON.stringify(a.contextSelection?.sources ?? []) ===
      JSON.stringify(b.contextSelection?.sources ?? [])
  );
}
