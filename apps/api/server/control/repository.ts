import { sql } from "drizzle-orm";
import type { Database } from "@raypx/database/connection";

export type RecordKind = "device" | "project" | "task" | "request" | "event" | "command" | "grant";
export interface ControlRecord {
  id: string;
  deviceId: string;
}
export interface ControlQuery {
  taskId?: string;
  activity?: boolean;
  after?: number;
  beforeActivity?: number;
  limit?: number;
  streamId?: string;
  descending?: boolean;
}
export interface ControlTransaction {
  sessionActive(id: string, now: Date): Promise<boolean>;
  get<T extends ControlRecord>(kind: RecordKind, id: string): Promise<T | undefined>;
  list<T extends ControlRecord>(
    kind: RecordKind,
    deviceId?: string,
    query?: ControlQuery,
  ): Promise<T[]>;
  put<T extends ControlRecord>(kind: RecordKind, value: T): Promise<T>;
  remove(kind: RecordKind, id: string): Promise<void>;
  pruneEvents(deviceId: string, streamId: string, orphans?: boolean): Promise<void>;
}
export type ControlReader = Omit<ControlTransaction, "put" | "remove" | "pruneEvents">;
export interface ControlRepository {
  read<T>(userId: string, run: (tx: ControlReader) => Promise<T>): Promise<T>;
  transaction<T>(userId: string, run: (tx: ControlTransaction) => Promise<T>): Promise<T>;
  findGrant(hash: string): Promise<{ userId: string } | undefined>;
}
const table = (kind: RecordKind) =>
  sql`${sql.identifier("raypx_foundation")}.${sql.identifier(`control_${kind}`)}`;

export function createControlRepository(database: Database): ControlRepository {
  const execute = <T>(
    userId: string,
    readOnly: boolean,
    run: (tx: ControlTransaction) => Promise<T>,
  ) =>
    database.transaction(
      async (databaseTx) => {
        if (!readOnly) {
          await databaseTx.execute(
            sql`insert into raypx_foundation.control_owner (user_id) values (${userId}) on conflict do nothing`,
          );
          await databaseTx.execute(
            sql`select user_id from raypx_foundation.control_owner where user_id = ${userId} for update`,
          );
        }
        const tx: ControlTransaction = {
          async sessionActive(id, now) {
            const rows = await databaseTx.execute(
              sql`select id from raypx_foundation.session where id = ${id} and user_id = ${userId} and expires_at > ${now.toISOString()}::timestamptz`,
            );
            return rows.length > 0;
          },
          async get<R extends ControlRecord>(kind: RecordKind, id: string) {
            const rows = await databaseTx.execute(
              sql`select body from ${table(kind)} where user_id = ${userId} and id = ${id}`,
            );
            return rows[0]?.body as R | undefined;
          },
          async list<R extends ControlRecord>(
            kind: RecordKind,
            deviceId?: string,
            query: ControlQuery = {},
          ) {
            const activityOrder = sql`((body->'event'->'entry'->>'order')::bigint)`;
            const cursor = sql`((body->>'cursor')::bigint)`;
            const rows =
              await databaseTx.execute(sql`select body from ${table(kind)} where user_id = ${userId}
          ${deviceId === undefined ? sql`` : sql`and device_id = ${deviceId}`}
          ${query.taskId === undefined ? sql`` : sql`and body->>'taskId' = ${query.taskId}`}
          ${query.activity === undefined ? sql`` : query.activity ? sql`and body->'event'->>'kind' = 'activity'` : sql`and body->'event'->>'kind' NOT IN ('activity','activity_delta')`}
          ${query.streamId === undefined ? sql`` : sql`and body->>'streamId' = ${query.streamId}`}
          ${query.after === undefined ? sql`` : sql`and ${cursor} > ${query.after}`}
          ${query.beforeActivity === undefined ? sql`` : sql`and ${activityOrder} < ${query.beforeActivity}`}
          ${kind !== "event" ? sql`` : sql`order by ${query.activity ? activityOrder : cursor} ${query.descending ? sql`desc` : sql`asc`}`}
          ${query.limit === undefined ? sql`` : sql`limit ${query.limit}`}`);
            return rows.map((row) => row.body as R);
          },
          async put(kind, value) {
            await databaseTx.execute(
              sql`insert into ${table(kind)} (id, user_id, device_id, body) values (${value.id}, ${userId}, ${value.deviceId}, ${JSON.stringify(value)}::jsonb) on conflict (user_id, id) do update set body = excluded.body, device_id = excluded.device_id`,
            );
            return value;
          },
          async remove(kind, id) {
            await databaseTx.execute(
              sql`delete from ${table(kind)} where user_id = ${userId} and id = ${id}`,
            );
          },
          async pruneEvents(deviceId, streamId, orphans = false) {
            await databaseTx.execute(sql`delete from raypx_foundation.control_event where user_id=${userId} and device_id=${deviceId} and id in (
          select id from (select id, body, row_number() over (order by (body->>'cursor')::bigint desc) as position, sum(octet_length(body::text)) over (order by (body->>'cursor')::bigint desc) as bytes
          from raypx_foundation.control_event where user_id=${userId} and device_id=${deviceId} and body->'event'->>'kind' != 'activity') replay
          where body->>'streamId' != ${streamId} or position>4096 or bytes>8388608)`);
            if (orphans)
              await databaseTx.execute(
                sql`delete from raypx_foundation.control_event where user_id=${userId} and id in (select e.id from raypx_foundation.control_event e where e.user_id=${userId} and e.device_id=${deviceId} and not exists (select 1 from raypx_foundation.control_task t where t.user_id=e.user_id and t.id=e.body->>'taskId') limit 1000)`,
              );
          },
        };
        return run(tx);
      },
      readOnly ? { isolationLevel: "repeatable read", accessMode: "read only" } : undefined,
    );
  return {
    read: (userId, run) => execute(userId, true, run),
    transaction: (userId, run) => execute(userId, false, run),
    async findGrant(hash) {
      const rows = await database.execute(
        sql`select user_id from raypx_foundation.control_grant where id = ${hash}`,
      );
      const row = rows[0];
      return row ? { userId: String(row.user_id) } : undefined;
    },
  };
}
