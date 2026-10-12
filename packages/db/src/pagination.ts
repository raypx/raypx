import { DomainError, type CursorQuery, type CursorPage } from "@voidmix/core";
import { sql, type SQL, type AnyColumn } from "drizzle-orm";

export function timestampKey(column: AnyColumn) {
  return sql`date_trunc('milliseconds', ${column})`;
}
export function cursorPage(query: CursorQuery, scope: string) {
  const limit = query.limit ?? (query.cursor ? 50 : undefined);
  if (limit !== undefined && (!Number.isInteger(limit) || limit < 1 || limit > 100))
    throw new DomainError("BAD_REQUEST", "Invalid page size.");
  let after: { time: Date; id: string } | undefined;
  if (query.cursor !== undefined) {
    try {
      if (!/^[A-Za-z0-9_-]+$/.test(query.cursor)) throw new Error();
      const [version, savedScope, time, id] = JSON.parse(
        Buffer.from(query.cursor, "base64url").toString("utf8"),
      ) as unknown[];
      if (
        version !== 1 ||
        savedScope !== scope ||
        typeof time !== "string" ||
        typeof id !== "string" ||
        !id ||
        !Number.isFinite(Date.parse(time))
      )
        throw new Error();
      after = { time: new Date(time), id };
    } catch {
      throw new DomainError("BAD_REQUEST", "Invalid pagination cursor.");
    }
  }
  return {
    limit,
    seek(time: SQL, id: AnyColumn): SQL | undefined {
      return after
        ? sql`(${time}, ${id}) < (${after.time.toISOString()}::timestamptz, ${after.id})`
        : undefined;
    },
    finish<T extends { id: string }>(rows: T[], time: (row: T) => Date): CursorPage<T> {
      const items = limit === undefined ? rows : rows.slice(0, limit);
      const last = items.at(-1);
      const nextCursor =
        limit !== undefined && rows.length > limit && last
          ? Buffer.from(JSON.stringify([1, scope, time(last).toISOString(), last.id])).toString(
              "base64url",
            )
          : null;
      return { items, nextCursor };
    },
  };
}
