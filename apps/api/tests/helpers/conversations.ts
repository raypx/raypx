import { vi } from "vitest";
import { conversationIdSchema } from "@raypx/core/agents";
import { messageSchema, conversationEventSchema } from "@raypx/core/conversation";
import { SpaceNotFound, spaceIdSchema } from "@raypx/core/spaces";
import type { AuthSession } from "@raypx/core/auth";
import type {
  ConversationFanout,
  ConversationNotice,
  ConversationsRepository,
  ConversationEventEntry,
} from "@raypx/agents/server";
import type { SpaceAccess, SpaceScope } from "@raypx/spaces/server";

export function conversationFixture() {
  const spaceId = spaceIdSchema.parse("space");
  const conversationId = conversationIdSchema.parse("conversation");
  const secondId = conversationIdSchema.parse("second");
  let member = true;
  let signedIn = true;
  let retainedAfter = 0;
  const logs = new Map<string, ConversationEventEntry[]>([
    [conversationId, []],
    [secondId, []],
  ]);
  const now = new Date().toISOString();
  const scope = {
    spaceId,
    member: { spaceId, accountId: "member", role: "owner", createdAt: now },
  } as SpaceScope;
  const resolve = vi.fn<SpaceAccess["resolve"]>(async (accountId, selected) => {
    if (!member || accountId !== "member" || selected !== spaceId) throw new SpaceNotFound();
    return scope;
  });
  const spaces: SpaceAccess = {
    resolve,
    list: async () => [],
    create: async () => {
      throw new Error("Unused");
    },
  };
  const readSession = vi.fn(async (): Promise<AuthSession | null> =>
    signedIn
      ? {
          user: {
            id: "member",
            name: "Member",
            email: "member@example.test",
            emailVerified: true,
            role: "member",
          },
          session: { id: "session", userId: "member", expiresAt: new Date(Date.now() + 60_000) },
        }
      : null,
  );
  const listeners = new Set<(notice: ConversationNotice) => void>();
  const fanout: ConversationFanout = {
    subscribe: async (listener) => {
      listeners.add(listener);
      return async () => {
        listeners.delete(listener);
      };
    },
    close: async () => {
      listeners.clear();
    },
  };
  function append(id = conversationId, notify = true) {
    const log = logs.get(id)!;
    const sequence = log.length + 1;
    const message = messageSchema.parse({
      id: `${id}-${sequence}`,
      spaceId,
      conversationId: id,
      sequence,
      author: { kind: "member", accountId: "member" },
      text: `Message ${sequence}`,
      createdAt: now,
    });
    const event = conversationEventSchema.parse({
      spaceId,
      conversationId: id,
      sequence,
      kind: "message.created",
      messageId: message.id,
      createdAt: now,
    });
    log.push({ message, event });
    if (notify) for (const listener of listeners) listener({ conversationId: id, sequence });
    return { message, event };
  }
  const events = vi.fn<ConversationsRepository["events"]>(async (selected, id, after, limit) => {
    const log = logs.get(id);
    if (selected.spaceId !== spaceId || !log) throw new SpaceNotFound();
    if (after < retainedAfter) return { status: "snapshot-required", cursor: log.length };
    const page = log.slice(after, after + limit);
    const cursor = page.at(-1)?.event.sequence ?? after;
    return { status: "events", events: page, cursor, hasMore: cursor < log.length };
  });
  const conversations: ConversationsRepository = {
    events,
    stop: async () => {
      throw new Error("Unused");
    },
    send: async () => {
      throw new Error("Unused");
    },
    snapshot: async () => {
      throw new Error("Unused");
    },
    retainAfter: async (_scope, _id, through) => {
      retainedAfter = through;
    },
  };
  return {
    spaceId,
    conversationId,
    secondId,
    spaces,
    scope,
    conversations,
    events,
    readSession,
    fanout,
    append,
    publish(entry: ConversationEventEntry) {
      logs.get(entry.event.conversationId)!.push(entry);
      for (const listener of listeners)
        listener({ conversationId: entry.event.conversationId, sequence: entry.event.sequence });
    },
    log: logs.get(conversationId)!,
    removeMember() {
      member = false;
    },
    signOut() {
      signedIn = false;
    },
    retain(through: number) {
      retainedAfter = through;
    },
  };
}
