import { expect, it, vi } from "vitest";
import { ComputerToolsError, type ComputerTools, type ExecutionRun } from "@raypx/agents/server";
import { runSchema } from "@raypx/core/conversation";
import { spaceIdSchema } from "@raypx/core/spaces";
import type { SpaceScope } from "@raypx/spaces/server";
import { OpenApiTransportError } from "@raypx/providers/openapi";
import type { OpenApiServersService } from "./openapi-servers.js";
import { openApiToolName, withOpenApiTools } from "./openapi-tools.js";
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
      url: "https://api.example.test",
      tools: [
        {
          operationId: "report",
          label: "Report",
          method: "GET" as const,
          path: "/items",
          parameters: [],
          bodySchema: null,
          bodyRequired: false,
          inputSchema: { type: "object" },
          readOnly,
        },
      ],
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
  const tools = withOpenApiTools(base, service as unknown as OpenApiServersService);
  return { service, base, tools, catalog };
}
it("namespaces tool names, records every call as an effect and labels results untrusted", async () => {
  const f = fixture();
  const current = run();
  await f.tools.initialize?.(scope, current, new AbortController().signal);
  const name = openApiToolName(serverId, "report");
  expect(name).toBe("openapi_00000000000040008000000000000001__report");
  expect(f.tools.definitions(current)[0]?.name).toBe(name);
  const prepared = f.tools.prepare({ type: "toolCall", id: "call", name, arguments: {} }, current);
  expect(prepared).toMatchObject({
    changes: true,
    readOnlyHttp: true,
    target: "GET https://api.example.test/items",
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
  const restored = withOpenApiTools(f.base, f.service as unknown as OpenApiServersService);
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
  f.service.call.mockRejectedValue(new OpenApiTransportError("TIMED_OUT"));
  const prepared = f.tools.prepare(
    { type: "toolCall", id: "call", name: openApiToolName(serverId, "report"), arguments: {} },
    current,
  );
  await expect(
    f.tools.execute(scope, current, prepared, new AbortController().signal),
  ).rejects.toMatchObject({ code: "TIMED_OUT" });
  expect(prepared.readOnlyHttp).toBe(false);
});
it("rejects credential echoes in schemas and results before they enter model history", async () => {
  const f = fixture();
  const credential = 'secret-"-\\-token';
  const tools = withOpenApiTools(f.base, f.service as unknown as OpenApiServersService, () => [
    credential,
  ]);
  f.catalog[0]!.tools[0]!.label = credential;
  await expect(
    tools.initialize?.(scope, run(), new AbortController().signal),
  ).rejects.toMatchObject({ code: "SECRET_OUTPUT" });
  f.catalog[0]!.tools[0]!.label = "Report";
  const current = run();
  await tools.initialize?.(scope, current, new AbortController().signal);
  f.service.call.mockResolvedValue({ content: credential, isError: false, truncated: false });
  const call = tools.prepare(
    { type: "toolCall", id: "call", name: openApiToolName(serverId, "report"), arguments: {} },
    current,
  );
  await expect(
    tools.execute(scope, current, call, new AbortController().signal),
  ).rejects.toMatchObject({ code: "SECRET_OUTPUT" });
});

it("rejects invalid arguments before approval/effect creation", async () => {
  const f = fixture();
  f.catalog[0]!.tools[0]!.inputSchema = { type: "object", additionalProperties: false } as never;
  const current = run();
  await f.tools.initialize?.(scope, current, new AbortController().signal);
  expect(() =>
    f.tools.prepare(
      {
        type: "toolCall",
        id: "invalid",
        name: openApiToolName(serverId, "report"),
        arguments: { headers: { authorization: "model supplied" } },
      },
      current,
    ),
  ).toThrow("INVALID_ARGUMENTS");
  expect(f.service.call).not.toHaveBeenCalled();
});

it("keeps one-call credentials outside prepared arguments and checkpoint catalogs", async () => {
  const f = fixture();
  const current = run();
  const signal = new AbortController().signal;
  await f.tools.initialize?.(scope, current, signal);
  const name = openApiToolName(serverId, "report");
  const input = {
    name: "Access token",
    purpose: "Authenticate once",
    destination: { kind: "http-bearer" },
  };
  const prepared = f.tools.prepare(
    { type: "toolCall", id: "protected", name, arguments: { protectedInput: input } },
    current,
  );
  const value = crypto.randomUUID();
  await expect(f.tools.execute(scope, current, prepared, signal)).rejects.toMatchObject({
    code: "INVALID_ARGUMENTS",
  });
  await f.tools.executeProtected!(scope, current, prepared, signal, value);
  expect(f.service.call).toHaveBeenCalledWith(
    scope,
    current.agentId,
    current.id,
    expect.anything(),
    "report",
    {},
    signal,
    { type: "bearer", value },
  );
  expect(JSON.stringify([prepared, f.tools.snapshot?.(current)]).includes(value)).toBe(false);
});

it.each([
  [
    { kind: "http-api-key", in: "header", name: "x-access-key" },
    { type: "apiKey", header: "x-access-key" },
  ],
  [
    { kind: "http-api-key", in: "query", name: "api_key" },
    { type: "query", name: "api_key" },
  ],
  [{ kind: "http-basic" }, { type: "basic" }],
])(
  "delivers one-call credentials only through the private override (%j)",
  async (destination, expected) => {
    const f = fixture();
    const current = run();
    const signal = new AbortController().signal;
    await f.tools.initialize?.(scope, current, signal);
    const prepared = f.tools.prepare(
      {
        type: "toolCall",
        id: "single",
        name: openApiToolName(serverId, "report"),
        arguments: {
          protectedInput: { name: "Credential", purpose: "Authenticate once", destination },
        },
      },
      current,
    );
    const value = `user:${crypto.randomUUID()}`;
    await f.tools.executeProtected!(scope, current, prepared, signal, value);
    expect(f.service.call).toHaveBeenLastCalledWith(
      scope,
      current.agentId,
      current.id,
      expect.anything(),
      "report",
      {},
      signal,
      { ...expected, value },
    );
    expect(JSON.stringify([prepared, f.tools.snapshot?.(current)]).includes(value)).toBe(false);
  },
);
