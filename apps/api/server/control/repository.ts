import { normalizeTaskJson } from "@raypx/core/task-text";
import { and, asc, desc, eq, inArray, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { Database } from "@raypx/database/connection";
import {
  controlCommand,
  controlCredential,
  controlDevice,
  controlEvent,
  controlGrant,
  controlObservedRequest,
  controlObservedSession,
  controlProject,
  controlRequest,
  controlTask,
} from "@raypx/database/schema";

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
  pruneCommands(now: Date): Promise<void>;
  purgeObserved(deviceId: string): Promise<void>;
}
export type ControlReader = Omit<
  ControlTransaction,
  "put" | "remove" | "pruneEvents" | "pruneCommands" | "purgeObserved" | "revokeHostSecurity"
>;
export interface ControlRepository {
  read<T>(userId: string, run: (tx: ControlReader) => Promise<T>): Promise<T>;
  transaction<T>(userId: string, run: (tx: ControlTransaction) => Promise<T>): Promise<T>;
  findGrant(hash: string): Promise<{ userId: string } | undefined>;
  findCredential(hash: string): Promise<{ userId: string } | undefined>;
}
const tables = {
  device: controlDevice,
  project: controlProject,
  task: controlTask,
  request: controlRequest,
  event: controlEvent,
  command: controlCommand,
  grant: controlGrant,
  credential: controlCredential,
  observed_session: controlObservedSession,
  observed_request: controlObservedRequest,
} satisfies Record<RecordKind, typeof controlEvent>;
const table = (kind: RecordKind) => tables[kind];
export const CONTEXT_COMMAND_TTL_MS = 24 * 60 * 60 * 1000;

/** Build the production projection query, also used by real-PostgreSQL EXPLAIN tests. */
export function controlListQuery(
  database: Pick<Database, "select">,
  kind: RecordKind,
  userId: string,
  deviceId?: string,
  query: ControlQuery = {},
) {
  const record = table(kind);
  const device = alias(controlDevice, "d");
  const task = alias(controlTask, "task");
  const body = record.body;
  const activityOrder = sql`((${body}->'event'->'entry'->>'order')::bigint)`;
  const cursor = sql`((${body}->>'cursor')::bigint)`;
  const createdAt = sql`${body}->>'createdAt'`;
  const separator = query.beforeTask?.lastIndexOf(":") ?? -1;
  const orderBy =
    query.observedAt !== undefined
      ? [
          desc(sql`(${body}->>'status'='pending' and ${body}->>'expiresAt'>${query.observedAt})`),
          desc(createdAt),
          desc(record.id),
        ]
      : kind === "task"
        ? [desc(createdAt), desc(record.id)]
        : query.pendingApprovals
          ? [asc(sql`${body}->>'expiresAt'`), asc(record.id)]
          : kind === "event"
            ? [(query.descending ? desc : asc)(query.activity ? activityOrder : cursor)]
            : [];
  const statement = database
    .select({ body: query.summary ? sql`${body} - 'body' - 'questions' - 'decision'` : body })
    .from(record)
    .where(
      and(
        eq(record.userId, userId),
        deviceId === undefined ? undefined : eq(record.deviceId, deviceId),
        query.ids === undefined ? undefined : inArray(record.id, query.ids),
        query.observedAt === undefined
          ? undefined
          : sql`exists (select 1 from ${controlDevice} d where ${device.userId}=${userId} and ${device.id}=${record.deviceId} and ${device.body}->>'revoked'='false')`,
        query.beforeTask === undefined
          ? undefined
          : sql`(${createdAt},${record.id}) < (${query.beforeTask.slice(0, separator)},${query.beforeTask.slice(separator + 1)})`,
        !query.pendingApprovals
          ? undefined
          : sql`${body}->>'status' in ('pending','decided') and exists (select 1 from ${controlTask} task where ${task.userId}=${userId} and ${task.id}=${body}->>'taskId' and ${task.body}->>'status' in ('pending','running','waiting','cancelling'))`,
        query.taskId === undefined ? undefined : sql`${body}->>'taskId'=${query.taskId}`,
        query.activity === undefined
          ? undefined
          : query.activity
            ? sql`${body}->'event'->>'kind'='activity'`
            : sql`${body}->'event'->>'kind' not in ('activity','activity_delta')`,
        query.streamId === undefined ? undefined : sql`${body}->>'streamId'=${query.streamId}`,
        query.after === undefined ? undefined : sql`${cursor}>${query.after}`,
        query.beforeActivity === undefined
          ? undefined
          : sql`${activityOrder}<${query.beforeActivity}`,
      ),
    )
    .orderBy(...orderBy);
  return query.limit === undefined ? statement : statement.limit(query.limit);
}

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

/** Remove private replay bodies, retaining compact receipts so unknown delivery cannot replay. */
export function contextCommandPrune(now: Date | SQL, userId?: string) {
  const time = now instanceof Date ? sql`${now.toISOString()}::timestamptz` : now;
  const captured = sql`coalesce(c.body->>'capturedAt','')`;
  const cutoff = sql`to_char((${time} - ${CONTEXT_COMMAND_TTL_MS} * interval '1 millisecond') at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;
  const candidates =
    userId === undefined
      ? sql`select c.ctid as pointer,c.user_id,c.id from raypx_foundation.control_command c
        where jsonb_typeof(c.body->'context')='object' and ${captured}<=${cutoff}
        order by ${captured},c.user_id,c.id limit 1000 for update of c skip locked`
      : sql`with replay as materialized (
        select c.ctid as pointer,c.user_id,c.id,${captured} as captured_at,
          row_number() over (order by ${captured} desc,c.id desc) as position,
          sum(octet_length(c.body::text)) over (order by ${captured} desc,c.id desc) as bytes
        from raypx_foundation.control_command c
        where c.user_id=${userId} and jsonb_typeof(c.body->'context')='object')
      select c.ctid as pointer,c.user_id,c.id from raypx_foundation.control_command c
        inner join replay r on c.ctid=r.pointer and c.user_id=r.user_id
        where c.user_id=${userId} and jsonb_typeof(c.body->'context')='object'
          and (r.captured_at<=${cutoff} or r.position>4096 or r.bytes>8388608)
        order by r.captured_at,c.id limit 1000 for update of c skip locked`;
  return sql`with candidates as materialized (${candidates}), compacted as (
      update raypx_foundation.control_command c set body=jsonb_strip_nulls(jsonb_build_object(
        'id',c.id,'deviceId',c.device_id,'capturedAt',${captured},'compacted',true,
        'requestHash',case when c.body->>'requestHash' ~ '^[0-9a-f]{64}$' then c.body->>'requestHash' else null end))
      from candidates p where c.ctid=p.pointer and c.user_id=p.user_id and c.id=p.id
        ${userId === undefined ? sql`` : sql`and c.user_id=${userId}`} returning 1
    ) select count(*)::integer as count from compacted`;
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
            const rows = await databaseTx.execute<{ version: string }>(
              sql`select md5(coalesce(string_agg(id || ':' || coalesce(password,''), ',' order by id),'') || ':' || coalesce((select security_epoch::text from raypx_foundation.control_owner where user_id=${userId}),'0')) as version from raypx_foundation.account where user_id=${userId}`,
            );
            return rows[0]!.version;
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
            const rows = await databaseTx.execute<{ body: unknown }>(
              sql`select body from ${table(kind)} where user_id = ${userId} and id = ${id}`,
            );
            return rows[0]?.body as R | undefined;
          },
          async list<R extends ControlRecord>(
            kind: RecordKind,
            deviceId?: string,
            query: ControlQuery = {},
          ) {
            const rows = await controlListQuery(databaseTx, kind, userId, deviceId, query);
            return rows.map((row) => row.body as R);
          },
          async put(kind, value) {
            value = normalizeTaskJson(value);
            await databaseTx.execute(
              sql`insert into ${table(kind)} (id, user_id, device_id, body) values (${value.id}, ${userId}, ${value.deviceId}, ${value}::jsonb) on conflict (user_id, id) do update set body = excluded.body, device_id = excluded.device_id`,
            );
            return value;
          },
          async remove(kind, id) {
            await databaseTx.execute(
              sql`delete from ${table(kind)} where user_id = ${userId} and id = ${id}`,
            );
          },
          async pruneCommands(now) {
            await databaseTx.execute(contextCommandPrune(now, userId));
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
      const rows = await database.execute<{ user_id: string }>(
        sql`select user_id from raypx_foundation.control_grant where id = ${hash}`,
      );
      const row = rows[0];
      return row ? { userId: row.user_id } : undefined;
    },
    async findCredential(hash) {
      const rows = await database.execute<{ user_id: string }>(
        sql`select user_id from raypx_foundation.control_credential where id=${hash}`,
      );
      return rows[0] ? { userId: rows[0].user_id } : undefined;
    },
  };
}
