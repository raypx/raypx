import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  approvalRequestSchema,
  type ApprovalRequest,
  type RevisionedApprovalSettings,
  type Effect,
} from "@raypx/core/approvals";
import { runSchema } from "@raypx/core/conversation";
import type { ExecutionRun } from "./conversations.js";
import type { SpaceScope } from "@raypx/spaces/server";
import {
  createApprovalsService,
  ApprovalOperationError,
  ApprovalSettingsConflictError,
  EffectUnknownError,
  type ApprovalCall,
  type ApprovalsRepository,
} from "./approvals.js";
import { computerToolResult } from "./computer-tools.js";
import { EFFECT_INTENT_TIMEOUT_MS, TOOL_DEADLINE_MS } from "./tool-limits.js";

const scope = {
  spaceId: "space",
  member: {
    spaceId: "space",
    accountId: "owner",
    role: "owner",
    createdAt: "2026-01-01T00:00:00Z",
  },
} as SpaceScope;
const other = {
  ...scope,
  member: { ...scope.member, accountId: "other", role: "member" },
} as SpaceScope;
const run: ExecutionRun = {
  ...runSchema.parse({
    id: "run",
    spaceId: scope.spaceId,
    conversationId: "conversation",
    agentId: "agent",
    trigger: "message",
    messageId: "message",
    memberAccountId: "owner",
    model: { modelId: "fixture" },
    state: "running",
    failureCode: null,
    createdAt: "2026-01-01T00:00:00Z",
    startedAt: "2026-01-01T00:00:00Z",
    firstResponseAt: null,
    finishedAt: null,
  }),
  ownerId: "fixture",
  fence: 1,
  attemptId: "attempt",
  attemptNumber: 1,
  timeoutAt: new Date(900_000).toISOString(),
  connectionId: null,
  computerId: null,
  computerGeneration: null,
};
const write: ApprovalCall = {
  id: "write",
  name: "computer_write_file",
  arguments: { path: "note.txt", content: "private file body" },
  argumentSummary: "Write note.txt (17 characters)",
  target: "note.txt",
  changes: true,
};
const command: ApprovalCall = {
  id: "command",
  name: "computer_run_command",
  arguments: { executable: "echo", argv: ["hello"], cwd: "." },
  executable: "echo",
  argumentSummary: "echo (1 argument)",
  target: ".",
  changes: true,
};

function fixture() {
  const requests = new Map<string, ApprovalRequest>();
  const effects = new Map<string, Effect>();
  let settings: RevisionedApprovalSettings | undefined;
  function expireEffects(selected: SpaceScope, runId: string, now: Date) {
    for (const effect of effects.values())
      if (
        effect.spaceId === selected.spaceId &&
        effect.runId === runId &&
        effect.state === "intent" &&
        Date.parse(effect.createdAt) <= now.getTime() - EFFECT_INTENT_TIMEOUT_MS
      )
        effects.set(effect.key, { ...effect, state: "unknown" });
  }
  const resolve = (
    request: ApprovalRequest,
    state: ApprovalRequest["state"],
    now: Date,
    accountId: string | null = null,
  ) => {
    const updated = {
      ...request,
      state,
      resolvedAt: now.toISOString(),
      answeredByAccountId: accountId,
    };
    requests.set(request.id, updated);
    return updated;
  };
  const repository: ApprovalsRepository = {
    async getSettings(_accountId, defaultMode) {
      settings ??= { mode: defaultMode, rules: [], revision: 0 };
      return structuredClone(settings);
    },
    getRunSettings(_scope, accountId, defaultMode) {
      return repository.getSettings(accountId, defaultMode);
    },
    async updateSettings(_accountId, input, expectedRevision, defaultMode) {
      settings ??= { mode: defaultMode, rules: [], revision: 0 };
      if (settings.revision !== expectedRevision)
        throw new ApprovalSettingsConflictError(structuredClone(settings));
      settings = { ...structuredClone(input), revision: expectedRevision + 1 };
      return settings;
    },
    async listPending(selected, now) {
      return [...requests.values()].filter((request) => {
        if (request.state === "pending" && Date.parse(request.expiresAt) <= now.getTime())
          resolve(request, "expired", now);
        return (
          request.spaceId === selected.spaceId &&
          request.memberAccountId === selected.member.accountId &&
          requests.get(request.id)!.state === "pending"
        );
      });
    },
    async createRequest(selected, currentRun, call, expiresAt, createdAt) {
      const request = approvalRequestSchema.parse({
        id: String(requests.size + 1),
        spaceId: selected.spaceId,
        conversationId: currentRun.conversationId,
        runId: currentRun.id,
        memberAccountId: currentRun.memberAccountId,
        toolCallId: call.id,
        toolName: call.name,
        arguments: call.arguments,
        argumentSummary: call.argumentSummary,
        target: call.target,
        state: "pending",
        createdAt: createdAt.toISOString(),
        expiresAt: expiresAt.toISOString(),
        resolvedAt: null,
        answeredByAccountId: null,
      });
      requests.set(request.id, request);
      return request;
    },
    async answer(selected, id, answer, now) {
      const request = requests.get(id);
      if (!request || request.spaceId !== selected.spaceId)
        throw new ApprovalOperationError("NOT_FOUND");
      if (request.memberAccountId !== selected.member.accountId)
        throw new ApprovalOperationError("NOT_ADDRESSED");
      if (request.state !== "pending") throw new ApprovalOperationError("ALREADY_RESOLVED");
      if (Date.parse(request.expiresAt) <= now.getTime()) {
        resolve(request, "expired", now);
        throw new ApprovalOperationError("EXPIRED");
      }
      if (answer.allowTool && answer.decision === "approved") {
        const executable =
          typeof request.arguments.executable === "string" ? request.arguments.executable : null;
        if (
          !settings!.rules.some(
            (rule) => rule.toolName === request.toolName && rule.executable === executable,
          )
        ) {
          settings!.rules.push({ toolName: request.toolName, executable, decision: "allow" });
          settings!.revision += 1;
        }
      }
      return resolve(request, answer.decision, now, selected.member.accountId);
    },
    async pollRequest(_scope, _run, id, now) {
      const request = requests.get(id)!;
      if (request.state === "pending" && Date.parse(request.expiresAt) <= now.getTime())
        return resolve(request, "expired", now);
      return request;
    },
    async cancelRequest(_scope, _run, id, now) {
      const request = requests.get(id)!;
      if (request.state === "pending") resolve(request, "cancelled", now);
    },
    async listEffects(selected, runId, now) {
      expireEffects(selected, runId, now);
      return [...effects.values()].filter(
        (effect) => effect.spaceId === selected.spaceId && effect.runId === runId,
      );
    },
    async beginEffect(selected, currentRun, effect, now) {
      expireEffects(selected, currentRun.id, now);
      const prior = effects.get(effect.key);
      if (prior) return { created: false, effect: prior };
      if (
        [...effects.values()].some(
          (value) => value.runId === effect.runId && value.state === "unknown",
        )
      )
        throw new EffectUnknownError();
      if (
        [...effects.values()].some(
          (value) => value.runId === effect.runId && value.state === "intent",
        )
      )
        throw new Error("EFFECT_IN_PROGRESS");
      effects.set(effect.key, effect);
      return { created: true, effect };
    },
    async completeEffect(selected, key, state, result, now) {
      const stored = effects.get(key)!;
      expireEffects(selected, stored.runId, now);
      const effect = effects.get(key)!;
      if (effect.state !== "intent") throw new EffectUnknownError();
      effects.set(key, {
        ...effect,
        state,
        result,
        completedAt: state === "unknown" ? null : now.toISOString(),
      });
    },
  };
  const service = createApprovalsService(repository, { requestTtlMs: 20, pollIntervalMs: 1 });
  return { service, repository, requests, effects };
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
});
afterEach(() => vi.useRealTimers());

it("uses the Space mode and Run actor even when another member wakes the Run", async () => {
  const { service, repository, requests } = fixture();
  const account = await service.getSettings(run.memberAccountId);
  await service.updateSettings(run.memberAccountId, {
    mode: "never",
    rules: [],
    expectedRevision: account.revision,
  });
  const policy = vi.spyOn(repository, "getRunSettings").mockResolvedValue({
    mode: "ask",
    rules: [],
    revision: 1,
  });
  const pending = service.authorize(other, run, write, new AbortController().signal);
  await vi.advanceTimersByTimeAsync(1);
  expect(policy).toHaveBeenCalledWith(other, run.memberAccountId, "ask");
  const request = [...requests.values()][0]!;
  expect(request.memberAccountId).toBe(run.memberAccountId);
  await service.answer(scope, request.id, { decision: "approved" });
  await vi.advanceTimersByTimeAsync(1);
  expect(await pending).toBe("approved");

  policy.mockResolvedValue({ mode: "never", rules: [], revision: 1 });
  expect(await service.authorize(other, run, write, new AbortController().signal)).toBe("approved");
  policy.mockResolvedValue({
    mode: "never",
    rules: [{ toolName: write.name, executable: null, decision: "block" }],
    revision: 2,
  });
  expect(await service.authorize(other, run, write, new AbortController().signal)).toBe("blocked");
});

it("asks for a change, accepts only the addressed member, rejects second answers, and optionally allows the tool", async () => {
  const { service, requests } = fixture();
  const pending = service.authorize(scope, run, write, new AbortController().signal);
  await vi.advanceTimersByTimeAsync(1);
  const request = [...requests.values()][0]!;
  expect(request.arguments).toEqual(write.arguments);
  await expect(service.answer(other, request.id, { decision: "approved" })).rejects.toMatchObject({
    code: "NOT_ADDRESSED",
  });
  await service.answer(scope, request.id, { decision: "approved", allowTool: true });
  await expect(service.answer(scope, request.id, { decision: "denied" })).rejects.toMatchObject({
    code: "ALREADY_RESOLVED",
  });
  await vi.advanceTimersByTimeAsync(1);
  expect(await pending).toBe("approved");
  expect(
    await service.authorize(scope, run, { ...write, id: "next" }, new AbortController().signal),
  ).toBe("approved");
  expect(requests.size).toBe(1);
});
it("returns denial, explicit expiry and cancellation to the tool caller", async () => {
  for (const outcome of ["denied", "expired", "cancelled"] as const) {
    const { service, requests } = fixture();
    const controller = new AbortController();
    const pending = service.authorize(scope, run, write, controller.signal);
    await vi.advanceTimersByTimeAsync(1);
    const request = [...requests.values()][0]!;
    if (outcome === "denied") await service.answer(scope, request.id, { decision: "denied" });
    if (outcome === "cancelled") controller.abort();
    await vi.advanceTimersByTimeAsync(21);
    expect(await pending).toBe(outcome);
    expect(requests.get(request.id)!.state).toBe(outcome);
  }
});
it.each(["ask", "never"] as const)(
  "blocks exact tools in %s and never creates requests, including reads",
  async (mode) => {
    const { service, requests } = fixture();
    await service.updateSettings("owner", {
      expectedRevision: (await service.getSettings("owner")).revision,
      mode,
      rules: [
        { toolName: write.name, executable: null, decision: "block" },
        { toolName: "computer_read_file", executable: null, decision: "block" },
        { toolName: command.name, executable: "echo", decision: "block" },
      ],
    });
    for (const call of [
      write,
      command,
      { ...write, name: "computer_read_file" as const, changes: false },
    ])
      expect(await service.authorize(scope, run, call, new AbortController().signal)).toBe(
        "blocked",
      );
    expect(requests.size).toBe(0);
  },
);
it("allows exact tools and executables; never bypasses Block; explicitly rejects Auto", async () => {
  const { service, requests } = fixture();
  await expect(
    service.updateSettings("owner", {
      expectedRevision: (await service.getSettings("owner")).revision,
      mode: "auto",
      rules: [],
    }),
  ).rejects.toMatchObject({
    code: "MODE_UNAVAILABLE",
  });
  await service.updateSettings("owner", {
    expectedRevision: (await service.getSettings("owner")).revision,
    mode: "ask",
    rules: [
      { toolName: write.name, executable: null, decision: "allow" },
      { toolName: command.name, executable: "echo", decision: "allow" },
    ],
  });
  for (const call of [write, command])
    expect(await service.authorize(scope, run, call, new AbortController().signal)).toBe(
      "approved",
    );
  const pending = service.authorize(
    scope,
    run,
    { ...command, executable: "printf" },
    new AbortController().signal,
  );
  await vi.advanceTimersByTimeAsync(1);
  expect(requests.size).toBe(1);
  await vi.advanceTimersByTimeAsync(21);
  expect(await pending).toBe("expired");
  await service.updateSettings("owner", {
    expectedRevision: (await service.getSettings("owner")).revision,
    mode: "never",
    rules: [],
  });
  expect(await service.authorize(scope, run, write, new AbortController().signal)).toBe("approved");
  expect(requests.size).toBe(1);
});
it("rechecks a Block added while a request is pending", async () => {
  const { service, requests } = fixture();
  const pending = service.authorize(scope, run, write, new AbortController().signal);
  await vi.advanceTimersByTimeAsync(1);
  await service.updateSettings("owner", {
    expectedRevision: (await service.getSettings("owner")).revision,
    mode: "ask",
    rules: [{ toolName: write.name, executable: null, decision: "block" }],
  });
  await service.answer(scope, [...requests.keys()][0]!, { decision: "approved", allowTool: true });
  await vi.advanceTimersByTimeAsync(1);
  expect(await pending).toBe("blocked");
});
it("records an effect before execution, returns its recorded outcome for reordered identical arguments, and bounds its result", async () => {
  const { service, effects } = fixture();
  const operation = vi.fn(async () => {
    expect([...effects.values()][0]!.state).toBe("intent");
    return "x".repeat(40_000);
  });
  const signal = new AbortController().signal;
  const result = await service.executeEffect(scope, run, write, operation, signal);
  expect(result.length).toBeLessThanOrEqual(16_384);
  expect(result).toContain('"trust":"untrusted"');
  expect(
    await service.executeEffect(
      scope,
      run,
      { ...write, arguments: { content: write.arguments.content, path: write.arguments.path } },
      operation,
      signal,
    ),
  ).toBe(result);
  expect(operation).toHaveBeenCalledTimes(1);
  expect([...effects.values()][0]!.state).toBe("succeeded");
});
it("ages interrupted intents lazily and refuses automatic continuation", async () => {
  const { service, effects } = fixture();
  const controller = new AbortController();
  await expect(
    service.executeEffect(
      scope,
      run,
      write,
      async () => {
        controller.abort();
        throw new Error("interrupted");
      },
      controller.signal,
    ),
  ).rejects.toMatchObject({ code: "EFFECT_UNKNOWN" });
  const effect = [...effects.values()][0]!;
  effects.set(effect.key, { ...effect, state: "intent" });
  vi.advanceTimersByTime(EFFECT_INTENT_TIMEOUT_MS);
  await expect(service.assertContinuable(scope, run)).rejects.toMatchObject({
    code: "EFFECT_UNKNOWN",
  });
  expect(effects.get(effect.key)!.state).toBe("unknown");
  await expect(service.assertContinuable(scope, run)).rejects.toMatchObject({
    code: "EFFECT_UNKNOWN",
  });
  const operation = vi.fn(async () => "unsafe retry");
  await expect(
    service.executeEffect(scope, run, write, operation, new AbortController().signal),
  ).rejects.toMatchObject({ code: "EFFECT_UNKNOWN" });
  expect(operation).not.toHaveBeenCalled();
});
it("leaves a live intent unchanged when another service is created and reads it", async () => {
  const { service, repository, effects } = fixture();
  expect(EFFECT_INTENT_TIMEOUT_MS).toBeGreaterThan(TOOL_DEADLINE_MS);
  let finish = (_result: string) => {};
  const operation = vi.fn(
    () =>
      new Promise<string>((resolve) => {
        finish = resolve;
      }),
  );
  const first = service.executeEffect(scope, run, write, operation, new AbortController().signal);
  await vi.waitFor(() => expect(operation).toHaveBeenCalledOnce());
  vi.setSystemTime(
    new Date(Date.parse([...effects.values()][0]!.createdAt) + EFFECT_INTENT_TIMEOUT_MS - 1),
  );
  const secondService = createApprovalsService(repository);
  expect((await secondService.listEffects(scope, run.id))[0]!.state).toBe("intent");
  await expect(secondService.assertContinuable(scope, run)).rejects.toMatchObject({
    code: "EFFECT_IN_PROGRESS",
  });
  const duplicate = vi.fn(async () => "duplicate");
  await expect(
    secondService.executeEffect(scope, run, write, duplicate, new AbortController().signal),
  ).rejects.toThrow("EFFECT_IN_PROGRESS");
  expect(duplicate).not.toHaveBeenCalled();
  expect([...effects.values()][0]!.state).toBe("intent");
  finish(computerToolResult("succeeded", "Written"));
  await first;
  expect([...effects.values()][0]!.state).toBe("succeeded");
});
it("records a returned cancelled command as a failed outcome and preserves the known result", async () => {
  const { service, effects } = fixture();
  const result = computerToolResult("cancelled", "Command cancelled.");
  expect(
    await service.executeEffect(
      scope,
      run,
      command,
      async () => result,
      new AbortController().signal,
    ),
  ).toBe(result);
  expect([...effects.values()][0]!.state).toBe("failed");
});
it("marks an effect unknown when the computer completes but recording the outcome fails", async () => {
  const { service, repository, effects } = fixture();
  const complete = repository.completeEffect.bind(repository);
  repository.completeEffect = async (...args) => {
    if (args[2] !== "unknown") throw new Error("Injected outcome write failure");
    await complete(...args);
  };
  const operation = vi.fn(async () => computerToolResult("succeeded", "File written."));
  await expect(
    service.executeEffect(scope, run, write, operation, new AbortController().signal),
  ).rejects.toMatchObject({ code: "EFFECT_UNKNOWN" });
  expect([...effects.values()][0]!.state).toBe("unknown");
  await expect(service.assertContinuable(scope, run)).rejects.toMatchObject({
    code: "EFFECT_UNKNOWN",
  });
  expect(operation).toHaveBeenCalledTimes(1);
});
it("treats a lost tool response as unknown even without cancellation", async () => {
  const { service, effects } = fixture();
  const operation = vi.fn(async () => {
    throw new Error("Lost response after a change");
  });
  await expect(
    service.executeEffect(scope, run, write, operation, new AbortController().signal),
  ).rejects.toMatchObject({ code: "EFFECT_UNKNOWN" });
  expect([...effects.values()][0]!.state).toBe("unknown");
  await expect(
    service.executeEffect(scope, run, write, operation, new AbortController().signal),
  ).rejects.toMatchObject({ code: "EFFECT_UNKNOWN" });
  expect(operation).toHaveBeenCalledTimes(1);
});

it.each(["handover", "lease-lost", "timeout"])(
  "preserves a pending approval on %s",
  async (reason) => {
    const { service, requests } = fixture();
    const controller = new AbortController();
    const pending = service.authorize(scope, run, write, controller.signal);
    await vi.advanceTimersByTimeAsync(1);
    const request = [...requests.values()][0]!;
    controller.abort(reason);
    await expect(pending).resolves.toBe("cancelled");
    expect(requests.get(request.id)!.state).toBe("pending");
  },
);

it("reports mode availability and refuses a stale settings update with the current revision", async () => {
  const { service } = fixture();
  const initial = await service.getSettings("owner");
  expect(initial).toMatchObject({
    mode: "ask",
    rules: [],
    revision: 0,
    availableModes: [
      { mode: "ask", available: true, reasonCode: null },
      { mode: "never", available: true, reasonCode: null },
      { mode: "auto", available: false, reasonCode: "REVIEW_MODEL_NOT_CONFIGURED" },
    ],
  });
  const saved = await service.updateSettings("owner", {
    mode: "never",
    rules: [],
    expectedRevision: initial.revision,
  });
  expect(saved.revision).toBe(1);
  await expect(
    service.updateSettings("owner", {
      mode: "ask",
      rules: [{ toolName: write.name, executable: null, decision: "block" }],
      expectedRevision: initial.revision,
    }),
  ).rejects.toMatchObject({ code: "APPROVAL_SETTINGS_CONFLICT", settings: saved });
  expect(await service.getSettings("owner")).toEqual(saved);
});

it("advances the settings revision when an approval remembers a new Allow rule", async () => {
  const { service, requests } = fixture();
  const before = await service.getSettings("owner");
  const pending = service.authorize(scope, run, write, new AbortController().signal);
  await vi.advanceTimersByTimeAsync(1);
  await service.answer(scope, [...requests.keys()][0]!, { decision: "approved", allowTool: true });
  await vi.advanceTimersByTimeAsync(1);
  expect(await pending).toBe("approved");
  const current = await service.getSettings("owner");
  expect(current.revision).toBe(before.revision + 1);
  await expect(
    service.updateSettings("owner", {
      mode: "never",
      rules: [],
      expectedRevision: before.revision,
    }),
  ).rejects.toMatchObject({ code: "APPROVAL_SETTINGS_CONFLICT", settings: current });
});

it.each(["webhook", "email", "repository"] as const)(
  "requires approval for %s input despite an Allow rule",
  async (kind) => {
    const { service, requests } = fixture();
    await service.updateSettings("owner", {
      expectedRevision: 0,
      mode: "ask",
      rules: [{ toolName: write.name, executable: null, decision: "allow" }],
    });
    const inbound: ExecutionRun = {
      ...run,
      inboundProvenance: { kind, routineId: "routine", deliveryId: "delivery" },
    };
    const pending = service.authorize(scope, inbound, write, new AbortController().signal);
    await vi.advanceTimersByTimeAsync(1);
    expect(requests.size).toBe(1);
    await service.answer(scope, [...requests.values()][0]!.id, {
      decision: "approved",
      allowTool: true,
    });
    await vi.advanceTimersByTimeAsync(1);
    expect(await pending).toBe("approved");
    const again = service.authorize(
      scope,
      inbound,
      { ...write, id: "again" },
      new AbortController().signal,
    );
    await vi.advanceTimersByTimeAsync(1);
    expect(requests.size).toBe(2);
    await vi.advanceTimersByTimeAsync(21);
    expect(await again).toBe("expired");
    await service.updateSettings("owner", {
      expectedRevision: (await service.getSettings("owner")).revision,
      mode: "never",
      rules: [],
    });
    expect(await service.authorize(scope, inbound, write, new AbortController().signal)).toBe(
      "approved",
    );
  },
);
