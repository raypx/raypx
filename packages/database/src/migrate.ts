import { sql } from "drizzle-orm";
import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { connectDatabase, type Database } from "./connection.js";

type MigrationTransaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

export async function migrateDatabase(
  databaseUrl: string,
  migrationsFolder = fileURLToPath(new URL("../drizzle-foundation", import.meta.url)),
  afterSchema?: (tx: MigrationTransaction) => Promise<void>,
): Promise<void> {
  const connection = connectDatabase(databaseUrl, { max: 1 });
  try {
    await connection.db.transaction(async (tx) => {
      // Hold one transaction/connection across Drizzle's ledger read and all DDL.
      // Startup instances and explicit migration jobs share this database-scoped lock.
      await tx.execute(sql`set local lock_timeout = '120s'`);
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext('raypx_foundation_migrations'), 0)`,
      );
      await tx.execute(sql`set local lock_timeout = '10s'`);
      // Move the ledger before Drizzle reads it so applied migrations retain their IDs and hashes.
      await tx.execute(sql`
        do $$
        begin
          if to_regclass('raypx_foundation_migrations.__drizzle_migrations') is not null then
            alter table raypx_foundation_migrations.__drizzle_migrations set schema public;
            drop schema raypx_foundation_migrations;
          end if;
        end
        $$;
      `);
      await migrate(tx, {
        migrationsFolder,
        migrationsSchema: "public",
      });
      await afterSchema?.(tx);
    });
  } finally {
    await connection.close();
  }
}
