import { and, asc, eq, gt, isNull, lte, or, sql } from "drizzle-orm";
import type { Database } from "@raypx/database/connection";
import {
  deviceDirectoryGrants,
  computers,
  spaceAudit,
  spaceDeletionJobs,
  spaces,
} from "@raypx/database/schema";
import { cancelSpaceRuns } from "@raypx/agents/server/postgres";
import { ComputerError, type ComputerProvider } from "@raypx/providers/computer";

type Job = typeof spaceDeletionJobs.$inferSelect;
type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

/** A durable stage is committed before another stage starts. External operations are idempotent. */
export function createSpaceDeletionWorker(
  db: Database,
  provider: ComputerProvider | null,
  options: {
    intervalMs: number;
    onError(): void;
    /** Space object adapters must remove idempotently; currently no Space record owns an S3 object. */
    removeObjects?: (spaceId: string) => Promise<void>;
    leaseMs?: number;
    now?: () => Date;
  },
) {
  const owner = crypto.randomUUID();
  const leaseMs = options.leaseMs ?? 300_000;
  if (!Number.isSafeInteger(leaseMs) || leaseMs < 1) throw new RangeError("Invalid deletion lease");
  const now = options.now ?? (() => new Date());
  let timer: ReturnType<typeof setInterval> | undefined;
  let active: Promise<void> | undefined;
  let stopped = false;
  const selected = (job: Job) =>
    and(
      eq(spaceDeletionJobs.spaceId, job.spaceId),
      eq(spaceDeletionJobs.leaseOwner, owner),
      eq(spaceDeletionJobs.fence, job.fence),
      gt(spaceDeletionJobs.leaseUntil, now()),
    );
  async function requireLease(tx: Transaction, job: Job) {
    const [current] = await tx.select().from(spaceDeletionJobs).where(selected(job)).for("update");
    if (!current) throw new Error("SPACE_DELETION_LEASE_LOST");
  }
  async function audit(tx: Transaction, job: Job, outcome: "pending" | "succeeded" | "failed") {
    await tx.insert(spaceAudit).values({
      id: crypto.randomUUID(),
      spaceId: job.spaceId,
      operationId: `${job.spaceId}:${job.fence}:${job.stage}`,
      actorAccountId: job.requestedByAccountId,
      action: "space.delete.cleanup",
      targetId: job.spaceId,
      outcome,
      code: outcome === "failed" ? "SPACE_DELETION_FAILED" : null,
      createdAt: now(),
    });
  }
  async function finish(job: Job, stage: Job["stage"]) {
    await db.transaction(async (tx) => {
      await requireLease(tx, job);
      await audit(tx, job, "succeeded");
      await tx
        .update(spaceDeletionJobs)
        .set({
          stage,
          leaseOwner: null,
          leaseUntil: null,
          updatedAt: now(),
        })
        .where(selected(job));
    });
  }
  async function releaseComputers(job: Job) {
    const rows = await db
      .select()
      .from(computers)
      .where(eq(computers.spaceId, job.spaceId))
      .orderBy(asc(computers.id));
    for (const row of rows) {
      if (row.state === "destroyed") continue;
      if (row.provider === "device") {
        await db.transaction(async (tx) => {
          await requireLease(tx, job);
          await tx
            .update(deviceDirectoryGrants)
            .set({ revokedAt: now(), revision: sql`${deviceDirectoryGrants.revision}+1` })
            .where(
              and(
                eq(deviceDirectoryGrants.spaceId, job.spaceId),
                eq(deviceDirectoryGrants.id, row.id),
                isNull(deviceDirectoryGrants.revokedAt),
              ),
            );
          await tx
            .update(computers)
            .set({
              state: "destroyed",
              generation: sql`${computers.generation}+1`,
              updatedAt: now(),
            })
            .where(and(eq(computers.spaceId, job.spaceId), eq(computers.id, row.id)));
          await tx.insert(spaceAudit).values({
            spaceId: job.spaceId,
            id: crypto.randomUUID(),
            operationId: crypto.randomUUID(),
            actorAccountId: job.requestedByAccountId,
            action: "device.directory.revoked",
            targetId: row.id,
            outcome: "succeeded",
          });
        });
        continue;
      }
      if (!provider) throw new Error("COMPUTER_PROVIDER_UNAVAILABLE");
      try {
        // destroy retains the committed home under the provider's existing retention policy.
        await provider.destroy({ id: row.id, generation: row.generation });
      } catch (error) {
        if (!(error instanceof ComputerError && error.code === "NOT_FOUND")) throw error;
      }
      await db.transaction(async (tx) => {
        await requireLease(tx, job);
        await tx
          .update(computers)
          .set({
            state: "destroyed",
            failureCode: null,
            leaseOwner: null,
            leaseExpiresAt: null,
            leaseFence: sql`${computers.leaseFence} + 1`,
            updatedAt: now(),
          })
          .where(and(eq(computers.spaceId, job.spaceId), eq(computers.id, row.id)));
      });
    }
  }
  async function step(job: Job) {
    // Fail closed before any external effect if audit storage cannot accept the intent.
    await db.transaction(async (tx) => {
      await requireLease(tx, job);
      await audit(tx, job, "pending");
    });
    try {
      if (job.stage === "claimed") {
        await db.transaction(async (tx) => {
          await requireLease(tx, job);
          await cancelSpaceRuns(tx, job.spaceId);
          await audit(tx, job, "succeeded");
          await tx
            .update(spaceDeletionJobs)
            .set({
              stage: "runs_cancelled",
              leaseOwner: null,
              leaseUntil: null,
              updatedAt: now(),
            })
            .where(selected(job));
        });
        return;
      }
      if (job.stage === "runs_cancelled") {
        await releaseComputers(job);
        await finish(job, "computers_released");
        return;
      }
      if (job.stage === "computers_released") {
        await options.removeObjects?.(job.spaceId);
        await finish(job, "objects_removed");
        return;
      }
      await db.transaction(async (tx) => {
        await requireLease(tx, job);
        await audit(tx, job, "succeeded");
        await tx.execute(
          sql`select pg_notify('raypx_space_events', ${JSON.stringify({
            spaceId: job.spaceId,
            sequence: 0,
            kind: "space.deleted",
          })})`,
        );
        await tx.delete(spaces).where(eq(spaces.id, job.spaceId));
      });
    } catch (error) {
      await db.transaction(async (tx) => {
        await requireLease(tx, job);
        await audit(tx, job, "failed");
        await tx
          .update(spaceDeletionJobs)
          .set({
            leaseOwner: null,
            leaseUntil: null,
            updatedAt: now(),
          })
          .where(selected(job));
      });
      throw error;
    }
  }
  async function run() {
    // A scan performs one stage per Space, so a restart resumes at a visible durable boundary.
    const claimed = await db.transaction(async (tx) => {
      const due = await tx
        .select()
        .from(spaceDeletionJobs)
        .where(or(isNull(spaceDeletionJobs.leaseUntil), lte(spaceDeletionJobs.leaseUntil, now())))
        .orderBy(asc(spaceDeletionJobs.claimedAt), asc(spaceDeletionJobs.spaceId))
        .limit(25)
        .for("update", { skipLocked: true });
      const jobs: Job[] = [];
      for (const job of due) {
        const [row] = await tx
          .update(spaceDeletionJobs)
          .set({
            leaseOwner: owner,
            leaseUntil: new Date(now().getTime() + leaseMs),
            fence: job.fence + 1,
            updatedAt: now(),
          })
          .where(eq(spaceDeletionJobs.spaceId, job.spaceId))
          .returning();
        jobs.push(row!);
      }
      return jobs;
    });
    for (const job of claimed) {
      try {
        await step(job);
      } catch {
        options.onError();
      }
    }
  }
  function scan() {
    if (active || stopped) return active ?? Promise.resolve();
    active = run().finally(() => {
      active = undefined;
    });
    return active;
  }
  function stop() {
    stopped = true;
    clearInterval(timer);
    timer = undefined;
  }
  return {
    scan,
    async start() {
      if (timer || stopped) return;
      timer = setInterval(() => {
        void scan().catch(() => options.onError());
      }, options.intervalMs);
      timer.unref();
      await scan();
    },
    stop,
    async close() {
      stop();
      await active;
    },
  };
}
