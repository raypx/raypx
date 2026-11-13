import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import type { AssistantMessage } from "@raypx/ai";
import type { Database } from "@raypx/database/connection";
import {
  agents,
  spaces,
  conversationParticipants,
  conversationRuns as runs,
  conversationRunCheckpoints as checkpoints,
  conversationRunBackupJobs as backupJobs,
  conversationDelegations as delegations,
} from "@raypx/database/schema";
import type { ConversationId } from "@raypx/core/agents";
import { runIdSchema, type Run } from "@raypx/core/conversation";
import { normalizeTaskJson } from "@raypx/core/task-text";
import { SpaceNotFound } from "@raypx/core/spaces";
import type { SpaceScope } from "@raypx/spaces/server";
import {
  AgentInteractionError,
  type ConversationRunRepository,
  type ExecutionRun,
  type RunCheckpoint,
} from "../conversations.js";
import { assertRunFence } from "./fence.js";

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
type DelegationDatabase = Pick<Database, "transaction">;
interface DelegationHooks {
  lock(tx: Transaction, scope: SpaceScope, id: ConversationId): Promise<unknown>;
  cancelRun(tx: Transaction, scope: SpaceScope, row: typeof runs.$inferSelect): Promise<Run>;
  writeCheckpoint(
    tx: Transaction,
    scope: SpaceScope,
    run: ExecutionRun,
    checkpoint: RunCheckpoint,
  ): Promise<RunCheckpoint>;
  appendState(
    tx: Transaction,
    scope: SpaceScope,
    run: Run,
    sequence: number,
    fence?: number,
  ): Promise<void>;
}

export const DELEGATION_LIMITS = { depth: 3, concurrent: 4, total: 16 } as const;
const terminalStates = ["succeeded", "failed", "cancelled"] as const;
function selection(scope: SpaceScope, run: ExecutionRun) {
  return and(
    eq(delegations.spaceId, scope.spaceId),
    eq(delegations.conversationId, run.conversationId),
    eq(delegations.parentRunId, run.id),
  );
}
function resultText(checkpoint: RunCheckpoint | undefined) {
  if (!checkpoint) return "";
  const text = checkpoint.continuation
    .filter((message) => message.role === "assistant")
    .flatMap((message) => message.content)
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("\n");
  const clipped = text.slice(0, 16_000);
  return /[\uD800-\uDBFF]$/.test(clipped) ? clipped.slice(0, -1) : clipped;
}
/** Append a complete call/result pair; a delegate acknowledgement must never get a second result. */
function appendResult(
  checkpoint: RunCheckpoint,
  childId: string,
  result: unknown,
  failed: boolean,
) {
  const template = checkpoint.continuation
    .slice()
    .reverse()
    .find((message): message is AssistantMessage => message.role === "assistant");
  const toolCallId = `child-result:${childId}`;
  const timestamp = Date.now();
  const assistant: AssistantMessage = {
    role: "assistant",
    content: [],
    api: "openai-responses",
    provider: "internal",
    model: "delegation-result",
    usage: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
    ...template,
    stopReason: "toolUse",
    timestamp,
  };
  assistant.content = [{ type: "toolCall", id: toolCallId, name: "agent_wait", arguments: {} }];
  checkpoint.continuation.push(assistant, {
    role: "toolResult",
    toolCallId,
    toolName: "agent_wait",
    content: [{ type: "text", text: JSON.stringify(result) }],
    isError: failed,
    timestamp,
  });
}
/** Durable intents deduplicate delegation before dispatch; results and delivery share the parent fence. */
export function createDelegationsRepository(
  db: DelegationDatabase,
  hooks: DelegationHooks,
): Pick<ConversationRunRepository, "delegate" | "consumeDelegations" | "hasPendingDelegations"> {
  return {
    async delegate(scope, run, input) {
      return db.transaction(async (tx) => {
        const [space] = await tx
          .select({ id: spaces.id })
          .from(spaces)
          .where(and(eq(spaces.id, scope.spaceId), isNull(spaces.deletionClaimedAt)))
          .for("share");
        if (!space) throw new SpaceNotFound();
        const counter = (await hooks.lock(tx, scope, run.conversationId)) as { sequence: number };
        const parent = await assertRunFence(tx, scope, run);
        const existing = await tx
          .select()
          .from(delegations)
          .where(and(selection(scope, run), eq(delegations.toolCallId, input.toolCallId)));
        if (existing[0]) return { runId: runIdSchema.parse(existing[0].childRunId) };
        if (parent.delegationDepth >= DELEGATION_LIMITS.depth)
          throw new AgentInteractionError("DELEGATION_DEPTH_LIMIT");
        const siblings = await tx
          .select({ child: runs })
          .from(delegations)
          .innerJoin(
            runs,
            and(
              eq(runs.spaceId, delegations.spaceId),
              eq(runs.conversationId, delegations.conversationId),
              eq(runs.id, delegations.childRunId),
            ),
          )
          .where(selection(scope, run))
          .orderBy(asc(delegations.createdAt), asc(delegations.toolCallId));
        if (siblings.length >= DELEGATION_LIMITS.total)
          throw new AgentInteractionError("DELEGATION_TOTAL_LIMIT");
        if (
          siblings.filter(
            ({ child }) => !terminalStates.includes(child.state as (typeof terminalStates)[number]),
          ).length >= DELEGATION_LIMITS.concurrent
        )
          throw new AgentInteractionError("DELEGATION_CONCURRENT_LIMIT");
        const agentId = input.agentId ?? parent.agentId;
        const [agent] = await tx
          .select()
          .from(agents)
          .where(
            and(
              eq(agents.spaceId, scope.spaceId),
              eq(agents.id, agentId),
              isNull(agents.deletedAt),
            ),
          );
        if (!agent) throw new AgentInteractionError("AGENT_TARGET_UNAVAILABLE");
        if (agentId !== parent.agentId) {
          const [participant] = await tx
            .select()
            .from(conversationParticipants)
            .where(
              and(
                eq(conversationParticipants.spaceId, scope.spaceId),
                eq(conversationParticipants.conversationId, run.conversationId),
                eq(conversationParticipants.agentId, agentId),
                isNull(conversationParticipants.removedAt),
              ),
            );
          if (!participant) throw new AgentInteractionError("AGENT_TARGET_UNAVAILABLE");
        }
        const id = runIdSchema.parse(crypto.randomUUID());
        const [child] = await tx
          .insert(runs)
          .values({
            spaceId: scope.spaceId,
            conversationId: run.conversationId,
            id,
            parentRunId: run.id,
            agentId,
            trigger: parent.trigger,
            messageId: parent.messageId,
            messageSequence: parent.messageSequence,
            memberAccountId: parent.memberAccountId,
            modelId: agentId === parent.agentId ? parent.modelId : agent.modelId,
            instructions: agentId === parent.agentId ? parent.instructions : agent.instructions,
            delegatedAllowSharedMemory: run.allowSharedMemory === true,
            ...(agentId === parent.agentId
              ? {
                  connectionId: parent.connectionId,
                  computerId: parent.computerId,
                  computerGeneration: parent.computerGeneration,
                }
              : {}),
            delegationDepth: parent.delegationDepth + 1,
            delegationTask: normalizeTaskJson(input.task),
            instructionRevision: 0,
            originMessageId: parent.originMessageId,
            agentChainDepth: parent.agentChainDepth,
            untrustedInput:
              parent.untrustedInput || run.untrustedInput || agentId !== parent.agentId,
          })
          .returning();
        await tx.insert(delegations).values({
          spaceId: scope.spaceId,
          conversationId: run.conversationId,
          parentRunId: run.id,
          toolCallId: input.toolCallId,
          childRunId: id,
          instructionRevision: parent.instructionRevision,
          fence: run.fence,
        });
        await tx.insert(backupJobs).values({
          spaceId: scope.spaceId,
          conversationId: run.conversationId,
          runId: id,
          runAt: sql`clock_timestamp() + interval '30 seconds'`,
        });
        await hooks.appendState(
          tx,
          scope,
          {
            id,
            spaceId: run.spaceId,
            conversationId: run.conversationId,
            agentId: agentId as Run["agentId"],
            parentRunId: run.id,
            trigger: run.trigger,
            messageId: run.messageId,
            memberAccountId: run.memberAccountId,
            model: { modelId: child!.modelId },
            state: "queued",
            failureCode: null,
            createdAt: child!.createdAt.toISOString(),
            startedAt: null,
            firstResponseAt: null,
            finishedAt: null,
          },
          counter.sequence + 1,
        );
        return { runId: id };
      });
    },
    async hasPendingDelegations(scope, run) {
      return db.transaction(async (tx) => {
        await hooks.lock(tx, scope, run.conversationId);
        const parent = await assertRunFence(tx, scope, run);
        if (parent.instructionRevision !== (run.instructionRevision ?? 0)) return false;
        const [row] = await tx
          .select({ id: delegations.childRunId })
          .from(delegations)
          .innerJoin(
            runs,
            and(
              eq(runs.spaceId, delegations.spaceId),
              eq(runs.conversationId, delegations.conversationId),
              eq(runs.id, delegations.childRunId),
            ),
          )
          .where(
            and(
              selection(scope, run),
              eq(delegations.state, "pending"),
              inArray(runs.state, ["queued", "running", "waiting"]),
            ),
          )
          .orderBy(asc(delegations.createdAt), asc(delegations.toolCallId))
          .limit(1);
        return row !== undefined;
      });
    },
    async consumeDelegations(scope, run, checkpoint) {
      return db.transaction(async (tx) => {
        await hooks.lock(tx, scope, run.conversationId);
        const parent = await assertRunFence(tx, scope, run);
        const rows = await tx
          .select({ delegation: delegations, child: runs, checkpoint: checkpoints.data })
          .from(delegations)
          .innerJoin(
            runs,
            and(
              eq(runs.spaceId, delegations.spaceId),
              eq(runs.conversationId, delegations.conversationId),
              eq(runs.id, delegations.childRunId),
            ),
          )
          .leftJoin(
            checkpoints,
            and(
              eq(checkpoints.spaceId, runs.spaceId),
              eq(checkpoints.conversationId, runs.conversationId),
              eq(checkpoints.runId, runs.id),
            ),
          )
          .where(and(selection(scope, run), inArray(delegations.state, ["pending", "ready"])))
          .orderBy(asc(delegations.createdAt), asc(delegations.toolCallId));
        let next = structuredClone(checkpoint);
        let pending = false;
        let changed = false;
        for (const row of rows) {
          const selected = and(
            selection(scope, run),
            eq(delegations.toolCallId, row.delegation.toolCallId),
          );
          if (row.delegation.instructionRevision !== parent.instructionRevision) {
            await hooks.cancelRun(tx, scope, row.child);
            await tx
              .update(delegations)
              .set({ state: "discarded", fence: run.fence, completedAt: sql`clock_timestamp()` })
              .where(selected);
            continue;
          }
          if (!terminalStates.includes(row.child.state as (typeof terminalStates)[number])) {
            pending = true;
            continue;
          }
          const result = row.delegation.result ?? {
            source: "child_run",
            trust: "untrusted",
            state: row.child.state,
            runId: row.child.id,
            agentId: row.child.agentId,
            failureCode: row.child.failureCode,
            content: resultText(row.checkpoint as RunCheckpoint | undefined),
          };
          await tx
            .update(delegations)
            .set({
              state: "delivered",
              fence: run.fence,
              result: normalizeTaskJson(result),
              completedAt: sql`clock_timestamp()`,
            })
            .where(selected);
          next.completed = false;
          next.untrustedInput ||= row.child.agentId !== parent.agentId || row.child.untrustedInput;
          appendResult(next, row.child.id, result, row.child.state !== "succeeded");
          changed = true;
        }
        if (changed) next = await hooks.writeCheckpoint(tx, scope, run, next);
        return { checkpoint: next, pending };
      });
    },
  };
}
