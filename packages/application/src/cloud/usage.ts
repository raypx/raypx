import { type CloudUsageCall } from "@voidmix/core";
import type { CloudContext, Actor, Fence } from "./context.js";

export function cloudUsage(context: CloudContext) {
  const {
    repo,
    now,
    limits,
    fail,
    required,
    base,
    fenced,
    event,
    usageFor,
    runTransaction,
    spendingAccount,
    scopeFor,
  } = context;
  return {
    getUsage: (input: Actor & { projectId?: string }) =>
      repo.read(async (tx) => {
        if (!(await tx.userActive(input.actorId)))
          fail("CLOUD_ACCESS_DENIED", "Account unavailable.");
        return usageFor(
          tx,
          input.projectId
            ? await spendingAccount(tx, input.actorId, scopeFor(input))
            : `user:${input.actorId}`,
        );
      }),
    reserveUsage: (
      input: Fence & {
        callId: string;
        executionId: string;
        provider: string;
        model: string;
        reservedTokens: number;
        pricing?: CloudUsageCall["pricing"];
      },
    ) =>
      runTransaction(input.runId, async (tx) => {
        const run = await fenced(tx, input);
        await tx.lock([
          `account:${run.ownerAccountId}`,
          ...(run.taskId ? [`task:${run.taskId}`] : []),
        ]);
        const duplicate = await tx.get("usage", input.callId);
        if (duplicate) {
          if (
            duplicate.runId !== run.id ||
            duplicate.executionId !== input.executionId ||
            duplicate.provider !== input.provider ||
            duplicate.model !== input.model ||
            duplicate.reservedTokens !== input.reservedTokens ||
            JSON.stringify(duplicate.pricing) !== JSON.stringify(input.pricing ?? null)
          )
            fail("CLOUD_IDEMPOTENCY_CONFLICT", "Call key reused.");
          return duplicate;
        }
        if (run.cancelRequested) fail("CLOUD_RUN_TERMINAL", "Cancellation requested.");
        const execution = required(await tx.get("executions", input.executionId));
        if (execution.runId !== run.id || execution.status !== "running")
          fail("CLOUD_INVALID_INPUT", "Invalid execution.");
        const accountUsage = await usageFor(tx, run.ownerAccountId);
        const round = run.roundId ? required(await tx.get("rounds", run.roundId)) : null;
        const roundRuns = round ? await tx.list("runs", { roundId: round.id }) : [run];
        const runDuration = run.startedAt ? now().getTime() - run.startedAt.getTime() : 0;
        if (
          accountUsage.calls >= limits.accountCalls ||
          (await tx.list("usage", { runIds: roundRuns.map((item) => item.id) })).filter(
            (c) => c.state !== "released",
          ).length >= (run.mode === "search" ? 6 : (round?.callBudget ?? limits.taskCalls)) ||
          runDuration >=
            (run.mode === "search" ? 60_000 : (round?.durationBudgetMs ?? limits.taskDurationMs))
        )
          fail("CLOUD_BUDGET_EXCEEDED", "Model budget exhausted.");
        if (
          !Number.isSafeInteger(input.reservedTokens) ||
          input.reservedTokens <= 0 ||
          input.reservedTokens > limits.singleCallMaxTokens
        )
          fail("CLOUD_INVALID_INPUT", "Invalid token reservation.");
        if (
          input.pricing &&
          Object.values(input.pricing).some((value) => !Number.isFinite(value) || value < 0)
        )
          fail("CLOUD_INVALID_INPUT", "Invalid model price snapshot.");
        const call: CloudUsageCall = {
          ...base(run.scope),
          id: input.callId,
          runId: run.id,
          roundId: run.roundId,
          executionId: execution.id,
          accountId: run.ownerAccountId,
          provider: input.provider,
          model: input.model,
          pricing: input.pricing ?? null,
          state: "reserved",
          reservedTokens: input.reservedTokens,
          inputTokens: null,
          outputTokens: null,
          cacheReadTokens: null,
          cacheWriteTokens: null,
          estimatedCost: null,
          settledAt: null,
        };
        await tx.save("usage", call);
        return call;
      }),
    startUsage: (input: Fence & { callId: string; dispatchOnce?: boolean }) =>
      runTransaction(input.runId, async (tx) => {
        const run = await fenced(tx, input);
        if (run.cancelRequested) fail("CLOUD_RUN_TERMINAL", "Cancellation requested.");
        const call = required(await tx.get("usage", input.callId));
        if (call.runId !== input.runId) fail("CLOUD_ACCESS_DENIED", "Call mismatch.");
        if (input.dispatchOnce && call.state !== "reserved")
          fail("CLOUD_IDEMPOTENCY_CONFLICT", "Model call was already dispatched.");
        if (call.state === "reserved") call.state = "started";
        call.updatedAt = now();
        await tx.save("usage", call);
        return call;
      }),
    /** Trusted provider reconciliation only; never exposed through runner RPC. It cannot publish output or reopen a Run. */
    reconcileUsage: async (input: {
      callId: string;
      inputTokens?: number;
      outputTokens?: number;
      cacheReadTokens?: number;
      cacheWriteTokens?: number;
      started?: boolean;
    }) => {
      const prior = required(await repo.read((tx) => tx.get("usage", input.callId)));
      return runTransaction(prior.runId, async (tx) => {
        const call = required(await tx.get("usage", input.callId));
        if (call.state === "settled" || call.state === "released") return call;
        for (const value of [
          input.inputTokens,
          input.outputTokens,
          input.cacheReadTokens,
          input.cacheWriteTokens,
        ])
          if (value !== undefined && (!Number.isSafeInteger(value) || value < 0))
            fail("CLOUD_INVALID_INPUT", "Invalid usage count.");
        const known = input.inputTokens !== undefined && input.outputTokens !== undefined;
        call.state = known
          ? "settled"
          : input.started === false && call.state === "reserved"
            ? "released"
            : "unknown";
        call.inputTokens = input.inputTokens ?? null;
        call.outputTokens = input.outputTokens ?? null;
        call.cacheReadTokens = input.cacheReadTokens ?? null;
        call.cacheWriteTokens = input.cacheWriteTokens ?? null;
        call.estimatedCost = call.pricing
          ? ((call.inputTokens ?? call.reservedTokens) * call.pricing.inputPerMillion +
              (call.outputTokens ?? call.reservedTokens) * call.pricing.outputPerMillion +
              (call.cacheReadTokens ?? 0) *
                (call.pricing.cacheReadPerMillion ?? call.pricing.inputPerMillion) +
              (call.cacheWriteTokens ?? 0) *
                (call.pricing.cacheWritePerMillion ?? call.pricing.inputPerMillion)) /
            1_000_000
          : null;
        call.settledAt = now();
        call.updatedAt = now();
        await tx.save("usage", call);
        return call;
      });
    },
    settleUsage: (
      input: Fence & {
        callId: string;
        inputTokens?: number;
        outputTokens?: number;
        cacheReadTokens?: number;
        cacheWriteTokens?: number;
        started?: boolean;
      },
    ) =>
      runTransaction(input.runId, async (tx) => {
        const run = await fenced(tx, input, false);
        const call = required(await tx.get("usage", input.callId));
        if (call.runId !== run.id) fail("CLOUD_ACCESS_DENIED", "Call mismatch.");
        if (call.state === "settled" || call.state === "released") return call;
        for (const n of [
          input.inputTokens,
          input.outputTokens,
          input.cacheReadTokens,
          input.cacheWriteTokens,
        ])
          if (n !== undefined && (!Number.isSafeInteger(n) || n < 0))
            fail("CLOUD_INVALID_INPUT", "Invalid usage count.");
        const known = input.inputTokens !== undefined && input.outputTokens !== undefined;
        call.state = known
          ? "settled"
          : input.started === false && call.state === "reserved"
            ? "released"
            : "unknown";
        call.inputTokens = input.inputTokens ?? null;
        call.outputTokens = input.outputTokens ?? null;
        call.cacheReadTokens = input.cacheReadTokens ?? null;
        call.cacheWriteTokens = input.cacheWriteTokens ?? null;
        call.estimatedCost = call.pricing
          ? ((call.inputTokens ?? call.reservedTokens) * call.pricing.inputPerMillion +
              (call.outputTokens ?? call.reservedTokens) * call.pricing.outputPerMillion +
              (call.cacheReadTokens ?? 0) *
                (call.pricing.cacheReadPerMillion ?? call.pricing.inputPerMillion) +
              (call.cacheWriteTokens ?? 0) *
                (call.pricing.cacheWritePerMillion ?? call.pricing.inputPerMillion)) /
            1_000_000
          : null;
        call.settledAt = now();
        call.updatedAt = now();
        await tx.save("usage", call);
        await event(tx, run, {
          type: "usage.settled",
          executionId: call.executionId,
          payload: { callId: call.id, state: call.state },
        });
        return call;
      }),
  };
}
