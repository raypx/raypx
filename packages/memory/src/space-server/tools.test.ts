import { expect, it, vi } from "vitest";
import { agentIdSchema } from "@raypx/core/agents";
import { spaceIdSchema } from "@raypx/core/spaces";
import { spaceMemoryIdSchema, type SpaceMemoryDocument } from "@raypx/core/space-memory";
import { resolveSpaceScope } from "@raypx/spaces/server";
import type { SpaceMemoryService } from "./types.js";
import { createMemoryTools } from "./tools.js";

const now = "2026-01-01T00:00:00.000Z";
const spaceId = spaceIdSchema.parse("space");
const agentId = agentIdSchema.parse("agent");
const scope = resolveSpaceScope(
  { spaceId, accountId: "member", role: "owner", createdAt: now },
  "member",
  spaceId,
);
const document: SpaceMemoryDocument = {
  id: spaceMemoryIdSchema.parse("doc"),
  spaceId,
  scope: "agent",
  agentId,
  title: "Fact",
  text: "Private text",
  pinned: false,
  removed: false,
  revision: 1,
  attribution: { speaker: null, source: null },
  provenance: { kind: "member", accountId: "member", runId: null, untrustedInput: false },
  createdAt: now,
  updatedAt: now,
};
function fixture() {
  const create = vi.fn<SpaceMemoryService["create"]>(async () => document);
  const update = vi.fn<SpaceMemoryService["update"]>(async () => ({ ...document, revision: 2 }));
  const get = vi.fn<SpaceMemoryService["get"]>(async () => document);
  const service = { create, update, get } as unknown as SpaceMemoryService;
  const tools = createMemoryTools(service);
  const run = {
    agentId,
    memberAccountId: "member",
    runId: "run",
    untrustedInput: true,
    allowSharedMemory: false,
    execution: { conversationId: "conversation", ownerId: "worker", fence: 1 },
  };
  return { create, update, get, tools, run };
}
it("uses change approval metadata without exposing memory text and preserves Run provenance", async () => {
  const f = fixture();
  const call = f.tools.prepare({
    id: "call",
    name: "agent_memory_save",
    arguments: { title: "Fact", text: "Private text" },
  });
  expect(call.changes).toBe(true);
  expect(JSON.stringify([call.argumentSummary, call.target])).not.toContain("Private text");
  await f.tools.execute(scope, f.run, call, new AbortController().signal);
  expect(f.create).toHaveBeenCalledWith(
    scope,
    expect.objectContaining({ scope: "agent", agentId }),
    expect.objectContaining({ kind: "run", runId: "run", untrustedInput: true }),
    expect.any(String),
  );
  const first = f.create.mock.calls[0]![3];
  await f.tools.execute(scope, f.run, call, new AbortController().signal);
  expect(f.create.mock.calls[1]![3]).toEqual(first);
});
it("requires configuration for shared writes and refuses another Agent's document", async () => {
  const f = fixture();
  const shared = f.tools.prepare({
    id: "call",
    name: "agent_memory_save",
    arguments: { scope: "space", title: "Shared", text: "fact" },
  });
  await expect(f.tools.execute(scope, f.run, shared, new AbortController().signal)).rejects.toThrow(
    "MEMORY_SHARING_DISABLED",
  );
  await f.tools.execute(
    scope,
    { ...f.run, allowSharedMemory: true },
    shared,
    new AbortController().signal,
  );
  expect(f.create).toHaveBeenCalledWith(
    scope,
    expect.objectContaining({ scope: "space", agentId: null }),
    expect.anything(),
    expect.any(String),
  );
  f.get.mockResolvedValue({ ...document, agentId: agentIdSchema.parse("another") });
  const update = f.tools.prepare({
    id: "update",
    name: "agent_memory_update",
    arguments: { id: document.id, expectedRevision: 1, title: "Fact", text: "changed" },
  });
  await expect(f.tools.execute(scope, f.run, update, new AbortController().signal)).rejects.toThrow(
    "MEMORY_NOT_FOUND",
  );
  expect(f.update).not.toHaveBeenCalled();
});
