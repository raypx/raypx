import { and, asc, eq, gt, inArray, lte, sql } from "drizzle-orm";
import type { Database } from "@raypx/database/connection";
import {
  conversations,
  agents,
  conversationRuns as runs,
  conversationReplySegments as segments,
  conversationCounters as counters,
  conversationMessages as messages,
  conversationEvents as events,
  approvalRequests,
} from "@raypx/database/schema";
import type { ConversationId } from "@raypx/core/agents";
import {
  eventCursorStatus,
  InvalidConversationCursor,
  memberMessageInputSchema,
  messageSchema,
  conversationEventSchema,
  runSchema,
  replySegmentSchema,
  type Run,
  type RunId,
} from "@raypx/core/conversation";
import { normalizeTaskJson } from "@raypx/core/task-text";
import { SpaceNotFound } from "@raypx/core/spaces";
import type { SpaceScope } from "@raypx/spaces/server";
import type {
  ConversationsRepository,
  ConversationRunRepository,
  ConversationNotice,
} from "../conversations.js";
import { conversationView } from "../views.js";

export const conversationChannel = "raypx_conversation_events";
/** Called inside the committing transaction: PostgreSQL delivers only after commit. */
export async function publishConversationNotice(
  tx: Pick<Database, "execute">,
  notice: ConversationNotice,
) {
  await tx.execute(sql`select pg_notify(${conversationChannel}, ${JSON.stringify(notice)})`);
}
function message(row: typeof messages.$inferSelect) {
  return messageSchema.parse({
    id: row.id,
    spaceId: row.spaceId,
    conversationId: row.conversationId,
    sequence: row.sequence,
    author: { kind: "member", accountId: row.authorAccountId },
    text: row.text,
    createdAt: row.createdAt.toISOString(),
  });
}
function runView(row: typeof runs.$inferSelect) {
  return runSchema.parse({
    id: row.id,
    spaceId: row.spaceId,
    conversationId: row.conversationId,
    agentId: row.agentId,
    trigger: row.trigger,
    messageId: row.messageId,
    memberAccountId: row.memberAccountId,
    model: { modelId: row.modelId },
    state: row.state,
    failureCode: row.failureCode,
    createdAt: row.createdAt.toISOString(),
    startedAt: row.startedAt?.toISOString() ?? null,
    firstResponseAt: row.firstResponseAt?.toISOString() ?? null,
    finishedAt: row.finishedAt?.toISOString() ?? null,
  });
}
function segmentView(row: typeof segments.$inferSelect) {
  return replySegmentSchema.parse({ ...row, createdAt: row.createdAt.toISOString() });
}
export function createConversationsRepository(
  db: Database,
  publish = publishConversationNotice,
): ConversationsRepository & ConversationRunRepository {
  function selection(scope: SpaceScope, id: ConversationId) {
    return and(eq(conversations.spaceId, scope.spaceId), eq(conversations.id, id));
  }
  function counterSelection(scope: SpaceScope, id: ConversationId) {
    return and(eq(counters.spaceId, scope.spaceId), eq(counters.conversationId, id));
  }
  async function requireConversation(
    tx: Pick<Database, "select">,
    scope: SpaceScope,
    id: ConversationId,
  ) {
    const [row] = await tx.select().from(conversations).where(selection(scope, id));
    if (!row) throw new SpaceNotFound();
    return row;
  }
  async function lock(
    tx: Pick<Database, "select" | "insert">,
    scope: SpaceScope,
    id: ConversationId,
  ) {
    await requireConversation(tx, scope, id);
    await tx
      .insert(counters)
      .values({ spaceId: scope.spaceId, conversationId: id })
      .onConflictDoNothing();
    const [counter] = await tx
      .select()
      .from(counters)
      .where(counterSelection(scope, id))
      .for("update");
    return counter!;
  }
  const runSelection = (scope: SpaceScope, id: ConversationId, runId: RunId) =>
    and(eq(runs.spaceId, scope.spaceId), eq(runs.conversationId, id), eq(runs.id, runId));
  async function appendState(
    tx: Pick<Database, "insert" | "update" | "execute">,
    scope: SpaceScope,
    run: Run,
    sequence: number,
  ) {
    await tx.insert(events).values({
      spaceId: scope.spaceId,
      conversationId: run.conversationId,
      sequence,
      kind: "run.state",
      runId: run.id,
      data: { state: run.state, failureCode: run.failureCode },
    });
    await tx.update(counters).set({ sequence }).where(counterSelection(scope, run.conversationId));
    await publish(tx, { conversationId: run.conversationId, sequence });
  }
  async function getRun(scope: SpaceScope, id: ConversationId, runId: RunId) {
    const [row] = await db
      .select()
      .from(runs)
      .where(runSelection(scope, id, runId));
    if (!row) throw new SpaceNotFound();
    return runView(row);
  }
  async function cancelPendingRequests(
    tx: Pick<Database, "insert" | "update" | "execute">,
    scope: SpaceScope,
    run: Run,
    sequence: number,
  ) {
    const cancelled = await tx
      .update(approvalRequests)
      .set({ state: "cancelled", resolvedAt: new Date(), answeredByAccountId: null })
      .where(
        and(
          eq(approvalRequests.spaceId, scope.spaceId),
          eq(approvalRequests.conversationId, run.conversationId),
          eq(approvalRequests.runId, run.id),
          eq(approvalRequests.state, "pending"),
        ),
      )
      .returning();
    for (const request of cancelled) {
      sequence++;
      await tx.insert(events).values({
        spaceId: scope.spaceId,
        conversationId: run.conversationId,
        sequence,
        kind: "card.resolved",
        runId: run.id,
        requestId: request.id,
        data: {
          toolName: request.toolName,
          argumentSummary: request.argumentSummary,
          target: request.target,
          memberAccountId: request.memberAccountId,
          expiresAt: request.expiresAt.toISOString(),
          outcome: "cancelled",
          answeredByAccountId: null,
        },
      });
    }
    if (cancelled.length) {
      await tx
        .update(counters)
        .set({ sequence })
        .where(counterSelection(scope, run.conversationId));
      await publish(tx, { conversationId: run.conversationId, sequence });
    }
  }
  return {
    getRun,
    async stop(scope, id, runId) {
      return db.transaction(async (tx) => {
        const counter = await lock(tx, scope, id);
        const [row] = await tx
          .select()
          .from(runs)
          .where(runSelection(scope, id, runId));
        if (!row) throw new SpaceNotFound();
        if (row.state !== "queued" && row.state !== "running" && row.state !== "waiting")
          return runView(row);
        const [updated] = await tx
          .update(runs)
          .set({ state: "cancelled", finishedAt: new Date() })
          .where(runSelection(scope, id, runId))
          .returning();
        const run = runView(updated!);
        await appendState(tx, scope, run, counter.sequence + 1);
        await cancelPendingRequests(tx, scope, run, counter.sequence + 1);
        return run;
      });
    },
    async claimNext(scope, id) {
      return db.transaction(async (tx) => {
        const counter = await lock(tx, scope, id);
        const [active] = await tx
          .select({ id: runs.id })
          .from(runs)
          .where(
            and(
              eq(runs.spaceId, scope.spaceId),
              eq(runs.conversationId, id),
              inArray(runs.state, ["running", "waiting"]),
            ),
          );
        if (active) return undefined;
        const [next] = await tx
          .select()
          .from(runs)
          .where(
            and(
              eq(runs.spaceId, scope.spaceId),
              eq(runs.conversationId, id),
              eq(runs.state, "queued"),
            ),
          )
          .orderBy(asc(runs.messageSequence))
          .limit(1);
        if (!next) return undefined;
        const [row] = await tx
          .update(runs)
          .set({ state: "running", startedAt: new Date() })
          .where(runSelection(scope, id, next.id as RunId))
          .returning();
        const run = runView(row!);
        await appendState(tx, scope, run, counter.sequence + 1);
        const inputs = await tx
          .select()
          .from(messages)
          .where(
            and(
              eq(messages.spaceId, scope.spaceId),
              eq(messages.conversationId, id),
              lte(messages.sequence, next.messageSequence),
            ),
          );
        const outputs = await tx
          .select()
          .from(segments)
          .where(
            and(
              eq(segments.spaceId, scope.spaceId),
              eq(segments.conversationId, id),
              lte(segments.sequence, counter.sequence),
            ),
          );
        const priorRuns = await tx
          .select()
          .from(runs)
          .where(
            and(
              eq(runs.spaceId, scope.spaceId),
              eq(runs.conversationId, id),
              lte(runs.messageSequence, next.messageSequence),
            ),
          );
        // Pair each member input with its reply. Arrival order can put queued inputs before earlier replies.
        const history = inputs
          .sort((a, b) => a.sequence - b.sequence)
          .flatMap((m) => {
            const owner = priorRuns.find((r) => r.messageId === m.id);
            const replies = outputs
              .filter((s) => s.runId === owner?.id)
              .sort((a, b) => a.sequence - b.sequence);
            return [
              { role: "user" as const, text: m.text, createdAt: m.createdAt.toISOString() },
              ...replies.map((s) => ({
                role: "assistant" as const,
                text: s.text,
                createdAt: s.createdAt.toISOString(),
              })),
            ];
          });
        return { run, instructions: next.instructions, history };
      });
    },
    async finish(scope, run, failure) {
      await db.transaction(async (tx) => {
        const counter = await lock(tx, scope, run.conversationId);
        const [row] = await tx
          .update(runs)
          .set({
            state: failure ? "failed" : "succeeded",
            failureCode: failure,
            finishedAt: new Date(),
          })
          .where(
            and(
              runSelection(scope, run.conversationId, run.id),
              inArray(runs.state, ["running", "waiting"]),
            ),
          )
          .returning();
        if (row) {
          await appendState(tx, scope, runView(row), counter.sequence + 1);
          await cancelPendingRequests(tx, scope, runView(row), counter.sequence + 1);
        }
      });
    },
    async commitSegment(scope, run, segmentId, text, firstResponseAt) {
      return db.transaction(async (tx) => {
        const counter = await lock(tx, scope, run.conversationId);
        const [active] = await tx
          .select()
          .from(runs)
          .where(and(runSelection(scope, run.conversationId, run.id), eq(runs.state, "running")));
        if (!active) return false;
        const sequence = counter.sequence + 1;
        await tx.insert(segments).values({
          spaceId: scope.spaceId,
          conversationId: run.conversationId,
          id: segmentId,
          runId: run.id,
          sequence,
          text: normalizeTaskJson(text),
        });
        await tx.insert(events).values({
          spaceId: scope.spaceId,
          conversationId: run.conversationId,
          sequence,
          kind: "reply.segment",
          runId: run.id,
          segmentId,
        });
        if (!active.firstResponseAt)
          await tx
            .update(runs)
            .set({ firstResponseAt: new Date(firstResponseAt) })
            .where(runSelection(scope, run.conversationId, run.id));
        await tx
          .update(counters)
          .set({ sequence })
          .where(counterSelection(scope, run.conversationId));
        await publish(tx, { conversationId: run.conversationId, sequence });
        return true;
      });
    },
    async send(scope, id, input) {
      const values = memberMessageInputSchema.parse(input);
      return db.transaction(async (tx) => {
        const counter = await lock(tx, scope, id);
        const [existing] = await tx
          .select()
          .from(messages)
          .where(
            and(
              eq(messages.spaceId, scope.spaceId),
              eq(messages.conversationId, id),
              eq(messages.authorAccountId, scope.member.accountId),
              eq(messages.idempotencyKey, values.idempotencyKey),
            ),
          );
        if (existing) return message(existing);
        const sequence = counter.sequence + 1;
        const [row] = await tx
          .insert(messages)
          .values({
            spaceId: scope.spaceId,
            conversationId: id,
            id: crypto.randomUUID(),
            sequence,
            authorAccountId: scope.member.accountId,
            idempotencyKey: values.idempotencyKey,
            text: normalizeTaskJson(values.text),
          })
          .returning();
        await tx.insert(events).values({
          spaceId: scope.spaceId,
          conversationId: id,
          sequence,
          kind: "message.created",
          messageId: row!.id,
          createdAt: row!.createdAt,
        });
        const conversation = await requireConversation(tx, scope, id);
        const [agent] = await tx
          .select()
          .from(agents)
          .where(and(eq(agents.spaceId, scope.spaceId), eq(agents.id, conversation.agentId)));
        const [run] = await tx
          .insert(runs)
          .values({
            spaceId: scope.spaceId,
            conversationId: id,
            id: crypto.randomUUID(),
            agentId: conversation.agentId,
            messageId: row!.id,
            messageSequence: sequence,
            memberAccountId: scope.member.accountId,
            modelId: agent!.modelId,
            instructions: agent!.instructions,
          })
          .returning();
        await appendState(tx, scope, runView(run!), sequence + 1);
        return message(row!);
      });
    },
    async events(scope, id, after, limit) {
      if (!Number.isInteger(limit) || limit < 1 || limit > 100)
        throw new RangeError("Invalid event limit");
      return db.transaction(
        async (tx) => {
          await requireConversation(tx, scope, id);
          const [counter] = await tx.select().from(counters).where(counterSelection(scope, id));
          const latest = counter?.sequence ?? 0;
          const status = eventCursorStatus(after, counter?.retainedAfter ?? 0, latest);
          if (status === "invalid-cursor") throw new InvalidConversationCursor();
          if (status === "snapshot-required") return { status, cursor: latest };
          const rows = await tx
            .select({ event: events, message: messages, segment: segments })
            .from(events)
            .leftJoin(
              messages,
              and(
                eq(messages.spaceId, events.spaceId),
                eq(messages.conversationId, events.conversationId),
                eq(messages.id, events.messageId),
              ),
            )
            .leftJoin(
              segments,
              and(
                eq(segments.spaceId, events.spaceId),
                eq(segments.conversationId, events.conversationId),
                eq(segments.id, events.segmentId),
              ),
            )
            .where(
              and(
                eq(events.spaceId, scope.spaceId),
                eq(events.conversationId, id),
                gt(events.sequence, after),
              ),
            )
            .orderBy(asc(events.sequence))
            .limit(limit);
          const entries = rows.map((row) => {
            let payload: object = {};
            if (row.event.kind === "message.created") payload = { messageId: row.event.messageId };
            if (row.event.kind === "computer.state")
              payload = { ...(row.event.data as object), computerId: row.event.computerId };
            if (row.event.kind === "run.state")
              payload = { ...(row.event.data as object), runId: row.event.runId };
            if (row.event.kind === "card.created" || row.event.kind === "card.resolved")
              payload = {
                ...(row.event.data as object),
                runId: row.event.runId,
                requestId: row.event.requestId,
              };
            if (row.event.kind === "reply.segment") {
              payload = { segment: segmentView(row.segment!) };
            }
            const event = conversationEventSchema.parse({
              spaceId: row.event.spaceId,
              conversationId: row.event.conversationId,
              sequence: row.event.sequence,
              kind: row.event.kind,
              ...payload,
              createdAt: row.event.createdAt.toISOString(),
            });
            return { event, ...(row.message ? { message: message(row.message) } : {}) };
          });
          const cursor = entries.at(-1)?.event.sequence ?? after;
          return { status: "events", events: entries, cursor, hasMore: cursor < latest };
        },
        { isolationLevel: "repeatable read", accessMode: "read only" },
      );
    },
    async snapshot(scope, id) {
      return db.transaction(
        async (tx) => {
          const conversation = await requireConversation(tx, scope, id);
          const [counter] = await tx.select().from(counters).where(counterSelection(scope, id));
          const rows = await tx
            .select()
            .from(messages)
            .where(and(eq(messages.spaceId, scope.spaceId), eq(messages.conversationId, id)))
            .orderBy(asc(messages.sequence));
          return {
            conversation: conversationView(conversation),
            messages: rows.map(message),
            runs: (
              await tx
                .select()
                .from(runs)
                .where(and(eq(runs.spaceId, scope.spaceId), eq(runs.conversationId, id)))
                .orderBy(asc(runs.messageSequence))
            ).map(runView),
            segments: (
              await tx
                .select()
                .from(segments)
                .where(and(eq(segments.spaceId, scope.spaceId), eq(segments.conversationId, id)))
                .orderBy(asc(segments.sequence))
            ).map(segmentView),
            cursor: counter?.sequence ?? 0,
          };
        },
        { isolationLevel: "repeatable read", accessMode: "read only" },
      );
    },
    async retainAfter(scope, id, through) {
      await db.transaction(async (tx) => {
        const counter = await lock(tx, scope, id);
        if (eventCursorStatus(through, 0, counter.sequence) === "invalid-cursor")
          throw new InvalidConversationCursor();
        if (through <= counter.retainedAfter) return;
        await tx
          .delete(events)
          .where(
            and(
              eq(events.spaceId, scope.spaceId),
              eq(events.conversationId, id),
              lte(events.sequence, through),
            ),
          );
        await tx
          .update(counters)
          .set({ retainedAfter: through })
          .where(counterSelection(scope, id));
      });
    },
  };
}
