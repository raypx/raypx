import { publicCloudEvent } from "./public-events.js";
import {
  CloudDomainError,
  isCloudTerminal,
  type CloudRunEvent,
  type CloudCommand,
} from "@voidmix/core";
import type { CloudContext, Actor, Intent, Fence } from "./context.js";

export function cloudRuns(context: CloudContext) {
  const {
    repo,
    now,
    options,
    fail,
    required,
    text,
    base,
    access,
    runFor,
    fenced,
    event,
    queue,
    snapshot,
    runTransaction,
    finishIn,
    spendingAccount,
  } = context;
  return {
    getRunSummary: (input: Actor & { runId: string }) =>
      repo.read((tx) => runFor(tx, input.runId, input.actorId)),
    getRunSnapshot: (input: Actor & { runId: string }) =>
      repo.read(async (tx) => snapshot(tx, await runFor(tx, input.runId, input.actorId), true)),
    listEvents: (
      input: Actor & {
        runId: string;
        afterSequence: number;
        beforeSequence?: number;
        limit: number;
      },
    ) =>
      repo.read(async (tx) => {
        await runFor(tx, input.runId, input.actorId);
        const all =
          input.beforeSequence !== undefined
            ? await tx.eventsBefore(input.runId, input.beforeSequence, input.limit + 1)
            : await tx.events(input.runId, input.afterSequence, input.limit + 1);
        const items =
          input.beforeSequence !== undefined ? all.slice(-input.limit) : all.slice(0, input.limit);
        return {
          items: items.map(publicCloudEvent),
          nextSequence:
            items.at(input.limit - 1)?.sequence ?? items.at(-1)?.sequence ?? input.afterSequence,
          hasMore: all.length > input.limit,
        };
      }),
    createCommand: (
      input: Actor & Intent & { runId: string; type: "cancel" | "steer"; text?: string },
    ) =>
      runTransaction(
        input.runId,
        async (tx) => {
          const run = await runFor(tx, input.runId, input.actorId, true);
          const duplicate = (
            await tx.list("commands", {
              actorId: input.actorId,
              idempotencyKey: input.idempotencyKey,
            })
          )[0];
          if (duplicate) {
            if (
              duplicate.runId !== run.id ||
              duplicate.type !== input.type ||
              duplicate.text !== (input.text ?? null)
            )
              fail("CLOUD_IDEMPOTENCY_CONFLICT", "Command key was reused.");
            return duplicate;
          }
          const command: CloudCommand = {
            ...base(run.scope),
            runId: run.id,
            actorId: input.actorId,
            idempotencyKey: input.idempotencyKey,
            type: input.type,
            text: input.type === "steer" ? text(input.text ?? "") : null,
            status: isCloudTerminal(run.status) ? ("rejected" as const) : ("pending" as const),
          };
          await tx.save("commands", command);
          if (!isCloudTerminal(run.status) && input.type === "cancel") {
            run.cancelRequested = true;
            if (run.status === "queued") {
              command.status = "applied";
              await tx.save("commands", command);
              await finishIn(tx, run, "cancelled");
            } else await tx.save("runs", run);
          }
          return command;
        },
        [`actor:${input.actorId}`],
      ),
    retryRun: async (input: Actor & Intent & { runId: string }) => {
      const prior = required(await repo.read((tx) => tx.get("runs", input.runId)));
      const duplicate = await repo.read(async (tx) =>
        (await tx.list("runs", { parentId: prior.conversationId })).find(
          (r) => r.turnId === `retry:${input.actorId}:${input.idempotencyKey}`,
        ),
      );
      if (!duplicate) await options.admitRun?.({ actorId: input.actorId, mode: prior.mode });
      return repo.transaction(
        [
          `account:${prior.ownerAccountId}`,
          `actor:${input.actorId}`,
          `run:${input.runId}`,
          `intent:${input.actorId}:${input.idempotencyKey}`,
        ],
        async (tx) => {
          const prior = await runFor(tx, input.runId, input.actorId, true);
          if (!isCloudTerminal(prior.status)) fail("CLOUD_RUN_ACTIVE", "Run is active.");
          const turnId = `retry:${input.actorId}:${input.idempotencyKey}`;
          const existing = (
            await tx.list("runs", { actorId: input.actorId, idempotencyKey: turnId })
          )[0];
          if (existing) {
            if (existing.retryOfRunId !== prior.id)
              fail("CLOUD_IDEMPOTENCY_CONFLICT", "Retry key reused.");
            return existing;
          }
          return queue(tx, {
            actorId: input.actorId,
            conversationId: prior.conversationId,
            turnId,
            taskId: prior.taskId,
            mode: prior.mode,
            prompt: prior.prompt,
            attachmentIds: prior.attachmentIds,
            scope: prior.scope,
            retryOf: prior,
            ...(prior.roundId ? { roundId: prior.roundId } : {}),
          });
        },
      );
    },
    acceptQueued: (input: { runId: string }) =>
      runTransaction(input.runId, async (tx) => {
        const run = required(await tx.get("runs", input.runId));
        if (run.status === "queued") {
          run.dispatchReady = true;
          run.updatedAt = now();
          await tx.save("runs", run);
        }
        return run;
      }),
    listReadyRuns: (input: { limit: number }) => repo.read((tx) => tx.readyRuns(input.limit)),
    claim: (input: { runId: string; ownerId: string }) =>
      runTransaction(input.runId, async (tx) => {
        const run = required(await tx.get("runs", input.runId));
        if (run.status !== "queued" || !run.dispatchReady) return null;
        try {
          if ((await spendingAccount(tx, run.requestedByUserId, run.scope)) !== run.ownerAccountId)
            fail("CLOUD_ACCESS_DENIED", "Spending owner changed.");
        } catch (error) {
          if (error instanceof CloudDomainError && error.code === "CLOUD_ACCESS_DENIED") {
            await finishIn(tx, run, "failed", undefined, "access_revoked");
            return null;
          }
          throw error;
        }
        run.ownerId = input.ownerId;
        run.epoch += 1;
        run.status = "running";
        run.startedAt = now();
        run.heartbeatAt = now();
        run.leaseExpiresAt = new Date(now().getTime() + 30_000);
        await event(tx, run, { type: "run.status", payload: { status: "running" } });
        return { run, epoch: run.epoch };
      }),
    heartbeat: (input: Fence) =>
      runTransaction(input.runId, async (tx) => {
        const run = await fenced(tx, input);
        run.heartbeatAt = now();
        run.leaseExpiresAt = new Date(now().getTime() + 30_000);
        run.updatedAt = now();
        await tx.save("runs", run);
        return run;
      }),
    validateFence: (input: Fence) => repo.read((tx) => fenced(tx, input)),
    registerExecutionGrant: (
      input: Fence & { grantId: string; tokenHash: string; expiresAt: Date; actions: string[] },
    ) =>
      runTransaction(input.runId, async (tx) => {
        const run = await fenced(tx, input);
        if (
          !/^[a-f0-9]{64}$/.test(input.tokenHash) ||
          !input.actions.length ||
          input.expiresAt.getTime() <= now().getTime() ||
          input.expiresAt.getTime() > required(run.leaseExpiresAt).getTime()
        )
          fail("CLOUD_INVALID_INPUT", "Invalid execution grant.");
        const prior = await tx.get("executionGrants", input.grantId);
        if (prior) {
          if (
            prior.runId !== run.id ||
            prior.ownerId !== input.ownerId ||
            prior.epoch !== input.epoch ||
            prior.tokenHash !== input.tokenHash ||
            JSON.stringify(prior.actions) !== JSON.stringify(input.actions)
          )
            fail("CLOUD_IDEMPOTENCY_CONFLICT", "Grant identity reused.");
          return prior;
        }
        const grant = {
          ...base(run.scope),
          id: input.grantId,
          runId: run.id,
          ownerId: input.ownerId,
          epoch: input.epoch,
          tokenHash: input.tokenHash,
          expiresAt: input.expiresAt,
          revokedAt: null,
          actions: [...new Set(input.actions)],
        };
        await tx.save("executionGrants", grant);
        return grant;
      }),
    validateExecutionGrant: (input: { grantId: string; tokenHash: string; action: string }) =>
      repo.read(async (tx) => {
        const grant = required(await tx.get("executionGrants", input.grantId));
        if (
          grant.tokenHash !== input.tokenHash ||
          grant.revokedAt ||
          grant.expiresAt.getTime() <= now().getTime() ||
          !grant.actions.includes(input.action)
        )
          fail("CLOUD_OWNER_INVALID", "Execution grant unavailable.");
        const run = await fenced(tx, {
          runId: grant.runId,
          ownerId: grant.ownerId,
          epoch: grant.epoch,
        });
        return { grant, run };
      }),
    renewExecutionGrant: (input: Fence & { grantId: string; expiresAt: Date }) =>
      runTransaction(input.runId, async (tx) => {
        const run = await fenced(tx, input);
        const grant = required(await tx.get("executionGrants", input.grantId));
        if (
          grant.runId !== run.id ||
          grant.ownerId !== input.ownerId ||
          grant.epoch !== input.epoch ||
          grant.revokedAt ||
          grant.expiresAt.getTime() <= now().getTime() ||
          input.expiresAt.getTime() <= now().getTime() ||
          input.expiresAt.getTime() > required(run.leaseExpiresAt).getTime()
        )
          fail("CLOUD_OWNER_INVALID", "Grant cannot be renewed.");
        grant.expiresAt = input.expiresAt;
        grant.updatedAt = now();
        await tx.save("executionGrants", grant);
        return grant;
      }),
    revokeExecutionGrant: async (input: { grantId: string }) => {
      const prior = required(await repo.read((tx) => tx.get("executionGrants", input.grantId)));
      return runTransaction(prior.runId, async (tx) => {
        const grant = required(await tx.get("executionGrants", input.grantId));
        grant.revokedAt = grant.revokedAt ?? now();
        grant.updatedAt = now();
        await tx.save("executionGrants", grant);
        return grant;
      });
    },
    workerControl: (input: Fence) =>
      repo.read(async (tx) => {
        const run = await fenced(tx, input);
        return { run, commands: await tx.list("commands", { parentId: run.id }) };
      }),
    workerSnapshot: (input: Fence) =>
      repo.read(async (tx) => snapshot(tx, await fenced(tx, input))),
    appendEvent: (
      input: Fence & {
        eventId: string;
        type: CloudRunEvent["type"];
        executionId?: string;
        payload: Record<string, unknown>;
      },
    ) => runTransaction(input.runId, async (tx) => event(tx, await fenced(tx, input), input)),
    startTool: (
      input: Fence & { executionId: string; callId: string; name: string; input: unknown },
    ) =>
      runTransaction(input.runId, async (tx) => {
        const run = await fenced(tx, input);
        if (run.cancelRequested) fail("CLOUD_RUN_TERMINAL", "Cancellation requested.");
        await event(tx, run, {
          eventId: `tool.started:${input.callId}`,
          type: "tool.started",
          executionId: input.executionId,
          payload: { callId: input.callId, name: input.name, input: input.input },
        });
        return required(await tx.get("tools", input.callId));
      }),
    finishTool: (
      input: Fence & {
        callId: string;
        status: "succeeded" | "failed" | "cancelled";
        output: unknown;
      },
    ) =>
      runTransaction(input.runId, async (tx) => {
        const run = await fenced(tx, input, false);
        const tool = required(await tx.get("tools", input.callId));
        if (tool.runId !== run.id) fail("CLOUD_ACCESS_DENIED", "Tool mismatch.");
        await event(tx, run, {
          eventId: `tool.completed:${input.callId}`,
          type: "tool.completed",
          executionId: tool.executionId,
          payload: {
            callId: input.callId,
            name: tool.name,
            output: input.output,
            isError: input.status === "failed",
          },
        });
        if (input.status === "cancelled") {
          tool.status = "cancelled";
          tool.output = input.output;
          tool.updatedAt = now();
          await tx.save("tools", tool);
          return tool;
        }
        return required(await tx.get("tools", tool.id));
      }),
    getToolDetail: (input: Actor & { callId: string }) =>
      repo.read(async (tx) => {
        const tool = required(await tx.get("tools", input.callId));
        await access(tx, input.actorId, tool.scope);
        return tool;
      }),
    startExecution: (input: Fence & { parentId?: string; role: string; prompt: string }) =>
      runTransaction(input.runId, async (tx) => {
        const run = await fenced(tx, input);
        if (run.cancelRequested) fail("CLOUD_RUN_TERMINAL", "Cancellation requested.");
        const executions = await tx.list("executions", { parentId: run.id });
        let depth = 0;
        if (input.parentId) {
          const parent = required(await tx.get("executions", input.parentId));
          if (
            parent.runId !== run.id ||
            parent.depth !== 0 ||
            parent.status !== "running" ||
            executions.filter((e) => e.parentId !== null && !isCloudTerminal(e.status)).length >= 2
          )
            fail("CLOUD_INVALID_INPUT", "Delegation limit reached.");
          depth = 1;
        } else if (executions.some((e) => e.parentId === null))
          fail("CLOUD_INVALID_INPUT", "Root execution already exists.");
        const execution = {
          ...base(run.scope),
          runId: run.id,
          parentId: input.parentId ?? null,
          role: input.role,
          prompt: input.prompt,
          status: "running" as const,
          output: null,
          depth,
        };
        await tx.save("executions", execution);
        await event(tx, run, {
          type: "execution.started",
          executionId: execution.id,
          payload: { role: execution.role, parentId: execution.parentId },
        });
        return execution;
      }),
    finishExecution: (
      input: Fence & {
        executionId: string;
        status: "succeeded" | "failed" | "cancelled";
        output?: string;
      },
    ) =>
      runTransaction(input.runId, async (tx) => {
        const run = await fenced(tx, input);
        const execution = required(await tx.get("executions", input.executionId));
        if (execution.runId !== run.id) fail("CLOUD_ACCESS_DENIED", "Execution mismatch.");
        execution.status = run.cancelRequested ? "cancelled" : input.status;
        execution.output = input.output ?? null;
        execution.updatedAt = now();
        await tx.save("executions", execution);
        await event(tx, run, {
          type: "execution.completed",
          executionId: execution.id,
          payload: { status: execution.status },
        });
        return execution;
      }),
    finish: (
      input: Fence & {
        status: "succeeded" | "failed" | "needs_input" | "cancelled";
        output?: string;
        error?: string;
      },
    ) =>
      runTransaction(input.runId, async (tx) =>
        finishIn(tx, await fenced(tx, input, false), input.status, input.output, input.error),
      ),
    interrupt: (input: Fence) =>
      runTransaction(input.runId, async (tx) =>
        finishIn(tx, await fenced(tx, input, false), "failed", undefined, "interrupted"),
      ),
    recoverInterrupted: (input: { ownerId?: string } = {}) =>
      repo.transaction([`worker:recovery:${input.ownerId ?? "expired"}`], async (tx) => {
        const result = [];
        const candidates = await tx.expiredRuns(now(), 100);
        await tx.lock(
          candidates.flatMap((run) => [
            `account:${run.ownerAccountId}`,
            `actor:${run.requestedByUserId}`,
            `run:${run.id}`,
            ...(run.taskId ? [`task:${run.taskId}`] : []),
          ]),
        );
        for (const run of candidates) {
          const current = required(await tx.get("runs", run.id));
          if (
            current.status === "running" &&
            (!current.leaseExpiresAt || current.leaseExpiresAt.getTime() <= now().getTime())
          )
            result.push(await finishIn(tx, current, "failed", undefined, "interrupted"));
        }
        return result;
      }),
    acknowledgeCommand: (input: Fence & { commandId: string; status: "applied" | "rejected" }) =>
      runTransaction(input.runId, async (tx) => {
        await fenced(tx, input);
        const command = required(await tx.get("commands", input.commandId));
        if (command.runId !== input.runId) fail("CLOUD_ACCESS_DENIED", "Command mismatch.");
        command.status = input.status;
        command.updatedAt = now();
        await tx.save("commands", command);
        return command;
      }),
  };
}
