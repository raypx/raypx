import {
  ApprovalOperationError,
  EffectUnknownError,
  createApprovalsService,
  createComputerTools,
  EFFECT_INTENT_TIMEOUT_MS,
  type ApprovalsRepository,
} from "@raypx/agents/server";
import { createComputersService, type ComputersRepository } from "@raypx/computers/server";
import {
  approvalRequestSchema,
  type ApprovalRequest,
  type ApprovalSettings,
  type Effect,
} from "@raypx/core/approvals";
import { computerSchema, type Computer } from "@raypx/core/computers";
import { conversationEventSchema, type Run } from "@raypx/core/conversation";
import { SpaceNotFound } from "@raypx/core/spaces";
import { createMemoryComputerProvider } from "@raypx/providers/computer";
import type { SpaceScope } from "@raypx/spaces/server";
import { replyFixture } from "./replies.js";

/** Offline fixture: real model loop, policy and Computer port, with repository doubles only. */
export function agentToolsFixture(options: { requestTtlMs?: number; maxToolRounds?: number } = {}) {
  let clock = new Date("2026-01-01T00:00:00.000Z");
  const now = () => new Date(clock);
  const requests: ApprovalRequest[] = [];
  const effects: Effect[] = [];
  const accountSettings = new Map<string, ApprovalSettings>();
  function expireEffects(scope: SpaceScope, runId: string, at: Date) {
    for (const effect of effects)
      if (
        effect.spaceId === scope.spaceId &&
        effect.runId === runId &&
        effect.state === "intent" &&
        Date.parse(effect.createdAt) <= at.getTime() - EFFECT_INTENT_TIMEOUT_MS
      )
        effect.state = "unknown";
  }
  function publish(payload: object) {
    const event = conversationEventSchema.parse({
      spaceId: f.spaceId,
      conversationId: f.conversationId,
      sequence: f.log.length + 1,
      createdAt: now().toISOString(),
      ...payload,
    });
    f.publish({ event });
  }
  function requireRun(scope: SpaceScope, id: string) {
    const run = f.runs.find(
      (candidate) => candidate.spaceId === scope.spaceId && candidate.id === id,
    );
    if (!run) throw new SpaceNotFound();
    return run;
  }
  function card(request: ApprovalRequest, kind: "card.created" | "card.resolved") {
    publish({
      kind,
      requestId: request.id,
      runId: request.runId,
      toolName: request.toolName,
      argumentSummary: request.argumentSummary,
      target: request.target,
      memberAccountId: request.memberAccountId,
      expiresAt: request.expiresAt,
      ...(kind === "card.resolved"
        ? { outcome: request.state, answeredByAccountId: request.answeredByAccountId }
        : {}),
    });
  }
  function runState(run: Run) {
    publish({ kind: "run.state", runId: run.id, state: run.state, failureCode: run.failureCode });
  }
  function resolve(
    request: ApprovalRequest,
    state: Exclude<ApprovalRequest["state"], "pending">,
    answeredBy: string | null,
    at: Date,
  ) {
    if (request.state !== "pending") return request;
    request.state = state;
    request.resolvedAt = at.toISOString();
    request.answeredByAccountId = answeredBy;
    card(request, "card.resolved");
    const run = f.runs.find((candidate) => candidate.id === request.runId)!;
    if (run.state === "waiting") {
      run.state = "running";
      runState(run);
    }
    return request;
  }
  function findRequest(scope: SpaceScope, id: string) {
    const request = requests.find(
      (candidate) => candidate.spaceId === scope.spaceId && candidate.id === id,
    );
    if (!request) throw new ApprovalOperationError("NOT_FOUND");
    return request;
  }
  const approvalRepository: ApprovalsRepository = {
    async getSettings(accountId, defaultMode) {
      if (!accountSettings.has(accountId))
        accountSettings.set(accountId, { mode: defaultMode, rules: [] });
      return structuredClone(accountSettings.get(accountId)!);
    },
    async updateSettings(accountId, input) {
      accountSettings.set(accountId, structuredClone(input));
      return structuredClone(input);
    },
    async listPending(scope, at) {
      const addressed = requests.filter(
        (request) =>
          request.spaceId === scope.spaceId && request.memberAccountId === scope.member.accountId,
      );
      for (const request of addressed)
        if (request.state === "pending" && Date.parse(request.expiresAt) <= at.getTime())
          resolve(request, "expired", null, at);
      return addressed
        .filter((request) => request.state === "pending")
        .map((request) => structuredClone(request));
    },
    async answer(scope, id, answer, at) {
      const request = findRequest(scope, id);
      if (request.memberAccountId !== scope.member.accountId)
        throw new ApprovalOperationError("NOT_ADDRESSED");
      if (request.state !== "pending") throw new ApprovalOperationError("ALREADY_RESOLVED");
      if (Date.parse(request.expiresAt) <= at.getTime()) {
        resolve(request, "expired", null, at);
        throw new ApprovalOperationError("EXPIRED");
      }
      if (answer.decision === "approved" && answer.allowTool) {
        const settings = accountSettings.get(scope.member.accountId)!;
        settings.rules.push({
          toolName: request.toolName,
          executable:
            request.toolName === "computer_run_command" &&
            typeof request.arguments.executable === "string"
              ? request.arguments.executable
              : null,
          decision: "allow",
        });
      }
      return structuredClone(resolve(request, answer.decision, scope.member.accountId, at));
    },
    async createRequest(scope, run, call, expiresAt, createdAt) {
      const active = requireRun(scope, run.id);
      const existing = requests.find(
        (request) =>
          request.spaceId === scope.spaceId &&
          request.runId === run.id &&
          request.toolCallId === call.id &&
          JSON.stringify(request.arguments) === JSON.stringify(call.arguments),
      );
      if (existing) return structuredClone(existing);
      if (active.state !== "running") throw new ApprovalOperationError("ALREADY_RESOLVED");
      const request = approvalRequestSchema.parse({
        id: crypto.randomUUID(),
        spaceId: scope.spaceId,
        conversationId: run.conversationId,
        runId: run.id,
        memberAccountId: run.memberAccountId,
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
      requests.push(request);
      active.state = "waiting";
      card(request, "card.created");
      runState(active);
      return structuredClone(request);
    },
    async pollRequest(scope, run, id, at) {
      const request = findRequest(scope, id);
      if (request.runId !== run.id || request.memberAccountId !== run.memberAccountId)
        throw new ApprovalOperationError("NOT_FOUND");
      if (request.state === "pending" && Date.parse(request.expiresAt) <= at.getTime())
        resolve(request, "expired", null, at);
      return structuredClone(request);
    },
    async cancelRequest(scope, _run, id, at) {
      resolve(findRequest(scope, id), "cancelled", null, at);
    },
    async listEffects(scope, runId, at) {
      requireRun(scope, runId);
      expireEffects(scope, runId, at);
      return effects
        .filter((effect) => effect.spaceId === scope.spaceId && effect.runId === runId)
        .map((effect) => structuredClone(effect));
    },
    async beginEffect(scope, run, effect, at) {
      const active = requireRun(scope, run.id);
      expireEffects(scope, run.id, at);
      const existing = effects.find(
        (candidate) => candidate.spaceId === scope.spaceId && candidate.key === effect.key,
      );
      if (existing) {
        return { created: false, effect: structuredClone(existing) };
      }
      if (active.state !== "running") throw new Error("RUN_NOT_ACTIVE");
      if (
        effects.some(
          (candidate) =>
            candidate.spaceId === scope.spaceId &&
            candidate.runId === run.id &&
            candidate.state === "unknown",
        )
      )
        throw new EffectUnknownError();
      if (
        effects.some(
          (candidate) =>
            candidate.spaceId === scope.spaceId &&
            candidate.runId === run.id &&
            candidate.state === "intent",
        )
      )
        throw new Error("EFFECT_IN_PROGRESS");
      effects.push(structuredClone(effect));
      return { created: true, effect };
    },
    async completeEffect(scope, key, state, result, at) {
      const effect = effects.find(
        (candidate) => candidate.spaceId === scope.spaceId && candidate.key === key,
      );
      if (effect) expireEffects(scope, effect.runId, at);
      if (!effect || effect.state !== "intent") throw new EffectUnknownError();
      effect.state = state;
      effect.result = result;
      effect.completedAt = state === "unknown" ? null : at.toISOString();
    },
  };
  const agentApprovals = createApprovalsService(approvalRepository, {
    now,
    pollIntervalMs: 2,
    requestTtlMs: options.requestTtlMs ?? 300_000,
  });
  const provider = createMemoryComputerProvider();
  let computer: Computer | null = null;
  const computerRepository: ComputersRepository = {
    get: async () => computer,
    async claim(scope, operation) {
      computer = computerSchema.parse({
        id: computer?.id ?? crypto.randomUUID(),
        spaceId: scope.spaceId,
        scope: "team",
        agentId: null,
        provider: "memory",
        state: operation === "start" ? "starting" : "stopping",
        generation: (computer?.generation ?? 0) + 1,
        homeRevision: computer?.homeRevision ?? null,
        leaseOwner: "fixture",
        leaseExpiresAt: new Date(clock.getTime() + 60_000).toISOString(),
        leaseFence: (computer?.leaseFence ?? 0) + 1,
        failureCode: null,
        createdAt: now().toISOString(),
        updatedAt: now().toISOString(),
      });
      return computer;
    },
    async complete(_scope, claim, result) {
      computer = { ...claim, ...result, leaseOwner: null, leaseExpiresAt: null };
      return computer;
    },
  };
  const computers = createComputersService(computerRepository, provider, "memory");
  const tools = createComputerTools(
    computers,
    provider,
    ["fixture-known-secret"],
    async (scope, run, pins): Promise<void> => {
      await f.repository.pinResources(scope, run, pins);
    },
  );
  const f = replyFixture({
    tools,
    approvals: agentApprovals,
    ...(options.maxToolRounds ? { maxToolRounds: options.maxToolRounds } : {}),
  });
  const stop = f.repository.stop.bind(f.repository);
  f.repository.stop = async (scope, conversationId, runId) => {
    const run = await stop(scope, conversationId, runId);
    for (const request of requests)
      if (request.runId === run.id && request.state === "pending")
        resolve(request, "cancelled", null, now());
    return run;
  };
  return {
    ...f,
    agentApprovals,
    approvalRepository,
    requests,
    effects,
    tools,
    provider,
    computers,
    computer: () => computer,
    advance(milliseconds: number) {
      clock = new Date(clock.getTime() + milliseconds);
    },
  };
}
