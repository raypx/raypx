import type { AdministrationQueries } from "./types.ts";
import type { Database } from "@raypx/database/connection";
import { adminAudit, user } from "@raypx/database/schema";
import { and, desc, eq, gte, lt, or, sql } from "drizzle-orm";
import { auditEntrySchema, type AuditEntry, type AuditFilter } from "@raypx/contracts/api";
import type { AuditIntent, AuditJournal, AuditOperation } from "./audit.ts";
import { AuditUnavailable } from "./audit.ts";

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
type Changes = Pick<AuditEntry, "before" | "after" | "targetId">;
/** A management write must use this transaction for both its mutation and its terminal audit. */
export async function writeAuditSuccess(
  tx: Transaction,
  operation: AuditOperation,
  changes: Changes,
) {
  try {
    const rows = await tx
      .update(adminAudit)
      .set({ ...changes, outcome: "success", completedAt: sql`now()` })
      .where(and(eq(adminAudit.id, operation.id), eq(adminAudit.outcome, "pending")))
      .returning({ id: adminAudit.id });
    if (rows.length !== 1) throw new AuditUnavailable();
  } catch {
    operation.auditUnavailable = true;
    throw new AuditUnavailable();
  }
}
export function createAdministrationRepository(db: Database) {
  return {
    async begin(intent: AuditIntent) {
      const id = crypto.randomUUID();
      await db.insert(adminAudit).values({ id, ...intent });
      return id;
    },
    async finish(id: string, outcome: "failed" | "rejected", errorCode: string) {
      await db
        .update(adminAudit)
        .set({ outcome, errorCode, completedAt: sql`now()` })
        .where(and(eq(adminAudit.id, id), eq(adminAudit.outcome, "pending")));
    },
    async overview(days: 7 | 30) {
      const now = new Date();
      const start = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - days + 1),
      );
      const [totals] = await db
        .select({
          totalUsers: sql<number>`count(*)::integer`,
          verifiedUsers: sql<number>`count(*) filter (where ${user.emailVerified})::integer`,
          newUsers: sql<number>`count(*) filter (where ${user.createdAt} >= ${start.toISOString()}::timestamptz)::integer`,
        })
        .from(user);
      const rows = await db
        .select({
          day: sql<string>`to_char(${user.createdAt} at time zone 'UTC', 'YYYY-MM-DD')`,
          count: sql<number>`count(*)::integer`,
        })
        .from(user)
        .where(gte(user.createdAt, start))
        .groupBy(sql`to_char(${user.createdAt} at time zone 'UTC', 'YYYY-MM-DD')`);
      const counts = new Map(rows.map((row) => [row.day, row.count]));
      return {
        observedAt: now.toISOString(),
        timezone: "UTC" as const,
        ...totals!,
        registrations: Array.from({ length: days }, (_, index) => {
          const day = new Date(start.getTime() + index * 86400000).toISOString().slice(0, 10);
          return { day, count: counts.get(day) ?? 0 };
        }),
      };
    },
    async list(input: AuditFilter) {
      const now = new Date();
      const from = input.from ? new Date(input.from) : new Date(now.getTime() - 30 * 86400000);
      const to = input.to ? new Date(input.to) : now;
      if (to.getTime() - from.getTime() > 366 * 86400000 || from >= to)
        throw new Error("INVALID_INPUT");
      const conditions = [gte(adminAudit.startedAt, from), lt(adminAudit.startedAt, to)];
      if (input.actorId) conditions.push(eq(adminAudit.actorId, input.actorId));
      if (input.targetId) conditions.push(eq(adminAudit.targetId, input.targetId));
      if (input.action) conditions.push(eq(adminAudit.action, input.action));
      const stale = sql`${adminAudit.startedAt} < now() - interval '30 seconds'`;
      if (input.outcome === "unknown")
        conditions.push(and(eq(adminAudit.outcome, "pending"), stale)!);
      else if (input.outcome === "pending")
        conditions.push(and(eq(adminAudit.outcome, "pending"), sql`not (${stale})`)!);
      else if (input.outcome) conditions.push(eq(adminAudit.outcome, input.outcome));
      if (input.cursor)
        conditions.push(
          or(
            lt(adminAudit.startedAt, new Date(input.cursor.startedAt)),
            and(
              eq(adminAudit.startedAt, new Date(input.cursor.startedAt)),
              lt(adminAudit.id, input.cursor.id),
            ),
          )!,
        );
      const rows = await db
        .select()
        .from(adminAudit)
        .where(and(...conditions))
        .orderBy(desc(adminAudit.startedAt), desc(adminAudit.id))
        .limit(input.limit + 1);
      const entries = rows.slice(0, input.limit).map((row) =>
        auditEntrySchema.parse({
          ...row,
          startedAt: row.startedAt.toISOString(),
          completedAt: row.completedAt?.toISOString() ?? null,
          outcome:
            row.outcome === "pending" && row.startedAt.getTime() < now.getTime() - 30000
              ? "unknown"
              : row.outcome,
        }),
      );
      const last = entries.at(-1);
      return {
        entries,
        next: rows.length > input.limit && last ? { startedAt: last.startedAt, id: last.id } : null,
      };
    },
  } satisfies AuditJournal & AdministrationQueries;
}
export type AdministrationRepository = ReturnType<typeof createAdministrationRepository>;
