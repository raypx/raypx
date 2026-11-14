import { connectDatabaseNotifications } from "@raypx/database/connection";
import type { SpaceFanout, SpaceNotice } from "../server.js";
const kinds = new Set([
  "space.member.joined",
  "space.member.removed",
  "space.member.role_changed",
  "space.renamed",
  "space.deleted",
  "page.created",
  "page.updated",
  "page.deleted",
]);

/** Content-free hints; replay and membership checks still read PostgreSQL. */
export function createSpaceFanout(url: string): SpaceFanout {
  const client = connectDatabaseNotifications(url);
  let closed: Promise<void> | undefined;
  return {
    async subscribe(listener) {
      return client.listen("raypx_space_events", (payload) => {
        try {
          const value = JSON.parse(payload) as SpaceNotice | null;
          if (
            !value ||
            typeof value.spaceId !== "string" ||
            !Number.isSafeInteger(value.sequence) ||
            value.sequence < 0 ||
            !kinds.has(value.kind)
          )
            return;
          listener({
            spaceId: value.spaceId,
            sequence: value.sequence,
            kind: value.kind,
            ...(typeof value.accountId === "string" ? { accountId: value.accountId } : {}),
            ...(value.reason === "removed" || value.reason === "left"
              ? { reason: value.reason }
              : {}),
          });
        } catch {
          // Missed or invalid hints are repaired by the normal database poll.
        }
      });
    },
    close: () => (closed ??= client.close()),
  };
}
