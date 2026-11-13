import type { AgentId } from "@raypx/core/agents";
import type { SpaceId } from "@raypx/core/spaces";
import type {
  SpaceMemoryDocument,
  SpaceMemoryId,
  SpaceMemoryInput,
  SpaceMemoryRevision,
} from "@raypx/core/space-memory";

interface Selection {
  spaceId: SpaceId;
  id: SpaceMemoryId;
}
interface ExpectedSelection extends Selection {
  expectedRevision: number;
}
/** Session transport is injected by the application; the server authorizes every request. */
export interface SpaceMemoryClientPort {
  list(input: {
    spaceId: SpaceId;
    agentId?: AgentId;
    scope?: "agent" | "space";
    includeRemoved?: boolean;
    limit?: number;
  }): Promise<SpaceMemoryDocument[]>;
  get(input: Selection): Promise<SpaceMemoryDocument>;
  create(input: { spaceId: SpaceId; document: SpaceMemoryInput }): Promise<SpaceMemoryDocument>;
  update(input: ExpectedSelection & { document: SpaceMemoryInput }): Promise<SpaceMemoryDocument>;
  remove(input: ExpectedSelection): Promise<SpaceMemoryDocument>;
  history(input: Selection & { limit?: number }): Promise<SpaceMemoryRevision[]>;
  restore(input: ExpectedSelection & { revision: number }): Promise<SpaceMemoryDocument>;
}
export interface MemoryEditorState {
  current: SpaceMemoryDocument | null;
  draft: SpaceMemoryInput;
  conflict: boolean;
}
export function beginMemoryEdit(
  agentId: AgentId,
  current: SpaceMemoryDocument | null = null,
): MemoryEditorState {
  return {
    current,
    conflict: false,
    draft: {
      scope: current?.scope ?? "agent",
      agentId: current ? current.agentId : agentId,
      title: current?.title ?? "",
      text: current?.text ?? "",
      pinned: current?.pinned ?? false,
      attribution: current?.attribution ?? { speaker: null, source: null },
    },
  };
}
export function groupSpaceMemory(documents: SpaceMemoryDocument[], agentId: AgentId) {
  return {
    agent: documents.filter(
      (document) => document.scope === "agent" && document.agentId === agentId,
    ),
    space: documents.filter((document) => document.scope === "space"),
  };
}
const failureCodes = [
  "MEMORY_NOT_FOUND",
  "MEMORY_CONFLICT",
  "MEMORY_SHARING_DISABLED",
  "MEMORY_LIMIT",
] as const;
export function spaceMemoryFailure(failure: unknown) {
  const value = failure as { code?: unknown; data?: { error?: { code?: unknown } } } | null;
  const code = value?.data?.error?.code ?? value?.code;
  return failureCodes.find((item) => item === code) ?? "UNAVAILABLE";
}
/** A conflict never replaces or resubmits the member's draft. */
export function memoryEditorFailure(state: MemoryEditorState, failure: unknown): MemoryEditorState {
  return { ...state, conflict: spaceMemoryFailure(failure) === "MEMORY_CONFLICT" };
}
/** Reload updates only the comparison/revision; the unsaved source remains available. */
export function reloadMemoryEditor(
  state: MemoryEditorState,
  current: SpaceMemoryDocument,
): MemoryEditorState {
  return { ...state, current, conflict: false };
}
export function memoryRestoreRequest(
  spaceId: SpaceId,
  current: SpaceMemoryDocument,
  revision: SpaceMemoryRevision,
) {
  if (current.id !== revision.id || revision.spaceId !== spaceId || current.spaceId !== spaceId)
    throw new Error("MEMORY_NOT_FOUND");
  return {
    spaceId,
    id: current.id,
    expectedRevision: current.revision,
    revision: revision.revision,
  };
}
