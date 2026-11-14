import { and, eq, sql } from "drizzle-orm";
import type { Database } from "@raypx/database/connection";
import {
  conversationCounters,
  conversationEvents,
  conversationMemberNames,
  conversationMessages,
} from "@raypx/database/schema";
import type { ConversationId } from "@raypx/core/agents";
import type { SpaceScope } from "@raypx/spaces/server";

/** Batch-only fixture data: no execution, provider calls or operator database access. */
export async function seedBrowserHistory(
  db: Database,
  scope: SpaceScope,
  conversationId: ConversationId,
  displayName: string,
  count: number,
  prefix: string,
  append = false,
) {
  return db.transaction(async (tx) => {
    const selection = and(
      eq(conversationCounters.spaceId, scope.spaceId),
      eq(conversationCounters.conversationId, conversationId),
    );
    await tx
      .insert(conversationCounters)
      .values({ spaceId: scope.spaceId, conversationId })
      .onConflictDoNothing();
    const [counter] = await tx.select().from(conversationCounters).where(selection).for("update");
    if (!counter || (!append && counter.sequence !== 0)) return null;
    const startSequence = counter.sequence;
    const createdAt = new Date();
    const messages = Array.from({ length: count }, (_, index) => ({
      spaceId: scope.spaceId,
      conversationId,
      id: crypto.randomUUID(),
      sequence: startSequence + index + 1,
      authorAccountId: scope.member.accountId,
      idempotencyKey: crypto.randomUUID(),
      text: `${prefix} ${String(index + 1).padStart(3, "0")} — A message in the continuing conversation.`,
      createdAt,
    }));
    await tx.insert(conversationMessages).values(messages);
    await tx.insert(conversationEvents).values(
      messages.map((message) => ({
        spaceId: scope.spaceId,
        conversationId,
        sequence: message.sequence,
        messageId: message.id,
        kind: "message.created" as const,
        createdAt,
      })),
    );
    await tx
      .insert(conversationMemberNames)
      .values({
        spaceId: scope.spaceId,
        conversationId,
        accountId: scope.member.accountId,
        displayName,
      })
      .onConflictDoNothing();
    const finalSequence = startSequence + count;
    await tx.update(conversationCounters).set({ sequence: finalSequence }).where(selection);
    await tx.execute(
      sql`select pg_notify('raypx_conversation_events', ${JSON.stringify({ conversationId, sequence: finalSequence })})`,
    );
    return messages.map(({ id, sequence, text }) => ({ id, sequence, text }));
  });
}
