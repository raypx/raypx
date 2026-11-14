import { sql } from "drizzle-orm";
import type { Database } from "@raypx/database/connection";
import type { ConversationNotice } from "../conversations.js";
export const conversationChannel = "raypx_conversation_events";
/** Called inside the committing transaction: PostgreSQL delivers only after commit. */
export async function publishConversationNotice(
  tx: Pick<Database, "execute">,
  notice: ConversationNotice,
) {
  await tx.execute(sql`select pg_notify(${conversationChannel}, ${JSON.stringify(notice)})`);
}
