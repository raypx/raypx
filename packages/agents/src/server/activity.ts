import { sql } from "drizzle-orm";
import { conversationEvents, conversations } from "@raypx/database/schema";

/** One index-only lookup per selected conversation, independent of history length. */
export function lastConversationActivity() {
  return sql<Date | null>`(
    select ${conversationEvents.createdAt}
    from ${conversationEvents}
    where ${conversationEvents.spaceId} = ${conversations.spaceId}
      and ${conversationEvents.conversationId} = ${conversations.id}
    order by ${conversationEvents.sequence} desc
    limit 1
  )`.mapWith(conversationEvents.createdAt);
}
