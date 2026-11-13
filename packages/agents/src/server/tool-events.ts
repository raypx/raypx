import { and, asc, eq, isNull } from "drizzle-orm";
import type { Database } from "@raypx/database/connection";
import {
  conversationToolCalls as calls,
  conversationEvents as events,
  conversationCounters as counters,
} from "@raypx/database/schema";
import {
  toolActivitySchema,
  type RunId,
  type ToolActivity,
  type ToolOutcome,
} from "@raypx/core/conversation";
import type { SpaceScope } from "@raypx/spaces/server";
import type { ConversationId } from "@raypx/core/agents";
import type { ToolCompletion, ToolSummary } from "../conversations.js";

type Transaction = Pick<Database, "select" | "insert" | "update" | "execute">;
type Identity = { id: RunId; conversationId: ConversationId; fence: number };
type Publish = (
  tx: Pick<Database, "execute">,
  notice: { conversationId: string; sequence: number },
) => Promise<void>;

export function toolActivityView(row: typeof calls.$inferSelect): ToolActivity {
  return toolActivitySchema.parse({
    runId: row.runId,
    toolCallId: row.toolCallId,
    toolName: row.toolName,
    target: row.target,
    argumentSummary: row.argumentSummary,
    startedAt: row.startedAt.toISOString(),
    finishedAt: row.finishedAt?.toISOString() ?? null,
    outcome: row.outcome,
    durationMs: row.durationMs,
    exitStatus: row.exitStatus,
  });
}
function selection(scope: SpaceScope, run: Identity, toolCallId: string) {
  return and(
    eq(calls.spaceId, scope.spaceId),
    eq(calls.runId, run.id),
    eq(calls.toolCallId, toolCallId),
  );
}
/** Caller holds counter/Run locks and validates an attempt or observes the current fence. */
async function append(
  tx: Transaction,
  scope: SpaceScope,
  run: Identity,
  row: typeof calls.$inferSelect,
  kind: "tool.started" | "tool.finished",
  publish: Publish,
) {
  const counterSelection = and(
    eq(counters.spaceId, scope.spaceId),
    eq(counters.conversationId, run.conversationId),
  );
  const [counter] = await tx.select().from(counters).where(counterSelection);
  if (!counter) throw new Error("MISSING_CONVERSATION_COUNTER");
  const sequence = counter.sequence + 1;
  const data = {
    toolCallId: row.toolCallId,
    toolName: row.toolName,
    target: row.target,
    argumentSummary: row.argumentSummary,
    ...(kind === "tool.finished"
      ? { outcome: row.outcome, durationMs: row.durationMs, exitStatus: row.exitStatus }
      : {}),
  };
  await tx.insert(events).values({
    spaceId: scope.spaceId,
    conversationId: run.conversationId,
    sequence,
    kind,
    runId: run.id,
    fence: run.fence,
    data,
    createdAt: kind === "tool.started" ? row.startedAt : row.finishedAt!,
  });
  await tx.update(counters).set({ sequence }).where(counterSelection);
  await publish(tx, { conversationId: run.conversationId, sequence });
}
export async function beginToolEvent(
  tx: Transaction,
  scope: SpaceScope,
  run: Identity,
  tool: ToolSummary,
  publish: Publish,
) {
  const [existing] = await tx
    .select()
    .from(calls)
    .where(selection(scope, run, tool.toolCallId));
  if (existing) return;
  const [row] = await tx
    .insert(calls)
    .values({
      spaceId: scope.spaceId,
      conversationId: run.conversationId,
      runId: run.id,
      ...tool,
      fence: run.fence,
    })
    .returning();
  await append(tx, scope, run, row!, "tool.started", publish);
}
export async function finishToolEvent(
  tx: Transaction,
  scope: SpaceScope,
  run: Identity,
  result: ToolCompletion,
  publish: Publish,
  now = new Date(),
) {
  const where = selection(scope, run, result.toolCallId);
  const [current] = await tx.select().from(calls).where(where);
  if (!current || current.finishedAt) return;
  const [row] = await tx
    .update(calls)
    .set({
      finishedAt: now,
      outcome: result.outcome,
      durationMs: Math.min(2_147_483_647, Math.max(0, now.getTime() - current.startedAt.getTime())),
      exitStatus: result.exitStatus,
      fence: run.fence,
    })
    .where(and(where, isNull(calls.finishedAt)))
    .returning();
  if (row) await append(tx, scope, run, row, "tool.finished", publish);
}

export async function finishOpenToolEvents(
  tx: Transaction,
  scope: SpaceScope,
  run: Identity,
  outcome: ToolOutcome,
  publish: Publish,
) {
  const open = await tx
    .select({ toolCallId: calls.toolCallId })
    .from(calls)
    .where(and(eq(calls.spaceId, scope.spaceId), eq(calls.runId, run.id), isNull(calls.finishedAt)))
    .orderBy(asc(calls.startedAt), asc(calls.toolCallId));
  for (const call of open)
    await finishToolEvent(tx, scope, run, { ...call, outcome, exitStatus: null }, publish);
}
