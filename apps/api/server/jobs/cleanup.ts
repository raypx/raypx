import type { Database } from "@raypx/database/connection";
import {
  controlObservedRequest,
  controlObservedSession,
  controlDevice,
  rateLimit,
  session,
  verification,
} from "@raypx/database/schema";
import { sql } from "drizzle-orm";
import type { ApiLogging } from "../logging.js";
import type { ConfigurationReader } from "../configuration/types.js";
import { contextCommandPrune } from "../control/repository.js";

export function createCleanupJob({
  db,
  logger,
  configuration,
  enabled,
}: {
  db: Database;
  logger: ApiLogging;
  configuration: ConfigurationReader;
  enabled: boolean;
}): () => Promise<CleanupResult> {
  return () => runCleanupJob(db, logger, enabled, configuration);
}

// Transaction-scoped namespace shared by all Node processes and Worker isolates.
export const cleanupLock = [0x72797078, 1] as const;
export interface CleanupResult {
  status: "completed" | "skipped" | "disabled";
  sessions: number;
  verifications: number;
  rateLimits: number;
  observedRequests: number;
  observedSessions: number;
  contextCommands: number;
}

/** Repeated runs are safe; every transaction removes at most 1,000 rows per table. */
export async function cleanupExpired(db: Database): Promise<CleanupResult> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`set local statement_timeout = '5s'`);
    await tx.execute(sql`set local lock_timeout = '1s'`);
    const [lock] = await tx.execute<{ acquired: boolean }>(
      sql`select pg_try_advisory_xact_lock(${cleanupLock[0]}, ${cleanupLock[1]}) as acquired`,
    );
    const result: CleanupResult = {
      status: lock?.acquired ? "completed" : "skipped",
      sessions: 0,
      verifications: 0,
      rateLimits: 0,
      observedRequests: 0,
      observedSessions: 0,
      contextCommands: 0,
    };
    if (!lock?.acquired) return result;

    // Database time is authoritative. Keep a full day after token/session expiry;
    // stale rate limits retain an hour, well beyond the shared 60-second window.
    const policies = [
      {
        key: "sessions",
        table: session,
        order: session.expiresAt,
        expired: sql`${session.expiresAt} < transaction_timestamp() - interval '1 day'`,
      },
      {
        key: "verifications",
        table: verification,
        order: verification.expiresAt,
        expired: sql`${verification.expiresAt} < transaction_timestamp() - interval '1 day'`,
      },
      {
        key: "rateLimits",
        table: rateLimit,
        order: rateLimit.lastRequest,
        expired: sql`${rateLimit.lastRequest} < extract(epoch from transaction_timestamp()) * 1000 - 3600000`,
      },
    ] as const;
    for (const { key, table, order, expired } of policies) {
      const [row] = await tx.execute<{ count: number }>(sql`
        with candidates as (
          select ${table.id} from ${table}
          where ${expired} order by ${order}
          limit 1000 for update skip locked
        ), removed as (
          delete from ${table}
          where ${table.id} in (select id from candidates) and ${expired}
          returning 1
        ) select count(*)::integer as count from removed
      `);
      result[key] = row!.count;
    }
    // Repair data retained by older revocation code. Composite identity and
    // device scope prevent cross-account deletion; managed history is separate.
    for (const [key, table] of [
      ["observedRequests", controlObservedRequest],
      ["observedSessions", controlObservedSession],
    ] as const) {
      const [row] = await tx.execute<{ count: number }>(sql`
        with candidates as (
          select r.user_id, r.id from ${table} r
          where exists (select 1 from ${controlDevice} d where d.user_id=r.user_id and d.id=r.device_id and d.body->>'revoked'='true')
          order by r.user_id, r.id limit 1000 for update of r skip locked
        ), removed as (
          delete from ${table} r using candidates c where r.user_id=c.user_id and r.id=c.id returning 1
        ) select count(*)::integer as count from removed`);
      result[key] = row!.count;
    }
    const [commands] = await tx.execute<{ count: number }>(
      contextCommandPrune(sql`transaction_timestamp()`),
    );
    result.contextCommands = commands!.count;
    return result;
  });
}

export async function runCleanupJob(
  db: Database,
  logger: ApiLogging,
  enabled: boolean,
  configuration?: ConfigurationReader,
): Promise<CleanupResult> {
  const event = logger.createLogger({ operation: "job.cleanup" });
  try {
    const shouldRun =
      enabled && (!configuration || (await configuration.read()).values.cleanupEnabled);
    const result: CleanupResult = shouldRun
      ? await cleanupExpired(db)
      : {
          status: "disabled",
          sessions: 0,
          verifications: 0,
          rateLimits: 0,
          observedRequests: 0,
          observedSessions: 0,
          contextCommands: 0,
        };
    event.emit({
      status: 200,
      job: {
        name: "maintenance:cleanup",
        status: result.status,
        sessions: String(result.sessions),
        verifications: String(result.verifications),
        rateLimits: String(result.rateLimits),
        observedRequests: String(result.observedRequests),
        observedSessions: String(result.observedSessions),
        contextReceipts: String(result.contextCommands),
      },
    });
    return result;
  } catch {
    // Nitro also logs task failures. Never propagate driver errors or SQL parameters.
    const error = new Error("Cleanup job failed");
    event.error(error);
    event.emit({ status: 500, code: "JOB_FAILED" });
    throw error;
  }
}
