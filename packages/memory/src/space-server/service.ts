import {
  DEFAULT_MEMORY_RECALL_BUDGET,
  selectMemory,
  spaceMemoryIdSchema,
  spaceMemoryInputSchema,
  SpaceMemoryError,
  type SpaceMemoryDocument,
} from "@raypx/core/space-memory";
import type { SpaceScope } from "@raypx/spaces/server";
import type {
  MemoryActor,
  MemorySearch,
  SpaceMemoryRepository,
  SpaceMemoryService,
} from "./types.js";

export function createSpaceMemoryService(
  repository: SpaceMemoryRepository,
  options: { now?: () => Date; recallBudget?: number; search?: MemorySearch } = {},
): SpaceMemoryService {
  const now = options.now ?? (() => new Date());
  function member(scope: SpaceScope): MemoryActor {
    return { kind: "member", accountId: scope.member.accountId, untrustedInput: false };
  }
  function actor(scope: SpaceScope, value: MemoryActor | undefined) {
    const resolved = value ?? member(scope);
    if (resolved.accountId !== scope.member.accountId)
      throw new SpaceMemoryError("MEMORY_NOT_FOUND");
    return resolved;
  }
  return {
    list: (scope, input = {}) => repository.list(scope, input),
    get: (scope, id) => repository.get(scope, id),
    create: (scope, input, author, id) =>
      repository.create(
        scope,
        id ?? spaceMemoryIdSchema.parse(crypto.randomUUID()),
        spaceMemoryInputSchema.parse(input),
        actor(scope, author),
        now(),
      ),
    update: (scope, id, revision, input, author) =>
      repository.update(
        scope,
        id,
        revision,
        spaceMemoryInputSchema.parse(input),
        actor(scope, author),
        now(),
      ),
    remove: (scope, id, revision) => repository.remove(scope, id, revision, member(scope), now()),
    history: (scope, id, limit = 100) => repository.history(scope, id, limit),
    restore: (scope, id, expected, revision) =>
      repository.restore(scope, id, expected, revision, member(scope), now()),
    async recall(scope, agentId, budget = options.recallBudget ?? DEFAULT_MEMORY_RECALL_BUDGET) {
      const candidates = await repository.recallCandidates(scope, agentId);
      if (!options.search) return selectMemory(candidates, budget);
      const ids = await options.search.rank(scope, agentId, structuredClone(candidates));
      const eligible = new Map(candidates.map((document) => [document.id, document]));
      const ranked: SpaceMemoryDocument[] = [];
      for (const id of ids) {
        const document = eligible.get(id);
        if (document) {
          ranked.push(document);
          eligible.delete(id);
        }
      }
      // The search port cannot introduce a foreign document, override explicit pins,
      // exceed the same budget, or elevate text to instructions.
      return selectMemory(
        [...ranked, ...eligible.values()],
        budget,
        ranked.map((document) => document.id),
      );
    },
  };
}
