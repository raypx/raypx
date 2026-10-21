import { sql } from "drizzle-orm";
import type { Database } from "@raypx/database/connection";

export type RecordKind = "device" | "project" | "task" | "request" | "event" | "command" | "grant";
export interface ControlRecord {
  id: string;
  deviceId: string;
}
export interface ControlTransaction {
  sessionActive(id: string, now: Date): Promise<boolean>;
  get<T extends ControlRecord>(kind: RecordKind, id: string): Promise<T | undefined>;
  list<T extends ControlRecord>(kind: RecordKind, deviceId?: string): Promise<T[]>;
  put<T extends ControlRecord>(kind: RecordKind, value: T): Promise<T>;
  remove(kind: RecordKind, id: string): Promise<void>;
}
export interface ControlRepository {
  transaction<T>(userId: string, run: (tx: ControlTransaction) => Promise<T>): Promise<T>;
  findGrant(hash: string): Promise<{ userId: string } | undefined>;
}
const table = (kind: RecordKind) =>
  sql`${sql.identifier("raypx_foundation")}.${sql.identifier(`control_${kind}`)}`;

export function createControlRepository(database: Database): ControlRepository {
  return {
    async findGrant(hash) {
      const rows = await database.execute(
        sql`select user_id from raypx_foundation.control_grant where id = ${hash}`,
      );
      const row = rows[0];
      return row ? { userId: String(row.user_id) } : undefined;
    },
    transaction(userId, run) {
      return database.transaction(async (databaseTx) => {
        // A database-owned account lock serializes decisions across API instances.
        await databaseTx.execute(
          sql`insert into raypx_foundation.control_owner (user_id) values (${userId}) on conflict do nothing`,
        );
        await databaseTx.execute(
          sql`select user_id from raypx_foundation.control_owner where user_id = ${userId} for update`,
        );
        const tx: ControlTransaction = {
          async sessionActive(id, now) {
            const rows = await databaseTx.execute(
              sql`select id from raypx_foundation.session where id = ${id} and user_id = ${userId} and expires_at > ${now.toISOString()}::timestamptz`,
            );
            return rows.length > 0;
          },
          async get<T extends ControlRecord>(kind: RecordKind, id: string) {
            const rows = await databaseTx.execute(
              sql`select body from ${table(kind)} where user_id = ${userId} and id = ${id}`,
            );
            return rows[0]?.body as T | undefined;
          },
          async list<T extends ControlRecord>(kind: RecordKind, deviceId?: string) {
            const rows = await databaseTx.execute(
              sql`select body from ${table(kind)} where user_id = ${userId} ${deviceId === undefined ? sql`` : sql`and device_id = ${deviceId}`}`,
            );
            return rows.map((row) => row.body as T);
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
        };
        return run(tx);
      });
    },
  };
}
