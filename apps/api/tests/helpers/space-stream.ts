import type { SpaceEvent } from "@raypx/core/spaces";
import type { SpaceFanout, SpaceNotice, SpaceScope } from "@raypx/spaces/server";
import { conversationFixture } from "./conversations.js";

/** Durable fixture log and independently lossy notification transport. */
export function spaceStreamFixture() {
  const base = conversationFixture();
  const log: SpaceEvent[] = [];
  const listeners = new Set<(notice: SpaceNotice) => void>();
  const spaceFanout: SpaceFanout = {
    async subscribe(listener) {
      listeners.add(listener);
      return async () => {
        listeners.delete(listener);
      };
    },
    async close() {
      listeners.clear();
    },
  };
  function notify(notice: SpaceNotice) {
    for (const listener of listeners) listener(notice);
  }
  return {
    ...base,
    spaceLog: log,
    spaceFanout,
    spaceEvents: {
      async events(_scope: SpaceScope, after: number, limit: number) {
        return log.filter((event) => event.id > after).slice(0, limit);
      },
    },
    appendSpace(
      event: Omit<Extract<SpaceEvent, { kind: "space.renamed" }>, "id" | "spaceId" | "createdAt">,
      publish = true,
    ) {
      const entry: SpaceEvent = {
        ...event,
        id: log.length + 1,
        spaceId: base.spaceId,
        createdAt: new Date().toISOString(),
      };
      log.push(entry);
      if (publish) notify({ spaceId: base.spaceId, sequence: entry.id, kind: entry.kind });
      return entry;
    },
    removeMemberActively(reason: "removed" | "left" = "removed") {
      base.removeMember();
      notify({
        spaceId: base.spaceId,
        sequence: log.length + 1,
        kind: "space.member.removed",
        accountId: "member",
        reason,
      });
    },
    deleteSpaceActively() {
      base.removeMember();
      notify({ spaceId: base.spaceId, sequence: 0, kind: "space.deleted" });
    },
  };
}
