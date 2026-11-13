import type { AgentId } from "@raypx/core/agents";
import type {
  MemoryRecall,
  SpaceMemoryDocument,
  SpaceMemoryId,
  SpaceMemoryInput,
  SpaceMemoryRevision,
} from "@raypx/core/space-memory";
import type { SpaceScope } from "@raypx/spaces/server";

/** Internal lease-loss signal; the Agent runtime maps it to its fencing error. */
export class MemoryExecutionFenceError extends Error {
  readonly code = "STALE_RUN_FENCE";
  constructor() {
    super("STALE_RUN_FENCE");
    this.name = "MemoryExecutionFenceError";
  }
}

export interface MemoryActor {
  kind: "member" | "run";
  accountId: string;
  runId?: string;
  untrustedInput: boolean;
  mutationKey?: string;
  execution?: { conversationId: string; ownerId: string; fence: number };
}
export interface MemoryRunActor {
  agentId: AgentId;
  memberAccountId: string;
  runId: string;
  untrustedInput: boolean;
  allowSharedMemory: boolean;
  execution?: { conversationId: string; ownerId: string; fence: number };
}
export interface MemoryListOptions {
  agentId?: AgentId;
  scope?: "agent" | "space";
  includeRemoved?: boolean;
  limit?: number;
}
export interface SpaceMemoryRepository {
  list(scope: SpaceScope, options: MemoryListOptions): Promise<SpaceMemoryDocument[]>;
  get(scope: SpaceScope, id: SpaceMemoryId): Promise<SpaceMemoryDocument>;
  create(
    scope: SpaceScope,
    id: SpaceMemoryId,
    input: SpaceMemoryInput,
    actor: MemoryActor,
    now: Date,
  ): Promise<SpaceMemoryDocument>;
  update(
    scope: SpaceScope,
    id: SpaceMemoryId,
    expectedRevision: number,
    input: SpaceMemoryInput,
    actor: MemoryActor,
    now: Date,
  ): Promise<SpaceMemoryDocument>;
  remove(
    scope: SpaceScope,
    id: SpaceMemoryId,
    expectedRevision: number,
    actor: MemoryActor,
    now: Date,
  ): Promise<SpaceMemoryDocument>;
  history(scope: SpaceScope, id: SpaceMemoryId, limit: number): Promise<SpaceMemoryRevision[]>;
  restore(
    scope: SpaceScope,
    id: SpaceMemoryId,
    expectedRevision: number,
    revision: number,
    actor: MemoryActor,
    now: Date,
  ): Promise<SpaceMemoryDocument>;
  /** All eligible candidates from one MVCC snapshot, filtered by Space and Agent in SQL. */
  recallCandidates(scope: SpaceScope, agentId: AgentId): Promise<SpaceMemoryDocument[]>;
}
/** Optional semantic ranking, with no persistence, credential or embedding requirement. */
export interface MemorySearch {
  rank(
    scope: SpaceScope,
    agentId: AgentId,
    candidates: readonly SpaceMemoryDocument[],
  ): Promise<readonly SpaceMemoryId[]>;
}
export interface SpaceMemoryService {
  list(scope: SpaceScope, options?: MemoryListOptions): Promise<SpaceMemoryDocument[]>;
  get(scope: SpaceScope, id: SpaceMemoryId): Promise<SpaceMemoryDocument>;
  create(
    scope: SpaceScope,
    input: SpaceMemoryInput,
    actor?: MemoryActor,
    id?: SpaceMemoryId,
  ): Promise<SpaceMemoryDocument>;
  update(
    scope: SpaceScope,
    id: SpaceMemoryId,
    expectedRevision: number,
    input: SpaceMemoryInput,
    actor?: MemoryActor,
  ): Promise<SpaceMemoryDocument>;
  remove(
    scope: SpaceScope,
    id: SpaceMemoryId,
    expectedRevision: number,
  ): Promise<SpaceMemoryDocument>;
  history(scope: SpaceScope, id: SpaceMemoryId, limit?: number): Promise<SpaceMemoryRevision[]>;
  restore(
    scope: SpaceScope,
    id: SpaceMemoryId,
    expectedRevision: number,
    revision: number,
  ): Promise<SpaceMemoryDocument>;
  recall(scope: SpaceScope, agentId: AgentId, budget?: number): Promise<MemoryRecall>;
}
