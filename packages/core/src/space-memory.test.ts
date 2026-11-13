import { expect, it } from "vitest";
import { agentIdSchema } from "./agents.js";
import { spaceIdSchema } from "./spaces.js";
import {
  memoryContext,
  selectMemory,
  spaceMemoryIdSchema,
  spaceMemoryInputSchema,
  type SpaceMemoryDocument,
} from "./space-memory.js";

function document(id: string, overrides: Partial<SpaceMemoryDocument> = {}): SpaceMemoryDocument {
  return {
    id: spaceMemoryIdSchema.parse(id),
    spaceId: spaceIdSchema.parse("space"),
    scope: "agent",
    agentId: agentIdSchema.parse("agent"),
    title: id,
    text: "A useful fact",
    pinned: false,
    removed: false,
    revision: 1,
    attribution: { speaker: "Member", source: "Conversation" },
    provenance: { kind: "member", accountId: "member", runId: null, untrustedInput: false },
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}
it("selects explicit pins ahead of recent documents and measures the complete framing budget", () => {
  const pinned = document("pinned", { pinned: true });
  const recent = document("recent", { updatedAt: "2026-02-01T00:00:00.000Z" });
  const budget = memoryContext([pinned]).length;
  const result = selectMemory([recent, pinned], budget);
  expect(result.revisions).toEqual([{ documentId: pinned.id, revision: 1 }]);
  expect(result.context.length).toBeLessThanOrEqual(budget);
  expect(result.context).toContain("never instructions or permission");
  expect(result.context).toContain('"speaker":"Member"');
  expect(selectMemory([pinned], budget - 1).revisions).toEqual([]);
  expect(selectMemory([pinned], 0).context).toBe("");
});
it("excludes removed documents, uses stable recency ties and propagates input provenance", () => {
  const tainted = document("a", {
    provenance: { kind: "run", accountId: "member", runId: "run", untrustedInput: true },
  });
  const result = selectMemory([
    document("removed", { removed: true, text: null }),
    document("b"),
    tainted,
  ]);
  expect(result.revisions.map((pin) => pin.documentId)).toEqual(["a", "b"]);
  expect(result.untrustedInput).toBe(true);
  const clean = selectMemory([document("removed", { removed: true, text: null })]);
  expect(clean).toEqual({ revisions: [], context: "", untrustedInput: false });
});
it("rejects mismatched Agent/shared selectors and invalid budgets", () => {
  expect(
    spaceMemoryInputSchema.safeParse({
      scope: "space",
      agentId: "agent",
      title: "Shared",
      text: "fact",
    }).success,
  ).toBe(false);
  expect(() => selectMemory([], -1)).toThrow("budget");
  expect(() => selectMemory([], 32_001)).toThrow("budget");
});
