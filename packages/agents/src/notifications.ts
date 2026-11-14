import type { MemberNotification, NotificationKey } from "@raypx/core/notifications";
import type { SpaceScope } from "@raypx/spaces/server";
import type { ConversationId } from "@raypx/core/agents";
export interface MemberNotificationsService {
  list(accountId: string): Promise<{ items: MemberNotification[]; truncated: boolean }>;
  read(accountId: string, key: NotificationKey): Promise<{ ok: true }>;
  viewed(scope: SpaceScope, conversationId: ConversationId): Promise<{ ok: true }>;
}
