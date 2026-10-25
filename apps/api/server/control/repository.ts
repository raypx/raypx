import { normalizeTaskJson } from "@raypx/contracts/tasks";
import { sql } from "drizzle-orm";
import type { Database } from "@raypx/database/connection";

export type RecordKind =
  | "device"
  | "project"
  | "task"
  | "request"
  | "event"
  | "command"
  | "grant"
  | "credential"
  | "observed_session"
  | "observed_request";
export interface ControlRecord {
  id: string;
  deviceId: string;
}
export interface ControlQuery {
  taskId?: string;
  beforeTask?: string;
  pendingApprovals?: boolean;
  activity?: boolean;
  after?: number;
  beforeActivity?: number;
  limit?: number;
  streamId?: string;
  descending?: boolean;
  ids?: string[];
  observedAt?: string;
  summary?: boolean;
}
export interface ControlTransaction {
  sessionActive(id: string, now: Date): Promise<boolean>;
  securityVersion(): Promise<string>;
  hostSessionAllowed(createdAt: Date): Promise<boolean>;
  revokeHostSecurity(): Promise<void>;
  get<T extends ControlRecord>(kind: RecordKind, id: string): Promise<T | undefined>;
  list<T extends ControlRecord>(
    kind: RecordKind,
    deviceId?: string,
    query?: ControlQuery,
  ): Promise<T[]>;
  put<T extends ControlRecord>(kind: RecordKind, value: T): Promise<T>;
  remove(kind: RecordKind, id: string): Promise<void>;
  pruneEvents(deviceId: string, streamId: string, orphans?: boolean): Promise<void>;
  purgeObserved(deviceId: string): Promise<void>;
}
export type ControlReader = Omit<
  ControlTransaction,
  "put" | "remove" | "pruneEvents" | "purgeObserved" | "revokeHostSecurity"
>;
export interface ControlRepository {
  read<T>(userId: string, run: (tx: ControlReader) => Promise<T>): Promise<T>;
  transaction<T>(userId: string, run: (tx: ControlTransaction) => Promise<T>): Promise<T>;
  findGrant(hash: string): Promise<{ userId: string } | undefined>;
  findCredential(hash: string): Promise<{ userId: string } | undefined>;
}
const table = (kind: RecordKind) =>
  sql`${sql.identifier("raypx_foundation")}.${sql.identifier(`control_${kind}`)}`;

/** Shared by production execution and the real-PostgreSQL EXPLAIN gate. */
export function eventWindowPrune(userId: string, deviceId: string, streamId: string) {
  // Keep physical row pointers within this statement. Joining by id can make
  // stale per-device statistics rescan the materialized window for every row.
  return sql`with replay as materialized (
          select ctid as pointer, body->>'streamId' as stream_id, row_number() over (order by (body->>'cursor')::bigint desc) as position, sum(octet_length(body::text)) over (order by (body->>'cursor')::bigint desc) as bytes
          from raypx_foundation.control_event where user_id=${userId} and device_id=${deviceId} and body->'event'->>'kind' NOT IN ('activity','activity_delta'))
          delete from raypx_foundation.control_event e using replay r where e.user_id=${userId} and e.device_id=${deviceId} and e.ctid=r.pointer
          and (r.stream_id != ${streamId} or r.position>4096 or r.bytes>8388608)`;
}

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
          async purgeObserved(deviceId) {
            for (const kind of ["observed_request", "observed_session"] as const)
              await databaseTx.execute(
                sql`delete from ${table(kind)} where user_id=${userId} and device_id=${deviceId}`,
              );
          },
          async sessionActive(id, now) {
            const rows = await databaseTx.execute(
              sql`select id from raypx_foundation.session where id = ${id} and user_id = ${userId} and expires_at > ${now.toISOString()}::timestamptz`,
            );
            return rows.length > 0;
          },
          async securityVersion() {
            // Password changes/reset invalidate host credentials even if cookie cleanup fails.
            const rows = await databaseTx.execute(
              sql`select md5(coalesce(string_agg(id || ':' || coalesce(password,''), ',' order by id),'') || ':' || coalesce((select security_epoch::text from raypx_foundation.control_owner where user_id=${userId}),'0')) as version from raypx_foundation.account where user_id=${userId}`,
            );
            return String(rows[0]!.version);
          },
          async hostSessionAllowed(createdAt) {
            const rows = await databaseTx.execute(
              sql`select user_id from raypx_foundation.control_owner where user_id=${userId} and (security_revoked_at is null or security_revoked_at < ${createdAt.toISOString()}::timestamptz)`,
            );
            return rows.length > 0;
          },
          async revokeHostSecurity() {
            await databaseTx.execute(
              sql`update raypx_foundation.control_owner set security_epoch=security_epoch+1, security_revoked_at=clock_timestamp() where user_id=${userId}`,
            );
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
            const separator = query.beforeTask?.lastIndexOf(":") ?? -1;
            const beforeDate = query.beforeTask?.slice(0, separator);
            const beforeId = query.beforeTask?.slice(separator + 1);
            const rows =
              await databaseTx.execute(sql`select ${query.summary ? sql`body - 'body' - 'questions' - 'decision'` : sql`body`} as body from ${table(kind)} where user_id = ${userId}
          ${deviceId === undefined ? sql`` : sql`and device_id = ${deviceId}`}
          ${
            query.ids === undefined
              ? sql``
              : query.ids.length
                ? sql`and id in (${sql.join(
                    query.ids.map((id) => sql`${id}`),
                    sql`,`,
                  )})`
                : sql`and false`
          }
          ${query.observedAt === undefined ? sql`` : sql`and exists (select 1 from raypx_foundation.control_device d where d.user_id=${userId} and d.id=${table(kind)}.device_id and d.body->>'revoked'='false')`}
          ${query.beforeTask === undefined ? sql`` : sql`and (body->>'createdAt',id) < (${beforeDate},${beforeId})`}
          ${!query.pendingApprovals ? sql`` : sql`and body->>'status' in ('pending','decided') and exists (select 1 from raypx_foundation.control_task task where task.user_id=${userId} and task.id=${table(kind)}.body->>'taskId' and task.body->>'status' in ('pending','running','waiting','cancelling'))`}
          ${query.taskId === undefined ? sql`` : sql`and body->>'taskId' = ${query.taskId}`}
          ${query.activity === undefined ? sql`` : query.activity ? sql`and body->'event'->>'kind' = 'activity'` : sql`and body->'event'->>'kind' NOT IN ('activity','activity_delta')`}
          ${query.streamId === undefined ? sql`` : sql`and body->>'streamId' = ${query.streamId}`}
          ${query.after === undefined ? sql`` : sql`and ${cursor} > ${query.after}`}
          ${query.beforeActivity === undefined ? sql`` : sql`and ${activityOrder} < ${query.beforeActivity}`}
          ${query.observedAt !== undefined ? sql`order by (body->>'status'='pending' and body->>'expiresAt'>${query.observedAt}) desc,body->>'createdAt' desc,id desc` : kind === "task" ? sql`order by body->>'createdAt' desc,id desc` : query.pendingApprovals ? sql`order by body->>'expiresAt' asc,id asc` : kind === "event" ? sql`order by ${query.activity ? activityOrder : cursor} ${query.descending ? sql`desc` : sql`asc`}` : sql``}
          ${query.limit === undefined ? sql`` : sql`limit ${query.limit}`}`);
            return rows.map((row) => row.body as R);
          },
          async put(kind, value) {
            value = normalizeTaskJson(value);
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
            await databaseTx.execute(eventWindowPrune(userId, deviceId, streamId));
            // Remove pre-upgrade delta replay rows in bounded batches. New deltas
            // update only the authoritative activity projection.
            await databaseTx.execute(
              sql`delete from raypx_foundation.control_event where user_id=${userId} and device_id=${deviceId} and id in (select id from raypx_foundation.control_event where user_id=${userId} and device_id=${deviceId} and body->'event'->>'kind'='activity_delta' limit 1000)`,
            );
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
    async findCredential(hash) {
      const rows = await database.execute(
        sql`select user_id from raypx_foundation.control_credential where id=${hash}`,
      );
      return rows[0] ? { userId: String(rows[0].user_id) } : undefined;
    },
  };
}
