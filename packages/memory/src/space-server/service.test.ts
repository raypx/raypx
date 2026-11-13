import { expect, it, vi } from "vitest";
import { agentIdSchema } from "@raypx/core/agents";
import { spaceIdSchema } from "@raypx/core/spaces";
import {
  memoryContext,
  spaceMemoryIdSchema,
  type SpaceMemoryDocument,
} from "@raypx/core/space-memory";
import { resolveSpaceScope } from "@raypx/spaces/server";
import { createSpaceMemoryService } from "./service.js";
import type { SpaceMemoryRepository } from "./types.js";

const instant = "2026-11-01T00:00:00.000Z";
const spaceId = spaceIdSchema.parse("space");
const agentId = agentIdSchema.parse("agent");
const scope = resolveSpaceScope(
  { spaceId, accountId: "member", role: "owner", createdAt: instant },
  "member",
  spaceId,
);
function document(id: string, extra: Partial<SpaceMemoryDocument> = {}): SpaceMemoryDocument {
  return {
    id: spaceMemoryIdSchema.parse(id),
    spaceId,
    agentId,
    scope: "agent",
    title: "Fact",
    text: "fact",
    pinned: false,
    removed: false,
    revision: 1,
    attribution: { speaker: null, source: null },
    provenance: { kind: "member", accountId: "member", runId: null, untrustedInput: false },
    createdAt: instant,
    updatedAt: instant,
    ...extra,
  };
}
it("passes only scoped candidates through optional semantic ranking without accepting foreign IDs", async () => {
  const a = document("a");
  const b = document("b");
  const candidates = vi.fn<SpaceMemoryRepository["recallCandidates"]>(async () => [a, b]);
  const repository = { recallCandidates: candidates } as unknown as SpaceMemoryRepository;
  const rank = vi.fn(async () => [spaceMemoryIdSchema.parse("foreign"), b.id, b.id]);
  const service = createSpaceMemoryService(repository, { search: { rank } });
  const recall = await service.recall(scope, agentId, memoryContext([b]).length);
  expect(candidates).toHaveBeenCalledWith(scope, agentId);
  expect(rank).toHaveBeenCalledWith(scope, agentId, [a, b]);
  expect(recall.revisions).toEqual([{ documentId: b.id, revision: 1 }]);
  expect(recall.context).not.toContain("foreign");
});
it("validates mutations and injects member attribution and the deterministic clock", async () => {
  const create = vi.fn<SpaceMemoryRepository["create"]>(async () => document("created"));
  const repository = { create } as unknown as SpaceMemoryRepository;
  const service = createSpaceMemoryService(repository, { now: () => new Date(instant) });
  const input = {
    scope: "agent" as const,
    agentId,
    title: "Fact",
    text: "fact",
    pinned: true,
    attribution: { speaker: null, source: null },
  };
  await service.create(scope, input);
  expect(create).toHaveBeenCalledWith(
    scope,
    expect.any(String),
    input,
    { kind: "member", accountId: "member", untrustedInput: false },
    new Date(instant),
  );
  expect(() =>
    service.create(scope, input, { kind: "member", accountId: "another", untrustedInput: false }),
  ).toThrow("MEMORY_NOT_FOUND");
});
it("does not let a semantic adapter mutate the text pinned into the Run", async () => {
  const source = document("source");
  const repository = { recallCandidates: async () => [source] } as unknown as SpaceMemoryRepository;
  const service = createSpaceMemoryService(repository, {
    search: {
      async rank(_scope, _agent, candidates) {
        candidates[0]!.text = "adapter changed the text";
        return [candidates[0]!.id];
      },
    },
  });
  const recall = await service.recall(scope, agentId);
  expect(recall.context).toContain('"text":"fact"');
  expect(recall.context).not.toContain("adapter changed the text");
});
