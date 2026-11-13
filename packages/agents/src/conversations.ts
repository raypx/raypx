import type { Conversation, ConversationId } from "@raypx/core/agents";
import type { ConversationEvent, MemberMessageInput, Message } from "@raypx/core/conversation";
import type { SpaceScope } from "@raypx/spaces/server";

export interface ConversationEventEntry {
  event: ConversationEvent;
  message: Message;
}
export type ConversationEvents =
  | { status: "events"; events: ConversationEventEntry[]; cursor: number; hasMore: boolean }
  | { status: "snapshot-required"; cursor: number };
export interface ConversationSnapshot {
  conversation: Conversation;
  messages: Message[];
  cursor: number;
}
export interface ConversationsRepository {
  send(scope: SpaceScope, id: ConversationId, input: MemberMessageInput): Promise<Message>;
  events(
    scope: SpaceScope,
    id: ConversationId,
    after: number,
    limit: number,
  ): Promise<ConversationEvents>;
  snapshot(scope: SpaceScope, id: ConversationId): Promise<ConversationSnapshot>;
  /** Maintenance only. Removes a prefix atomically with its replay boundary; messages remain. */
  retainAfter(scope: SpaceScope, id: ConversationId, through: number): Promise<void>;
}
/** A hint, never the source of truth. No Space, account or message content is published. */
export interface ConversationNotice {
  conversationId: string;
  sequence: number;
}
export interface ConversationFanout {
  subscribe(listener: (notice: ConversationNotice) => void): Promise<() => Promise<void>>;
  close(): Promise<void>;
}
