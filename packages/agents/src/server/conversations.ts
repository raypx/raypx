import { and, asc, eq, gt, lte, sql } from "drizzle-orm";
import type { Database } from "@raypx/database/connection";
import {
  conversations,
  conversationCounters as counters,
  conversationMessages as messages,
  conversationEvents as events,
} from "@raypx/database/schema";
import type { ConversationId } from "@raypx/core/agents";
import {
  eventCursorStatus,
  InvalidConversationCursor,
  memberMessageInputSchema,
  messageSchema,
  conversationEventSchema,
} from "@raypx/core/conversation";
import { normalizeTaskJson } from "@raypx/core/task-text";
import { SpaceNotFound } from "@raypx/core/spaces";
import type { SpaceScope } from "@raypx/spaces/server";
import type { ConversationsRepository, ConversationNotice } from "../conversations.js";
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
export function createConversationsRepository(
  db: Database,
  publish = publishConversationNotice,
): ConversationsRepository {
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
  return {
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
        await tx.update(counters).set({ sequence }).where(counterSelection(scope, id));
        await publish(tx, { conversationId: id, sequence });
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
            .select({ event: events, message: messages })
            .from(events)
            .innerJoin(
              messages,
              and(
                eq(messages.spaceId, events.spaceId),
                eq(messages.conversationId, events.conversationId),
                eq(messages.id, events.messageId),
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
          const entries = rows.map((row) => ({
            event: conversationEventSchema.parse({
              ...row.event,
              createdAt: row.event.createdAt.toISOString(),
            }),
            message: message(row.message),
          }));
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
