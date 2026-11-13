import { agentIdSchema } from "@raypx/core/agents";
import { spaceIdSchema } from "@raypx/core/spaces";
import { spaceMemoryIdSchema, type SpaceMemoryDocument } from "@raypx/core/space-memory";

export const agentId = agentIdSchema.parse("agent-1");
export const spaceId = spaceIdSchema.parse("space-1");
export function memoryDocument(revision = 1): SpaceMemoryDocument {
  return {
    id: spaceMemoryIdSchema.parse("memory-1"),
    spaceId,
    agentId,
    scope: "agent",
    title: "Guide",
    text: `Revision ${revision}`,
    pinned: false,
    attribution: { speaker: null, source: null },
    provenance: { kind: "member", accountId: "member-1", runId: null, untrustedInput: false },
    revision,
    removed: false,
    createdAt: "2026-11-14T00:00:00.000Z",
    updatedAt: "2026-11-14T00:00:00.000Z",
  };
}
