import { connectDatabaseNotifications } from "@raypx/database/connection";
import type { ConversationFanout, ConversationNotice } from "../conversations.js";
import { conversationChannel } from "./notice.js";

/** Dedicated LISTEN connection, owned and closed by the backend runtime. */
export function createConversationFanout(url: string): ConversationFanout {
  const client = connectDatabaseNotifications(url);
  let closed: Promise<void> | undefined;
  return {
    async subscribe(listener) {
      const subscription = await client.listen(conversationChannel, (payload) => {
        try {
          const value = JSON.parse(payload) as ConversationNotice;
          if (
            typeof value.conversationId === "string" &&
            Number.isSafeInteger(value.sequence) &&
            value.sequence > 0
          )
            listener({ conversationId: value.conversationId, sequence: value.sequence });
        } catch {
          /* Malformed hints never alter a cursor; the next database read repairs a miss. */
        }
      });
      return subscription;
    },
    close: () => (closed ??= client.close()),
  };
}
