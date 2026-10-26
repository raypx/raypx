import type { Database } from "@raypx/database/connection";
import { cloudJob, cloudJobRun, controlOwner } from "@raypx/database/schema";
import {
  activeCloudJobRunStatuses,
  cloudJobSchema,
  cloudJobRunSchema,
  JobError,
  nextJobRuns,
  type CloudJob,
  type CloudJobInput,
  type CloudJobRun,
} from "@raypx/jobs";
import type { CloudJobsRepository, JobClaim } from "@raypx/jobs/server";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
type JobRow = typeof cloudJob.$inferSelect;
type RunRow = typeof cloudJobRun.$inferSelect;
const activeStatuses = [...activeCloudJobRunStatuses];
const isActive = (status: string) => activeStatuses.some((active) => active === status);
const definition = (input: CloudJobInput) => ({
  name: input.name,
  cron: input.cron,
  timezone: input.timezone,
  enabled: input.enabled,
  action: input.action,
});
const canonical = (value: unknown) =>
  JSON.stringify(value, (_key, item: unknown) =>
    item && typeof item === "object" && !Array.isArray(item)
      ? Object.fromEntries(
          Object.entries(item).sort(([left], [right]) => left.localeCompare(right)),
        )
      : item,
  );
const jobView = (row: JobRow): CloudJob =>
  cloudJobSchema.parse({
    id: row.id,
    name: row.name,
    cron: row.cron,
    timezone: row.timezone,
    enabled: row.enabled,
    action: row.action,
    revision: row.revision,
    nextRunAt: row.nextRunAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });
const runView = (row: RunRow): CloudJobRun =>
  cloudJobRunSchema.parse({
    id: row.id,
    jobId: row.jobId,
    jobRevision: row.jobRevision,
    trigger: row.trigger,
    scheduledFor: row.scheduledFor.toISOString(),
    startedAt: row.startedAt.toISOString(),
    finishedAt: row.finishedAt?.toISOString() ?? null,
    status: row.status,
    action: row.action,
    taskId: row.taskId,
    code: row.code,
    sync: row.sync,
  });
async function databaseTime(tx: Transaction) {
  const [row] = await tx.execute<{ now: Date | string }>(
    sql`select transaction_timestamp() as now`,
  );
  return new Date(row!.now);
}
async function lockedJob(tx: Transaction, userId: string, id: string) {
  const rows = await tx.execute(sql`select id from ${cloudJob}
    where user_id=${userId} and id=${id} for update`);
  if (!rows.length) throw new JobError("NOT_FOUND");
  const [row] = await tx
    .select()
    .from(cloudJob)
    .where(and(eq(cloudJob.userId, userId), eq(cloudJob.id, id)));
  return row!;
}
async function hasActiveRun(tx: Transaction, userId: string, jobId: string) {
  const [row] = await tx
    .select({ id: cloudJobRun.id })
    .from(cloudJobRun)
    .where(
      and(
        eq(cloudJobRun.userId, userId),
        eq(cloudJobRun.jobId, jobId),
        inArray(cloudJobRun.status, activeStatuses),
      ),
    )
    .limit(1);
  return Boolean(row);
}
function newRun(
  job: CloudJob,
  id: string,
  trigger: "schedule" | "manual",
  scheduledFor: Date,
  now: Date,
  code: string | null,
): CloudJobRun {
  return {
    id,
    jobId: job.id,
    jobRevision: job.revision,
    trigger,
    scheduledFor: scheduledFor.toISOString(),
    startedAt: now.toISOString(),
    finishedAt: code ? now.toISOString() : null,
    status: code ? "skipped" : "dispatching",
    action: job.action,
    taskId: !code && job.action.type === "agent.run" ? id : null,
    code,
    sync: null,
  };
}
function runInsert(userId: string, run: CloudJobRun): typeof cloudJobRun.$inferInsert {
  return {
    ...run,
    userId,
    scheduledFor: new Date(run.scheduledFor),
    startedAt: new Date(run.startedAt),
    finishedAt: run.finishedAt ? new Date(run.finishedAt) : null,
  };
}
function uniqueViolation(error: unknown) {
  if (!error || typeof error !== "object") return false;
  if ("code" in error && error.code === "23505") return true;
  return (
    "cause" in error &&
    Boolean(
      error.cause &&
      typeof error.cause === "object" &&
      "code" in error.cause &&
      error.cause.code === "23505",
    )
  );
}

export function createCloudJobsRepository(db: Database): CloudJobsRepository {
  return {
    async get(userId, id) {
      const [row] = await db
        .select()
        .from(cloudJob)
        .where(and(eq(cloudJob.userId, userId), eq(cloudJob.id, id)))
        .limit(1);
      if (!row) throw new JobError("NOT_FOUND");
      return jobView(row);
    },
    async list(userId) {
      return (
        await db
          .select()
          .from(cloudJob)
          .where(eq(cloudJob.userId, userId))
          .orderBy(desc(cloudJob.createdAt), desc(cloudJob.id))
          .limit(100)
      ).map(jobView);
    },
    async create(userId, input, nextRunAt, requestId) {
      const existing = async (tx: Database | Transaction) => {
        const [row] = await tx.select().from(cloudJob).where(eq(cloudJob.id, requestId));
        if (!row) return null;
        const saved = jobView(row);
        if (row.userId !== userId || canonical(definition(saved)) !== canonical(definition(input)))
          throw new JobError("IDEMPOTENCY_CONFLICT");
        return saved;
      };
      try {
        return await db.transaction(async (tx) => {
          await tx.insert(controlOwner).values({ userId }).onConflictDoNothing();
          await tx.execute(
            sql`select user_id from ${controlOwner} where user_id=${userId} for update`,
          );
          const previous = await existing(tx);
          if (previous) return previous;
          const [count] = await tx.execute<{ count: number }>(
            sql`select count(*)::integer as count from ${cloudJob} where user_id=${userId}`,
          );
          if (count!.count >= 100) throw new JobError("JOB_LIMIT");
          const [row] = await tx
            .insert(cloudJob)
            .values({
              id: requestId,
              userId,
              ...definition(input),
              revision: 1,
              nextRunAt: nextRunAt ? new Date(nextRunAt) : null,
            })
            .returning();
          return jobView(row!);
        });
      } catch (error) {
        if (!uniqueViolation(error)) throw error;
        const previous = await existing(db);
        if (!previous) throw error;
        return previous;
      }
    },
    update(userId, id, revision, input, nextRunAt) {
      return db.transaction(async (tx) => {
        const previous = await lockedJob(tx, userId, id);
        if (previous.revision !== revision) throw new JobError("JOB_CONFLICT");
        const [row] = await tx
          .update(cloudJob)
          .set({
            ...definition(input),
            revision: revision + 1,
            nextRunAt: nextRunAt ? new Date(nextRunAt) : null,
            updatedAt: sql`now()`,
          })
          .where(and(eq(cloudJob.userId, userId), eq(cloudJob.id, id)))
          .returning();
        return jobView(row!);
      });
    },
    remove(userId, id, revision) {
      return db.transaction(async (tx) => {
        const previous = await lockedJob(tx, userId, id);
        if (previous.revision !== revision) throw new JobError("JOB_CONFLICT");
        await tx.delete(cloudJob).where(and(eq(cloudJob.userId, userId), eq(cloudJob.id, id)));
        return { deleted: true as const };
      });
    },
    async history(userId, id, limit) {
      const [owner] = await db
        .select({ id: cloudJob.id })
        .from(cloudJob)
        .where(and(eq(cloudJob.userId, userId), eq(cloudJob.id, id)));
      if (!owner) throw new JobError("NOT_FOUND");
      return (
        await db
          .select()
          .from(cloudJobRun)
          .where(and(eq(cloudJobRun.userId, userId), eq(cloudJobRun.jobId, id)))
          .orderBy(desc(cloudJobRun.startedAt), desc(cloudJobRun.id))
          .limit(Math.max(1, Math.min(limit, 100)))
      ).map(runView);
    },
    claimDue(limit) {
      return db.transaction(async (tx) => {
        const now = await databaseTime(tx);
        const due = await tx.execute<{ id: string; user_id: string }>(sql`
          select id,user_id from ${cloudJob} where enabled=true and next_run_at <= ${now.toISOString()}::timestamptz
          order by next_run_at,id limit ${Math.max(1, Math.min(limit, 100))} for update skip locked`);
        const claims: JobClaim[] = [];
        for (const candidate of due) {
          const row = await lockedJob(tx, candidate.user_id, candidate.id);
          const job = jobView(row);
          const scheduledFor = row.nextRunAt!;
          let nextRunAt: string | null;
          let code: string | null =
            now.getTime() - scheduledFor.getTime() > 60_000 ? "MISSED_SCHEDULE" : null;
          try {
            nextRunAt = nextJobRuns(job, now, 1)[0]!;
          } catch {
            nextRunAt = null;
            code = "INVALID_CRON";
          }
          if (!code && (await hasActiveRun(tx, candidate.user_id, job.id)))
            code = "ALREADY_RUNNING";
          const run = newRun(job, crypto.randomUUID(), "schedule", scheduledFor, now, code);
          const inserted = await tx
            .insert(cloudJobRun)
            .values(runInsert(candidate.user_id, run))
            .onConflictDoNothing()
            .returning();
          await tx
            .update(cloudJob)
            .set({
              nextRunAt: nextRunAt ? new Date(nextRunAt) : null,
              ...(nextRunAt ? {} : { enabled: false, revision: row.revision + 1 }),
              updatedAt: sql`now()`,
            })
            .where(and(eq(cloudJob.userId, candidate.user_id), eq(cloudJob.id, job.id)));
          if (inserted[0]) claims.push({ userId: candidate.user_id, job, run, claimed: !code });
        }
        return claims;
      });
    },
    async claimManual(userId, id, requestId) {
      const existing = async (tx: Database | Transaction): Promise<JobClaim | null> => {
        const [row] = await tx.select().from(cloudJobRun).where(eq(cloudJobRun.id, requestId));
        if (!row) return null;
        if (row.userId !== userId || row.jobId !== id) throw new JobError("IDEMPOTENCY_CONFLICT");
        const [job] = await tx
          .select()
          .from(cloudJob)
          .where(and(eq(cloudJob.userId, userId), eq(cloudJob.id, id)));
        if (!job) throw new JobError("NOT_FOUND");
        return { userId, job: jobView(job), run: runView(row), claimed: false };
      };
      try {
        return await db.transaction(async (tx) => {
          const job = jobView(await lockedJob(tx, userId, id));
          const previous = await existing(tx);
          if (previous) return previous;
          const now = await databaseTime(tx);
          const code = (await hasActiveRun(tx, userId, id)) ? "ALREADY_RUNNING" : null;
          const run = newRun(job, requestId, "manual", now, now, code);
          await tx.insert(cloudJobRun).values(runInsert(userId, run));
          return { userId, job, run, claimed: !code };
        });
      } catch (error) {
        if (!uniqueViolation(error)) throw error;
        const previous = await existing(db);
        if (!previous) throw error;
        return previous;
      }
    },
    async active(limit) {
      return db.transaction(async (tx) => {
        const candidates = await tx.execute<{ id: string }>(sql`select id from ${cloudJobRun}
          where status in ('dispatching','running','waiting','unknown')
          order by checked_at,id limit ${Math.max(1, Math.min(limit, 100))} for update skip locked`);
        if (!candidates.length) return [];
        const ids = candidates.map((row) => row.id);
        const rows = await tx
          .select({ run: cloudJobRun, job: cloudJob })
          .from(cloudJobRun)
          .innerJoin(
            cloudJob,
            and(eq(cloudJob.id, cloudJobRun.jobId), eq(cloudJob.userId, cloudJobRun.userId)),
          )
          .where(inArray(cloudJobRun.id, ids))
          .orderBy(asc(cloudJobRun.checkedAt), asc(cloudJobRun.id));
        await tx
          .update(cloudJobRun)
          .set({ checkedAt: sql`transaction_timestamp()` })
          .where(inArray(cloudJobRun.id, ids));
        return rows.map(({ run, job }) => ({
          userId: job.userId,
          job: jobView(job),
          run: runView(run),
          claimed: false,
        }));
      });
    },
    updateRun(userId, id, update, pause) {
      return db.transaction(async (tx) => {
        const [candidate] = await tx
          .select()
          .from(cloudJobRun)
          .where(and(eq(cloudJobRun.userId, userId), eq(cloudJobRun.id, id)));
        if (!candidate) throw new JobError("NOT_FOUND");
        const job = await lockedJob(tx, userId, candidate.jobId);
        const [previous] = await tx
          .select()
          .from(cloudJobRun)
          .where(and(eq(cloudJobRun.userId, userId), eq(cloudJobRun.id, id)));
        if (!previous) throw new JobError("NOT_FOUND");
        if (!isActive(previous.status)) return runView(previous);
        const [row] = await tx
          .update(cloudJobRun)
          .set({
            status: update.status,
            code: update.code,
            sync: update.sync,
            finishedAt: update.finishedAt ? new Date(update.finishedAt) : null,
            checkedAt: sql`transaction_timestamp()`,
          })
          .where(and(eq(cloudJobRun.userId, userId), eq(cloudJobRun.id, id)))
          .returning();
        if (pause && job.enabled)
          await tx
            .update(cloudJob)
            .set({
              enabled: false,
              nextRunAt: null,
              revision: job.revision + 1,
              updatedAt: sql`now()`,
            })
            .where(and(eq(cloudJob.userId, userId), eq(cloudJob.id, job.id)));
        return runView(row!);
      });
    },
  };
}
