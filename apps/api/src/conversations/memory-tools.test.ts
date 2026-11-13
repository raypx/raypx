import { expect, it, vi } from "vitest";
import {
  ComputerToolsError,
  StaleRunFenceError,
  type ComputerTools,
  type ExecutionRun,
} from "@raypx/agents/server";
import { runSchema } from "@raypx/core/conversation";
import {
  SpaceMemoryError,
  spaceMemoryDocumentSchema,
  spaceMemoryIdSchema,
} from "@raypx/core/space-memory";
import { spaceIdSchema, spaceMemberSchema } from "@raypx/core/spaces";
import { resolveSpaceScope } from "@raypx/spaces/server";
import { MemoryExecutionFenceError, type SpaceMemoryService } from "@raypx/memory/space-server";
import { withMemoryTools } from "./memory-tools.js";

function fixture() {
  const at = "2026-11-01T00:00:00.000Z";
  const spaceId = spaceIdSchema.parse("space");
  const scope = resolveSpaceScope(
    spaceMemberSchema.parse({ spaceId, accountId: "account", role: "owner", createdAt: at }),
    "account",
    spaceId,
  );
  const run: ExecutionRun = {
    ...runSchema.parse({
      id: "run",
      spaceId,
      conversationId: "conversation",
      agentId: "agent",
      trigger: "message",
      messageId: "message",
      memberAccountId: "account",
      model: { modelId: "model" },
      state: "running",
      failureCode: null,
      createdAt: at,
      startedAt: at,
      firstResponseAt: null,
      finishedAt: null,
    }),
    ownerId: "worker",
    fence: 7,
    attemptId: "attempt",
    attemptNumber: 1,
    timeoutAt: "2026-11-01T00:05:00.000Z",
    connectionId: null,
    computerId: null,
    computerGeneration: null,
  };
  const document = spaceMemoryDocumentSchema.parse({
    id: "memory",
    spaceId,
    scope: "agent",
    agentId: run.agentId,
    title: "Fact",
    text: "Reference knowledge",
    pinned: false,
    attribution: { speaker: null, source: null },
    provenance: { kind: "run", accountId: "account", runId: "run", untrustedInput: false },
    revision: 1,
    removed: false,
    createdAt: at,
    updatedAt: at,
  });
  const create = vi.fn<SpaceMemoryService["create"]>().mockResolvedValue(document);
  const update = vi
    .fn<SpaceMemoryService["update"]>()
    .mockResolvedValue({ ...document, revision: 2 });
  const get = vi.fn<SpaceMemoryService["get"]>().mockResolvedValue(document);
  const service: SpaceMemoryService = {
    create,
    update,
    get,
    list: async () => [],
    remove: async () => document,
    history: async () => [],
    restore: async () => document,
    recall: async () => ({ revisions: [], context: "", untrustedInput: false }),
  };
  const computerPrepare = vi.fn<ComputerTools["prepare"]>((call) => ({
    id: call.id,
    name: "computer_read_file",
    arguments: call.arguments,
    argumentSummary: "Read",
    target: "file",
    changes: false,
  }));
  const computerExecute = vi.fn<ComputerTools["execute"]>(async () => "computer-result");
  const computer: ComputerTools = {
    definitions: vi.fn<ComputerTools["definitions"]>(() => [
      { name: "computer_read_file", description: "Read", parameters: { type: "object" } },
    ]),
    prepare: computerPrepare,
    execute: computerExecute,
    cancel: vi.fn<ComputerTools["cancel"]>(async () => {}),
    release: vi.fn<ComputerTools["release"]>(),
  };
  const secrets: string[] = [];
  const tools = withMemoryTools(computer, service, () => secrets);
  const signal = new AbortController().signal;
  return {
    scope,
    run,
    document,
    create,
    update,
    get,
    computerPrepare,
    computerExecute,
    secrets,
    tools,
    signal,
  };
}
const content = { title: "Fact", text: "Reference knowledge" };
it("routes Agent save and update through memory with change metadata and fenced provenance", async () => {
  const f = fixture();
  f.run.inboundProvenance = { kind: "webhook", routineId: "routine", deliveryId: "delivery" };
  const definitions = f.tools.definitions(f.run);
  expect(definitions.map((definition) => definition.name)).toEqual([
    "computer_read_file",
    "agent_memory_save",
    "agent_memory_update",
  ]);
  const save = f.tools.prepare({
    type: "toolCall",
    id: "save",
    name: "agent_memory_save",
    arguments: content,
  });
  expect(save).toMatchObject({ changes: true, target: "Agent memory" });
  expect(save.argumentSummary).not.toContain(content.text);
  expect(JSON.parse(await f.tools.execute(f.scope, f.run, save, f.signal))).toMatchObject({
    state: "succeeded",
    documentId: "memory",
    revision: 1,
  });
  expect(f.create).toHaveBeenCalledWith(
    f.scope,
    expect.objectContaining({ scope: "agent", agentId: f.run.agentId, text: content.text }),
    expect.objectContaining({
      kind: "run",
      accountId: "account",
      runId: "run",
      untrustedInput: true,
      execution: { conversationId: "conversation", ownerId: "worker", fence: 7 },
    }),
    expect.any(String),
  );
  const update = f.tools.prepare({
    type: "toolCall",
    id: "update",
    name: "agent_memory_update",
    arguments: { ...content, id: "memory", expectedRevision: 1 },
  });
  expect(JSON.parse(await f.tools.execute(f.scope, f.run, update, f.signal))).toMatchObject({
    state: "succeeded",
    revision: 2,
  });
  expect(f.get).toHaveBeenCalledWith(f.scope, "memory");
  expect(f.update).toHaveBeenCalledWith(
    f.scope,
    "memory",
    1,
    expect.objectContaining({ agentId: f.run.agentId }),
    expect.objectContaining({ untrustedInput: true }),
  );
  expect(f.computerPrepare).not.toHaveBeenCalled();
  expect(f.computerExecute).not.toHaveBeenCalled();
});
it("allows shared memory only with the pinned Agent setting and never updates another Agent", async () => {
  const f = fixture();
  const shared = f.tools.prepare({
    type: "toolCall",
    id: "shared",
    name: "agent_memory_save",
    arguments: { ...content, scope: "space" },
  });
  expect(JSON.parse(await f.tools.execute(f.scope, f.run, shared, f.signal))).toEqual({
    untrusted: true,
    state: "failed",
    code: "MEMORY_SHARING_DISABLED",
  });
  expect(f.create).not.toHaveBeenCalled();
  f.run.allowSharedMemory = true;
  await f.tools.execute(f.scope, f.run, shared, f.signal);
  expect(f.create).toHaveBeenCalledWith(
    f.scope,
    expect.objectContaining({ scope: "space", agentId: null }),
    expect.any(Object),
    expect.any(String),
  );
  f.get.mockResolvedValueOnce({ ...f.document, agentId: "another-agent" as typeof f.run.agentId });
  const update = f.tools.prepare({
    type: "toolCall",
    id: "update",
    name: "agent_memory_update",
    arguments: { ...content, id: "memory", expectedRevision: 1 },
  });
  expect(JSON.parse(await f.tools.execute(f.scope, f.run, update, f.signal))).toEqual({
    untrusted: true,
    state: "failed",
    code: "MEMORY_NOT_FOUND",
  });
  expect(f.update).not.toHaveBeenCalled();
});
it.each(["MEMORY_CONFLICT", "MEMORY_LIMIT", "MEMORY_NOT_FOUND"] as const)(
  "returns a confirmed failure for %s instead of an unknown effect",
  async (code) => {
    const f = fixture();
    f.create.mockRejectedValueOnce(new SpaceMemoryError(code));
    const save = f.tools.prepare({
      type: "toolCall",
      id: "save",
      name: "agent_memory_save",
      arguments: content,
    });
    expect(JSON.parse(await f.tools.execute(f.scope, f.run, save, f.signal))).toEqual({
      untrusted: true,
      state: "failed",
      code,
    });
  },
);
it("refuses secret input both when preparing and immediately before execution, including escaped values", async () => {
  const f = fixture();
  const secret = 'private-credential-with-"quote\\and\nnewline';
  f.secrets.push(secret);
  expect(() =>
    f.tools.prepare({
      type: "toolCall",
      id: "save",
      name: "agent_memory_save",
      arguments: { ...content, text: secret },
    }),
  ).toThrow(ComputerToolsError);
  const save = f.tools.prepare({
    type: "toolCall",
    id: "save",
    name: "agent_memory_save",
    arguments: content,
  });
  f.secrets.push(content.text);
  await expect(f.tools.execute(f.scope, f.run, save, f.signal)).rejects.toMatchObject({
    code: "SECRET_INPUT",
  });
  expect(f.create).not.toHaveBeenCalled();
});
it("preserves Computer dispatch and propagates unexpected persistence failures conservatively", async () => {
  const f = fixture();
  const read = f.tools.prepare({
    type: "toolCall",
    id: "read",
    name: "computer_read_file",
    arguments: { path: "file" },
  });
  expect(await f.tools.execute(f.scope, f.run, read, f.signal)).toBe("computer-result");
  expect(f.computerPrepare).toHaveBeenCalledTimes(1);
  expect(f.computerExecute).toHaveBeenCalledTimes(1);
  f.create.mockRejectedValueOnce(new Error("storage failed"));
  const save = f.tools.prepare({
    type: "toolCall",
    id: "save",
    name: "agent_memory_save",
    arguments: content,
  });
  await expect(f.tools.execute(f.scope, f.run, save, f.signal)).rejects.toThrow("storage failed");
  const controller = new AbortController();
  controller.abort();
  expect(JSON.parse(await f.tools.execute(f.scope, f.run, save, controller.signal))).toEqual({
    untrusted: true,
    state: "cancelled",
  });
});
it("guards memory tool output before it can enter effects or checkpoints", async () => {
  const f = fixture();
  const secret = "private-only-result-id";
  f.secrets.push(secret);
  f.create.mockResolvedValueOnce({ ...f.document, id: spaceMemoryIdSchema.parse(secret) });
  const save = f.tools.prepare({
    type: "toolCall",
    id: "save",
    name: "agent_memory_save",
    arguments: content,
  });
  await expect(f.tools.execute(f.scope, f.run, save, f.signal)).rejects.toMatchObject({
    code: "SECRET_OUTPUT",
  });
  expect(f.create).toHaveBeenCalledTimes(1);
});
it("converts a memory execution fence loss into the runner's lease-loss signal", async () => {
  const f = fixture();
  f.create.mockRejectedValueOnce(new MemoryExecutionFenceError());
  const save = f.tools.prepare({
    type: "toolCall",
    id: "save",
    name: "agent_memory_save",
    arguments: content,
  });
  await expect(f.tools.execute(f.scope, f.run, save, f.signal)).rejects.toBeInstanceOf(
    StaleRunFenceError,
  );
});

it("rejects malformed memory call identities and parser errors before approval preparation", () => {
  const f = fixture();
  for (const id of ["", "x".repeat(129), "bad\0identity"]) {
    expect(() =>
      f.tools.prepare({ type: "toolCall", id, name: "agent_memory_save", arguments: content }),
    ).toThrow("INVALID_ARGUMENTS");
  }
  expect(() =>
    f.tools.prepare({
      type: "toolCall",
      id: "call",
      name: "agent_memory_save",
      arguments: content,
      argumentsError: "truncated JSON",
    }),
  ).toThrow("INVALID_ARGUMENTS");
  expect(f.create).not.toHaveBeenCalled();
});
