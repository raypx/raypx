import { protectedInputParts, type ProtectedInputSpec } from "@raypx/core/protected-input";
import { createOpenApiServers } from "../../../src/conversations/openapi-servers.js";
import { createOpenApiServersRepository } from "../../../src/conversations/openapi-postgres.js";
import { withOpenApiTools, openApiToolName } from "../../../src/conversations/openapi-tools.js";
import { createOpenApiTransport } from "@raypx/providers/openapi";
import { createMcpServers } from "../../../src/conversations/mcp-servers.js";
import { createMcpServersRepository } from "../../../src/conversations/mcp-postgres.js";
import { withMcpTools, mcpToolName } from "../../../src/conversations/mcp-tools.js";
import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { connectDatabase, migrateDatabase } from "@raypx/database";
import {
  user,
  spaceMembers,
  spaces,
  protectedInputRequests,
  conversationEvents,
  conversationRunCheckpoints,
  conversationEffects,
  conversationToolCalls,
  conversationRuns,
} from "@raypx/database/schema";
import {
  ConversationRunner,
  createApprovalsService,
  createComputerTools,
  ProtectedInputError,
  StaleRunFenceError,
  type ExecutionRun,
  type PreparedComputerCall,
} from "@raypx/agents/server";
import {
  createAgentsRepository,
  createConversationsRepository,
  createApprovalsRepository,
  createProtectedInputsService,
} from "@raypx/agents/server/postgres";
import { createComputersService } from "@raypx/computers/server";
import { createComputersRepository } from "@raypx/computers/server/postgres";
import { createMemoryComputerProvider, type ComputerProvider } from "@raypx/providers/computer";
import { createSpaceAccess } from "@raypx/spaces/server/postgres";
import type { SpaceScope } from "@raypx/spaces/server";
import { createApiClient } from "@raypx/client/api";
import { createApiApp } from "../../helpers/app.js";
import { modelFixture } from "../../helpers/model.js";
import { createDockerComputerProvider } from "@raypx/providers/computer/docker";
import { createApiLogging } from "../../../src/logging.js";
import {
  applicationSecretKeyProvider,
  sealStoredSecret,
  openStoredSecret,
} from "../../../src/conversations/secrets.js";

const url = process.env.TEST_DATABASE_URL;
if (!url || !/_test(?:_[a-z0-9]+)?$/.test(new URL(url).pathname))
  throw new Error("A disposable *_test database is required");
const connection = connectDatabase(url);
const access = createSpaceAccess(connection.db);
const repository = createConversationsRepository(connection.db);
const approvals = createApprovalsService(createApprovalsRepository(connection.db), {
  pollIntervalMs: 5,
});
const keys = applicationSecretKeyProvider("protected-input-test-key-".repeat(2));
let clock = new Date();
function service() {
  return createProtectedInputsService(
    connection.db,
    {
      seal: (binding, value) => sealStoredSecret(keys, "protected-input", binding, value),
      open: (binding, sealed) => openStoredSecret(keys, "protected-input", binding, sealed),
    },
    { now: () => clock, pollMs: 5, ttlMs: 60_000 },
  );
}
let inputs = service();
let dispatched = 0;
const memory = createMemoryComputerProvider();
const provider: ComputerProvider = {
  ...memory,
  describe: async () => ({ ...(await memory.describe()), screen: false }),
  async execute(_ref, request) {
    dispatched++;
    const bytes = Buffer.from(
      request.stdin ?? request.environment.PROTECTED_TOKEN ?? "missing",
    ).toString("base64");
    return {
      id: "protected-fixture",
      cancel: async () => {},
      events: (async function* () {
        // Split the exact value across provider chunks to catch per-chunk redaction.
        const value = Buffer.from(bytes, "base64").toString();
        const raw = Buffer.from(
          [
            value,
            Buffer.from(value).toString("base64"),
            Buffer.from(value).toString("base64url"),
            Buffer.from(value).toString("hex"),
            encodeURIComponent(value),
          ].join(" "),
        );
        yield { kind: "stdout" as const, bytes: raw.subarray(0, 4).toString("base64") };
        yield { kind: "stdout" as const, bytes: raw.subarray(4).toString("base64") };
        yield { kind: "exit" as const, status: 0, truncated: false, cancelled: false };
      })(),
    };
  },
};
const computers = createComputersService(createComputersRepository(connection.db), provider);
const tools = createComputerTools(computers, provider, [], repository.pinResources);
let operationTools = tools;
const model = modelFixture();
const logs: string[] = [];
const apiLogger = createApiLogging({
  environment: "test",
  sink: async ({ event }) => {
    logs.push(JSON.stringify(event));
  },
});
function executor() {
  return new ConversationRunner(repository, model.models, (code) => logs.push(code), undefined, {
    tools: operationTools,
    approvals,
    protectedInputs: inputs,
  });
}
let runner = executor();
const owner = `protected-owner-${crypto.randomUUID()}`,
  member = `protected-member-${crypto.randomUUID()}`;
let scope: SpaceScope, other: SpaceScope, foreign: SpaceScope, run: ExecutionRun;
let conversationId: ExecutionRun["conversationId"];
const owned: string[] = [];

it.skipIf(process.env.RAYPX_TEST_PROTECTED_DOCKER !== "1").each(["environment", "stdin"] as const)(
  "delivers and scrubs protected %s through the real sandbox supervisor",
  async (destination) => {
    const engineProvider = createDockerComputerProvider({
      url: process.env.SANDBOX_SUPERVISOR_URL!,
      token: process.env.SANDBOX_SUPERVISOR_TOKEN!,
    });
    const created = await access.create(owner, { name: "Protected Engine acceptance" });
    owned.push(created.space.id);
    const selected = await access.resolve(owner, created.space.id);
    const lifecycle = createComputersService(
      createComputersRepository(connection.db),
      engineProvider,
    );
    const engineTools = createComputerTools(lifecycle, engineProvider, [], repository.pinResources);
    const { conversation } = await createAgentsRepository(connection.db).create(selected, {
      name: "Engine Agent",
      instructions: "One protected command",
      model: { modelId: "fixture" },
    });
    await repository.send(selected, conversation.id, {
      text: "Authenticate once",
      idempotencyKey: crypto.randomUUID(),
    });
    const execution = (await repository.claimNext(selected, conversation.id, {
      ownerId: "protected-engine",
      leaseMs: 60_000,
      timeoutMs: 300_000,
      backupMarginMs: 30_000,
    }))!.run;
    const secret = `protected-engine-${crypto.randomUUID()}`;
    const prepared = engineTools.prepare({
      type: "toolCall",
      id: "engine-command",
      name: "computer_run_command",
      arguments: {
        executable: "/bin/sh",
        argv: [
          "-c",
          destination === "stdin"
            ? 'value=$(cat); printf "%s" "$value"; printf "%s" "$value" >&2'
            : 'printf "%s" "$PROTECTED_TOKEN"; printf "%s" "$PROTECTED_TOKEN" >&2',
        ],
        cwd: ".",
        protectedInput: {
          ...call.protectedInput!,
          destination:
            destination === "stdin"
              ? { kind: "stdin" }
              : { kind: "environment", variable: "PROTECTED_TOKEN" },
        },
      },
    });
    const signal = new AbortController().signal;
    try {
      const authorized = approvals.authorize(selected, execution, prepared, signal);
      await expect.poll(async () => (await approvals.listPending(selected)).length).toBe(1);
      await approvals.answer(selected, (await approvals.listPending(selected))[0]!.id, {
        decision: "approved",
      });
      expect(await authorized).toBe("approved");
      const waiting = inputs.wait(selected, execution, prepared, signal);
      await expect.poll(async () => (await inputs.pending(selected)).length).toBe(1);
      await inputs.answer(selected, (await inputs.pending(selected))[0]!.id, {
        decision: "answer",
        value: secret,
      });
      await waiting;
      const result = await approvals.executeEffect(
        selected,
        execution,
        prepared,
        () =>
          inputs.consume(selected, execution, prepared, (value) =>
            engineTools.executeProtected!(selected, execution, prepared, signal, value),
          ),
        signal,
      );
      expect(JSON.parse(result).state).toBe("succeeded");
      expect(result).toContain("[protected]");
      const effects = await approvals.listEffects(selected, execution.id);
      expect(effects).toHaveLength(1);
      expect(JSON.stringify(effects).includes(secret)).toBe(false);
    } finally {
      const state = await lifecycle.get(selected);
      if (state.status === "available" && state.computer)
        await engineProvider.destroy({
          id: state.computer.id,
          generation: state.computer.generation,
        });
      engineTools.release(execution);
    }
  },
);
const call: PreparedComputerCall = {
  id: "protected-command",
  name: "computer_run_command",
  arguments: {
    executable: "echo",
    argv: [],
    cwd: ".",
    protectedInput: {
      name: "Access token",
      purpose: "Authenticate this operation",
      destination: { kind: "environment", variable: "PROTECTED_TOKEN" },
    },
  },
  argumentSummary: "Run echo",
  target: ".",
  executable: "echo",
  changes: true,
  protectedInput: {
    name: "Access token",
    purpose: "Authenticate this operation",
    destination: { kind: "environment", variable: "PROTECTED_TOKEN" },
  },
};
function client(accountId: string, origin = "https://web.example.test") {
  const app = createApiApp({
    logger: apiLogger,
    spaces: access,
    protectedInputs: inputs,
    allowedOrigins: ["https://web.example.test"],
    readSession: async () => ({
      user: {
        id: accountId,
        name: "Member",
        email: `${accountId}@example.test`,
        emailVerified: true,
        role: "admin",
      },
      session: {
        id: `session-${accountId}`,
        userId: accountId,
        expiresAt: new Date(Date.now() + 60_000),
      },
    }),
  });
  return createApiClient({
    baseUrl: "https://api.example.test",
    headers: { origin },
    fetch: async (input, init) => app.fetch(new Request(input, init)),
  });
}
beforeAll(async () => {
  await migrateDatabase(url);
  await connection.db.insert(user).values(
    [owner, member].map((id) => ({
      id,
      name: "Member",
      email: `${id}@example.test`,
      emailVerified: true,
    })),
  );
  const first = await access.create(owner, { name: "Protected acceptance" }),
    second = await access.create(owner, { name: "Foreign" });
  owned.push(first.space.id, second.space.id);
  await connection.db
    .insert(spaceMembers)
    .values({ spaceId: first.space.id, accountId: member, role: "member" });
  scope = await access.resolve(owner, first.space.id);
  other = await access.resolve(member, first.space.id);
  foreign = await access.resolve(owner, second.space.id);
});
beforeEach(async () => {
  operationTools = tools;
  clock = new Date();
  const created = await createAgentsRepository(connection.db).create(scope, {
    name: "Protected Agent",
    instructions: "Use protected input",
    model: { modelId: "fixture" },
  });
  conversationId = created.conversation.id;
  await repository.send(scope, conversationId, {
    text: "Authenticate",
    idempotencyKey: crypto.randomUUID(),
  });
  run = (await repository.claimNext(scope, conversationId, {
    ownerId: "protected-test",
    leaseMs: 60_000,
    timeoutMs: 300_000,
    backupMarginMs: 30_000,
  }))!.run;
});
afterAll(async () => {
  await runner.close();
  await apiLogger.close();
  for (const id of owned) await connection.db.delete(spaces).where(eq(spaces.id, id));
  await connection.db.delete(user).where(eq(user.id, owner));
  await connection.db.delete(user).where(eq(user.id, member));
  await connection.close();
});
async function pendingWait() {
  const controller = new AbortController();
  const waiting = inputs.wait(scope, run, call, controller.signal);
  await expect
    .poll(async () => (await inputs.pending(scope)).find((r) => r.runId === run.id)?.state)
    .toBe("pending");
  const request = (await inputs.pending(scope)).find((r) => r.runId === run.id)!;
  return { controller, waiting, request };
}
it("encrypts answers, authorizes only the initiating current member, consumes once and scrubs all durable surfaces", async () => {
  const secret = `protected-${crypto.randomUUID()}-中文\n"value`;
  const { waiting, request } = await pendingWait();
  const before = dispatched;
  expect(
    (await client(member).protectedInputs.pending({ spaceId: scope.spaceId })).some(
      (r) => r.id === request.id,
    ),
  ).toBe(false);
  await expect(
    client(member).protectedInputs.answer({
      spaceId: scope.spaceId,
      requestId: request.id,
      answer: { decision: "answer", value: secret },
    }),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(
    client(owner).protectedInputs.answer({
      spaceId: foreign.spaceId,
      requestId: request.id,
      answer: { decision: "answer", value: secret },
    }),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(
    client(owner, "https://untrusted.invalid").protectedInputs.answer({
      spaceId: scope.spaceId,
      requestId: request.id,
      answer: { decision: "answer", value: secret },
    }),
  ).rejects.toBeDefined();
  const answered = await client(owner).protectedInputs.answer({
    spaceId: scope.spaceId,
    requestId: request.id,
    answer: { decision: "answer", value: secret },
  });
  expect(answered.state).toBe("answered");
  expect(JSON.stringify(answered).includes(secret)).toBe(false);
  expect(await waiting).toBe("answered");
  expect(dispatched).toBe(before);
  const [sealed] = await connection.db
    .select()
    .from(protectedInputRequests)
    .where(eq(protectedInputRequests.id, request.id));
  expect(Boolean(sealed?.ciphertext)).toBe(true);
  expect(JSON.stringify(sealed).includes(secret)).toBe(false);
  await expect(inputs.answer(scope, request.id, { decision: "decline" })).rejects.toBeInstanceOf(
    ProtectedInputError,
  );
  const result = await inputs.consume(scope, run, call, (value) =>
    tools.executeProtected!(scope, run, call, new AbortController().signal, value),
  );
  expect(result).toContain("[protected]");
  expect(result.includes(secret)).toBe(false);
  let secondDispatch = false;
  await inputs.consume(scope, run, call, async () => {
    secondDispatch = true;
    return "bad";
  });
  expect(secondDispatch).toBe(false);
  const [consumed] = await connection.db
    .select()
    .from(protectedInputRequests)
    .where(eq(protectedInputRequests.id, request.id));
  expect(consumed).toMatchObject({
    state: "consumed",
    ciphertext: null,
    wrappedDataKey: null,
    keyId: null,
  });
  await apiLogger.flush();
  const leakSurfaces = [
    await connection.db
      .select()
      .from(conversationEvents)
      .where(eq(conversationEvents.spaceId, scope.spaceId)),
    await connection.db
      .select()
      .from(conversationRunCheckpoints)
      .where(eq(conversationRunCheckpoints.spaceId, scope.spaceId)),
    await connection.db
      .select()
      .from(conversationEffects)
      .where(eq(conversationEffects.spaceId, scope.spaceId)),
    await connection.db
      .select()
      .from(conversationToolCalls)
      .where(eq(conversationToolCalls.spaceId, scope.spaceId)),
    logs,
    model.calls.map((c) => c.input),
  ];
  expect(leakSurfaces.every((surface) => !JSON.stringify(surface).includes(secret))).toBe(true);
});
it.each([false, true])(
  "expires and erases pending or answered input (answered=%s)",
  async (answered) => {
    const { controller, waiting, request } = await pendingWait();
    if (answered) {
      await inputs.answer(scope, request.id, { decision: "answer", value: crypto.randomUUID() });
      await waiting;
    }
    clock = new Date(clock.getTime() + 60_001);
    await inputs.cleanup();
    expect(await waiting).toBe(answered ? "answered" : "expired");
    controller.abort();
    const [row] = await connection.db
      .select()
      .from(protectedInputRequests)
      .where(eq(protectedInputRequests.id, request.id));
    expect(row).toMatchObject({ state: "expired", ciphertext: null, wrappedDataKey: null });
    await expect(inputs.answer(scope, request.id, { decision: "decline" })).rejects.toMatchObject({
      code: "EXPIRED",
    });
  },
);
it("declines without execution and refreshes provenance after untrusted steering", async () => {
  const { waiting, request } = await pendingWait();
  await connection.db
    .update(conversationRuns)
    .set({ untrustedInput: true })
    .where(and(eq(conversationRuns.spaceId, scope.spaceId), eq(conversationRuns.id, run.id)));
  expect((await inputs.pending(scope)).find((r) => r.id === request.id)?.untrustedInput).toBe(true);
  await inputs.answer(scope, request.id, { decision: "decline" });
  expect(await waiting).toBe("declined");
});
it("removes answered ciphertext on Stop and rejects stale attempt consumption", async () => {
  const { waiting, request } = await pendingWait();
  await inputs.answer(scope, request.id, { decision: "answer", value: crypto.randomUUID() });
  await waiting;
  await runner.conversations.stop(scope, conversationId, run.id);
  const [row] = await connection.db
    .select()
    .from(protectedInputRequests)
    .where(eq(protectedInputRequests.id, request.id));
  expect(row).toMatchObject({ state: "cancelled", ciphertext: null, wrappedDataKey: null });
  await expect(inputs.consume(scope, run, call, async () => "bad")).rejects.toBeInstanceOf(
    StaleRunFenceError,
  );
});
it("recovers the same request after service restart and refuses changed operation bindings", async () => {
  const { controller, waiting, request } = await pendingWait();
  controller.abort("handover");
  await waiting;
  inputs = service();
  const resumed = inputs.wait(scope, run, call, new AbortController().signal);
  expect((await inputs.pending(scope)).filter((r) => r.runId === run.id).map((r) => r.id)).toEqual([
    request.id,
  ]);
  await inputs.answer(scope, request.id, { decision: "answer", value: crypto.randomUUID() });
  expect(await resumed).toBe("answered");
  await expect(
    inputs.consume(
      scope,
      run,
      { ...call, arguments: { ...call.arguments, cwd: "other" } },
      async () => "bad",
    ),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
  const output = await inputs.consume(scope, run, call, async (value) => value);
  expect(output).toBe("[protected]");
});
it("checks fresh membership even for a previously resolved scope", async () => {
  const { waiting, request } = await pendingWait();
  await connection.db
    .update(spaceMembers)
    .set({ removedAt: new Date() })
    .where(and(eq(spaceMembers.spaceId, scope.spaceId), eq(spaceMembers.accountId, member)));
  await expect(inputs.answer(other, request.id, { decision: "decline" })).rejects.toBeDefined();
  await connection.db
    .update(spaceMembers)
    .set({ removedAt: null })
    .where(and(eq(spaceMembers.spaceId, scope.spaceId), eq(spaceMembers.accountId, member)));
  await inputs.answer(scope, request.id, { decision: "decline" });
  await waiting;
});

it.each(["environment", "stdin", "bearer", "header", "query", "basic", "mcp"] as const)(
  "recovers protected %s once with API authorization and sweeps every durable/model/log surface",
  async (kind) => {
    const secret =
      kind === "basic"
        ? `member-${crypto.randomUUID()}:password-${crypto.randomUUID()}`
        : `protected-run-${crypto.randomUUID()} /+中文`;
    const signal = new AbortController().signal;
    const destinations: Record<typeof kind, ProtectedInputSpec["destination"]> = {
      environment: { kind: "environment", variable: "PROTECTED_TOKEN" },
      stdin: { kind: "stdin" },
      bearer: { kind: "http-bearer" },
      header: { kind: "http-api-key", in: "header", name: "x-call-key" },
      query: { kind: "http-api-key", in: "query", name: "api_key" },
      basic: { kind: "http-basic" },
      mcp: { kind: "mcp-header", name: "x-call-key" },
    };
    const input = {
      name: "Credential",
      purpose: "Authenticate once",
      destination: destinations[kind],
    };
    let name: string = "computer_run_command";
    let args: Record<string, unknown> = {
      executable: "echo",
      argv: [],
      cwd: ".",
      protectedInput: input,
    };
    let received: string | undefined;
    const echo = (value: string) =>
      [
        value,
        Buffer.from(value).toString("base64"),
        Buffer.from(value).toString("base64url"),
        Buffer.from(value).toString("hex"),
        encodeURIComponent(value),
      ].join(" ");
    if (["bearer", "header", "query", "basic"].includes(kind)) {
      const http = createOpenApiServers(
        createOpenApiServersRepository(connection.db),
        keys,
        createOpenApiTransport({
          request: async (endpoint, _method, headers) => {
            dispatched++;
            const authorization = headers.authorization;
            const supplied =
              headers["x-call-key"] ??
              endpoint.url.searchParams.get("api_key") ??
              (authorization?.startsWith("Basic ")
                ? Buffer.from(authorization.slice(6), "base64").toString()
                : authorization?.replace(/^Bearer /, ""));
            received = supplied ?? undefined;
            return { status: 200, headers: new Headers(), body: echo(supplied!) };
          },
        }),
      );
      const server = await http.create(
        scope,
        {
          name: "Single call",
          url: "http://127.0.0.1:12345",
          selectedOperationIds: ["authenticate"],
          availability: { mode: "all" },
        },
        {
          document: JSON.stringify({
            openapi: "3.1.0",
            paths: { "/authenticate": { post: { operationId: "authenticate" } } },
          }),
        },
      );
      operationTools = withOpenApiTools(tools, http);
      name = openApiToolName(server.id, "authenticate");
      args = { protectedInput: input };
    } else if (kind === "mcp") {
      const mcp = createMcpServers(createMcpServersRepository(connection.db), keys, {
        validate() {},
        async listTools() {
          return [
            {
              name: "authenticate",
              description: "Authenticate",
              readOnly: false,
              inputSchema: { type: "object" },
            },
          ];
        },
        async callTool(mcpConnection) {
          dispatched++;
          const supplied = mcpConnection.headers["x-call-key"]!;
          received = supplied ?? undefined;
          return { content: echo(supplied), isError: false, truncated: false };
        },
      });
      const server = await mcp.create(owner, {
        name: "Single call",
        transport: "http",
        url: "http://127.0.0.1:12345/mcp",
        perCallSecretHeader: "x-call-key",
        availability: { mode: "all" },
      });
      await mcp.setEnabled(scope, run.agentId, [server.id]);
      operationTools = withMcpTools(tools, mcp);
      name = mcpToolName(server.id, "authenticate");
      args = { protectedInput: input };
    }
    await operationTools.initialize?.(scope, run, signal);
    const selectedCall = operationTools.prepare(
      {
        type: "toolCall",
        id: "destination-call",
        name,
        arguments: args as import("@raypx/ai").ToolCall["arguments"],
      },
      run,
    );
    await runner.close();
    runner = executor();
    await repository.release(scope, run);
    const index = model.calls.length;
    runner.dispatch(scope, conversationId);
    await expect.poll(() => model.calls.length).toBe(index + 1);
    model.calls[index]!.toolCalls([
      {
        type: "toolCall",
        id: selectedCall.id,
        name: selectedCall.name,
        arguments: selectedCall.arguments as import("@raypx/ai").ToolCall["arguments"],
      },
    ]);
    await expect
      .poll(async () => (await approvals.listPending(scope)).find((r) => r.runId === run.id)?.state)
      .toBe("pending");
    // A protected request cannot skip normal tool approval.
    expect((await inputs.pending(scope)).some((r) => r.runId === run.id)).toBe(false);
    const approval = (await approvals.listPending(scope)).find((r) => r.runId === run.id)!;
    await approvals.answer(scope, approval.id, { decision: "approved" });
    await expect
      .poll(async () => (await inputs.pending(scope)).find((r) => r.runId === run.id)?.state)
      .toBe("pending");
    const request = (await inputs.pending(scope)).find((r) => r.runId === run.id)!;
    await runner.close();
    inputs = service();
    // Answer while the executor is gone, then recover from the durable pending call.
    await expect(
      client(member).protectedInputs.answer({
        spaceId: scope.spaceId,
        requestId: request.id,
        answer: { decision: "answer", value: secret },
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await client(owner).protectedInputs.answer({
      spaceId: scope.spaceId,
      requestId: request.id,
      answer: { decision: "answer", value: secret },
    });
    const before = dispatched;
    runner = executor();
    runner.dispatch(scope, conversationId);
    await expect.poll(() => model.calls.length).toBe(index + 2);
    expect(dispatched - before).toBe(1);
    expect(["environment", "stdin"].includes(kind) || received === secret).toBe(true);
    const transcript = JSON.stringify(model.calls[index + 1]!.input);
    expect(transcript.includes(secret)).toBe(false);
    expect(transcript).toContain("[protected]");
    model.calls[index + 1]!.complete("Operation complete");
    await expect
      .poll(async () => (await repository.getRun(scope, conversationId, run.id)).state)
      .toBe("succeeded");
    const surfaces = {
      events: await connection.db
        .select()
        .from(conversationEvents)
        .where(eq(conversationEvents.runId, run.id)),
      checkpoints: await connection.db
        .select()
        .from(conversationRunCheckpoints)
        .where(eq(conversationRunCheckpoints.runId, run.id)),
      activity: await connection.db
        .select()
        .from(conversationToolCalls)
        .where(eq(conversationToolCalls.runId, run.id)),
      effects: await connection.db
        .select()
        .from(conversationEffects)
        .where(eq(conversationEffects.runId, run.id)),
      logs,
      transcript: model.calls.map((c) => c.input),
    };
    expect(surfaces.effects).toHaveLength(1);
    expect(surfaces.checkpoints).toHaveLength(1);
    expect(surfaces.activity).toHaveLength(1);
    for (const value of protectedInputParts(secret, input)) {
      const variants = [
        value,
        Buffer.from(value).toString("base64"),
        Buffer.from(value).toString("base64url"),
        Buffer.from(value).toString("hex"),
        encodeURIComponent(value),
      ];
      for (const surface of Object.values(surfaces))
        for (const variant of variants)
          expect(JSON.stringify(surface).includes(variant)).toBe(false);
    }
  },
);
