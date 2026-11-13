import { afterEach, expect, it, vi } from "vitest";
import { spaceMemoryDocumentSchema } from "@raypx/core/space-memory";
import type { SpaceMemoryService } from "@raypx/memory/space-server";
import { agentToolsFixture } from "../../tests/helpers/agent-tools.js";
import { withMemoryTools } from "./memory-tools.js";

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of cleanups.splice(0).reverse()) await close();
});

it("runs model memory saves and updates through Ask approvals despite Allow rules on an untrusted Run", async () => {
  const f = agentToolsFixture();
  cleanups.push(() => f.runner.close());
  const at = "2026-01-01T00:00:00.000Z";
  let saved: ReturnType<typeof spaceMemoryDocumentSchema.parse> | undefined;
  const revisions: ReturnType<typeof spaceMemoryDocumentSchema.parse>[] = [];
  const create = vi.fn<SpaceMemoryService["create"]>(async (scope, input, actor, id) => {
    saved = spaceMemoryDocumentSchema.parse({
      ...input,
      id,
      spaceId: scope.spaceId,
      revision: 1,
      removed: false,
      provenance: {
        kind: actor?.kind,
        runId: actor?.runId ?? null,
        accountId: actor?.accountId ?? null,
        untrustedInput: actor?.untrustedInput,
      },
      createdAt: at,
      updatedAt: at,
    });
    revisions.push(structuredClone(saved));
    return saved;
  });
  const update = vi.fn<SpaceMemoryService["update"]>(
    async (_scope, id, expectedRevision, input, actor) => {
      if (!saved || saved.id !== id || saved.revision !== expectedRevision)
        throw new Error("Unexpected memory edit");
      saved = spaceMemoryDocumentSchema.parse({
        ...saved,
        ...input,
        revision: expectedRevision + 1,
        provenance: {
          kind: actor?.kind,
          accountId: actor?.accountId,
          runId: actor?.runId,
          untrustedInput: actor?.untrustedInput,
        },
      });
      revisions.push(structuredClone(saved));
      return saved;
    },
  );
  const service: SpaceMemoryService = {
    create,
    update,
    get: async () => {
      if (!saved) throw new Error("Missing memory");
      return saved;
    },
    list: async () => (saved ? [saved] : []),
    remove: async () => {
      throw new Error("unused");
    },
    history: async () => [],
    restore: async () => {
      throw new Error("unused");
    },
    recall: async () => ({ revisions: [], context: "", untrustedInput: false }),
  };
  // The fixture runner holds this tool port; retain the original Computer methods before composition.
  Object.assign(
    f.tools,
    withMemoryTools({ ...f.tools }, service, () => []),
  );
  const claim = f.repository.claimNext.bind(f.repository);
  f.repository.claimNext = async (...args) => {
    const execution = await claim(...args);
    if (execution) {
      execution.run.inboundProvenance = {
        kind: "webhook",
        routineId: "routine",
        deliveryId: "delivery",
      };
      f.runs.find((run) => run.id === execution.run.id)!.inboundProvenance =
        execution.run.inboundProvenance;
    }
    return execution;
  };
  await f.agentApprovals.updateSettings("member", {
    expectedRevision: 0,
    mode: "ask",
    rules: [
      { toolName: "agent_memory_save", executable: null, decision: "allow" },
      { toolName: "agent_memory_update", executable: null, decision: "allow" },
    ],
  });
  await f.conversations.send(f.scope, f.conversationId, {
    idempotencyKey: "memory-loop",
    text: "Remember this reference",
  });
  await expect.poll(() => f.calls.length).toBe(1);
  expect(f.calls[0]!.input.tools?.map((tool) => tool.name)).toContain("agent_memory_save");
  f.calls[0]!.toolCalls([
    {
      type: "toolCall",
      id: "save",
      name: "agent_memory_save",
      arguments: { title: "Reference", text: "Initial reference" },
    },
  ]);
  await expect.poll(() => f.requests.length).toBe(1);
  expect(f.requests[0]).toMatchObject({
    toolName: "agent_memory_save",
    state: "pending",
    memberAccountId: "member",
  });
  expect(create).not.toHaveBeenCalled();
  await f.agentApprovals.answer(f.scope, f.requests[0]!.id, { decision: "approved" });
  await expect.poll(() => f.calls.length).toBe(2);
  expect(create).toHaveBeenCalledTimes(1);
  expect(saved).toMatchObject({
    scope: "agent",
    agentId: "agent",
    revision: 1,
    provenance: { kind: "run", untrustedInput: true },
  });
  f.calls[1]!.toolCalls([
    {
      type: "toolCall",
      id: "update",
      name: "agent_memory_update",
      arguments: {
        id: saved!.id,
        expectedRevision: 1,
        title: "Reference",
        text: "Updated reference",
      },
    },
  ]);
  await expect.poll(() => f.requests.length).toBe(2);
  expect(f.requests[1]).toMatchObject({ toolName: "agent_memory_update", state: "pending" });
  expect(update).not.toHaveBeenCalled();
  await f.agentApprovals.answer(f.scope, f.requests[1]!.id, { decision: "approved" });
  await expect.poll(() => f.calls.length).toBe(3);
  expect(revisions.map((revision) => [revision.revision, revision.text])).toEqual([
    [1, "Initial reference"],
    [2, "Updated reference"],
  ]);
  expect(revisions.every((revision) => revision.provenance.untrustedInput)).toBe(true);
  expect(f.effects.map((effect) => [effect.toolName, effect.state])).toEqual([
    ["agent_memory_save", "succeeded"],
    ["agent_memory_update", "succeeded"],
  ]);
  expect(
    f.calls[2]!.input.continuation?.filter((message) => message.role === "toolResult"),
  ).toHaveLength(2);
  f.calls[2]!.complete("Reference saved");
  await expect.poll(() => f.runs[0]!.state).toBe("succeeded");
  expect(f.diagnostics).toEqual([]);
});
