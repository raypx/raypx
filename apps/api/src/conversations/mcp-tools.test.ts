import { expect, it, vi } from "vitest";
import { ComputerToolsError, type ComputerTools, type ExecutionRun } from "@raypx/agents/server";
import { runSchema } from "@raypx/core/conversation";
import { spaceIdSchema } from "@raypx/core/spaces";
import type { SpaceScope } from "@raypx/spaces/server";
import { McpTransportError } from "@raypx/providers/mcp";
import type { McpServersService } from "./mcp-servers.js";
import { mcpToolName, withMcpTools } from "./mcp-tools.js";
const at = "2026-11-14T00:00:00.000Z";
const serverId = "00000000-0000-4000-8000-000000000001";
function run(): ExecutionRun {
  return {
    ...runSchema.parse({
      id: "run",
      spaceId: "space",
      conversationId: "conversation",
      agentId: "agent",
      trigger: "message",
      messageId: "message",
      memberAccountId: "owner",
      model: { modelId: "fake" },
      state: "running",
      failureCode: null,
      createdAt: at,
      startedAt: at,
      firstResponseAt: null,
      finishedAt: null,
    }),
    ownerId: "executor",
    fence: 1,
    attemptId: "attempt",
    attemptNumber: 1,
    timeoutAt: "2026-11-14T00:10:00.000Z",
    connectionId: null,
    computerId: null,
    computerGeneration: null,
  };
}
const selected = spaceIdSchema.parse("space");
const scope = {
  spaceId: selected,
  member: { spaceId: selected, accountId: "owner", role: "member", createdAt: at },
} as SpaceScope;
function fixture(readOnly = true) {
  const catalog = [
    {
      serverId,
      fingerprint: "a".repeat(64),
      perCallSecretHeader: null as string | null,
      tools: [{ name: "report", description: "Report", inputSchema: { type: "object" }, readOnly }],
    },
  ];
  const service = {
    catalog: vi.fn(async () => catalog),
    checkPinned: vi.fn(async () => {}),
    protectedValues: () => [],
    call: vi.fn(async () => ({ content: "outside text", isError: false, truncated: false })),
    release: vi.fn(),
  };
  const base: ComputerTools = {
    definitions: () => [],
    prepare() {
      throw new ComputerToolsError("INVALID_TOOL");
    },
    async execute() {
      throw new Error("Unexpected builtin");
    },
    async cancel() {},
    release() {},
  };
  const tools = withMcpTools(base, service as unknown as McpServersService);
  return { service, base, tools, catalog };
}
it("namespaces tool names, records every call as an effect and labels results untrusted", async () => {
  const f = fixture();
  const current = run();
  await f.tools.initialize?.(scope, current, new AbortController().signal);
  const name = mcpToolName(serverId, "report");
  expect(name).toBe("mcp_00000000000040008000000000000001__report");
  expect(f.tools.definitions(current)[0]?.name).toBe(name);
  const prepared = f.tools.prepare({ type: "toolCall", id: "call", name, arguments: {} }, current);
  expect(prepared).toMatchObject({
    changes: true,
    readOnlyAnnotated: true,
    target: `server:${serverId}`,
  });
  expect(
    JSON.parse(await f.tools.execute(scope, current, prepared, new AbortController().signal)),
  ).toMatchObject({ source: "remote", untrusted: true, state: "succeeded" });
  expect(prepared.argumentSummary).not.toContain("outside text");
});
it("restores the frozen catalog without relisting and rechecks pinned access", async () => {
  const f = fixture();
  const current = run();
  await f.tools.initialize?.(scope, current, new AbortController().signal);
  const snapshot = f.tools.snapshot?.(current);
  const restored = withMcpTools(f.base, f.service as unknown as McpServersService);
  restored.restore?.(current, structuredClone(snapshot));
  await restored.initialize?.(scope, current, new AbortController().signal);
  expect(f.service.catalog).toHaveBeenCalledTimes(1);
  expect(f.service.checkPinned).toHaveBeenCalledWith(scope, current.agentId, f.catalog, current.id);
  expect(restored.definitions(current)).toEqual(f.tools.definitions(current));
});
it("throws lost-response errors so the effect engine retains an unknown outcome", async () => {
  const f = fixture(false);
  const current = run();
  await f.tools.initialize?.(scope, current, new AbortController().signal);
  f.service.call.mockRejectedValue(new McpTransportError("TIMED_OUT"));
  const prepared = f.tools.prepare(
    { type: "toolCall", id: "call", name: mcpToolName(serverId, "report"), arguments: {} },
    current,
  );
  await expect(
    f.tools.execute(scope, current, prepared, new AbortController().signal),
  ).rejects.toMatchObject({ code: "TIMED_OUT" });
  expect(prepared.readOnlyAnnotated).toBe(false);
});
it("rejects credential echoes in schemas and results before they enter model history", async () => {
  const f = fixture();
  const credential = 'secret-"-\\-token';
  const tools = withMcpTools(f.base, f.service as unknown as McpServersService, () => [credential]);
  f.catalog[0]!.tools[0]!.description = credential;
  await expect(
    tools.initialize?.(scope, run(), new AbortController().signal),
  ).rejects.toMatchObject({ code: "SECRET_OUTPUT" });
  f.catalog[0]!.tools[0]!.description = "Report";
  const current = run();
  await tools.initialize?.(scope, current, new AbortController().signal);
  f.service.call.mockResolvedValue({ content: credential, isError: false, truncated: false });
  const call = tools.prepare(
    { type: "toolCall", id: "call", name: mcpToolName(serverId, "report"), arguments: {} },
    current,
  );
  await expect(
    tools.execute(scope, current, call, new AbortController().signal),
  ).rejects.toMatchObject({ code: "SECRET_OUTPUT" });
});

it("requires a declared exact header and delivers it outside arguments and frozen catalogs", async () => {
  const f = fixture();
  const current = run();
  const signal = new AbortController().signal;
  f.catalog[0]!.perCallSecretHeader = "x-call-key";
  await f.tools.initialize?.(scope, current, signal);
  const args = {
    protectedInput: {
      name: "Remote credential",
      purpose: "Authenticate once",
      destination: { kind: "mcp-header", name: "x-call-key" },
    },
  };
  const name = mcpToolName(serverId, "report");
  const prepared = f.tools.prepare(
    { type: "toolCall", id: "single", name, arguments: args },
    current,
  );
  expect(() =>
    f.tools.prepare(
      {
        type: "toolCall",
        id: "bad",
        name,
        arguments: {
          protectedInput: {
            ...args.protectedInput,
            destination: { kind: "mcp-header", name: "other" },
          },
        },
      },
      current,
    ),
  ).toThrow("INVALID_ARGUMENTS");
  await expect(f.tools.execute(scope, current, prepared, signal)).rejects.toMatchObject({
    code: "INVALID_ARGUMENTS",
  });
  const value = crypto.randomUUID();
  await f.tools.executeProtected!(scope, current, prepared, signal, value);
  expect(f.service.call).toHaveBeenCalledWith(
    scope,
    current.agentId,
    current.id,
    expect.anything(),
    "report",
    {},
    signal,
    { name: "x-call-key", value },
  );
  expect(JSON.stringify([prepared, f.tools.snapshot?.(current)]).includes(value)).toBe(false);
});
