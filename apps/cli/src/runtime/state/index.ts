import { z } from "zod";
import { rootGrantSchema } from "@raypx/contracts/local";
import { jobInputSchema, jobRunSchema } from "@raypx/jobs";
import { storedRecord } from "../sqlite/records";
import { Database } from "bun:sqlite";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { and, asc, desc, eq, lt, notInArray, or, sql } from "drizzle-orm";
import type { RootGrant } from "@raypx/contracts/local";
import type { JobInput, JobRun } from "@raypx/jobs";
import { LocalError } from "../errors";
import { type ProfileStorage, type LocalDatabase } from "../sqlite";
import { jobs, meta, roots, runs } from "../sqlite/schema";

export function profilePath(options: { dataDir?: string; profile?: string } = {}) {
  const profile = options.profile ?? "default";
  if (!/^[a-zA-Z0-9_-]+$/.test(profile))
    throw new LocalError(
      "INVALID_PROFILE",
      "Profile must contain letters, numbers, underscores or dashes",
    );
  const base =
    options.dataDir ??
    (process.platform === "win32"
      ? join(process.env.LOCALAPPDATA ?? homedir(), "Raypx")
      : process.platform === "darwin"
        ? join(homedir(), "Library", "Application Support", "Raypx")
        : join(process.env.XDG_DATA_HOME ?? join(homedir(), ".local", "share"), "raypx"));
  return resolve(base, "profiles", profile);
}
const storedJobSchema = jobInputSchema.extend({
  id: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  enabled: z.boolean(),
});
export class StateStore {
  readonly db: LocalDatabase;
  readonly directory: string;
  constructor(storage: ProfileStorage) {
    this.directory = storage.directory;
    this.db = storage.database;
    this.db.insert(meta).values({ key: "revision", value: 0 }).onConflictDoNothing().run();
    this.db
      .delete(runs)
      .where(lt(runs.startedAt, new Date(Date.now() - 30 * 86_400_000).toISOString()))
      .run();
  }
  revision() {
    return this.db.select({ value: meta.value }).from(meta).where(eq(meta.key, "revision")).get()!
      .value;
  }
  touch() {
    this.db
      .update(meta)
      .set({ value: sql`${meta.value}+1` })
      .where(eq(meta.key, "revision"))
      .run();
  }
  roots(): RootGrant[] {
    return this.db
      .select({ value: roots.value })
      .from(roots)
      .orderBy(asc(sql`rowid`))
      .all()
      .map((row) => storedRecord(rootGrantSchema, row.value));
  }
  root(id: string) {
    const root = this.roots().find((entry) => entry.id === id);
    if (!root) throw new LocalError("ROOT_NOT_FOUND", "Directory grant does not exist");
    return root;
  }
  putRoot(root: RootGrant) {
    // REPLACE preserves rowid-based enumeration order when a grant is updated.
    this.db.run(
      sql`INSERT OR REPLACE INTO ${roots} (id,value) VALUES (${root.id},${JSON.stringify(root)})`,
    );
    this.touch();
    return root;
  }
  removeRoot(id: string) {
    this.db.delete(roots).where(eq(roots.id, id)).run();
    this.touch();
  }
  jobs(): (JobInput & { id: string; createdAt: string; updatedAt: string })[] {
    return this.db
      .select({ value: jobs.value })
      .from(jobs)
      .orderBy(asc(sql`rowid`))
      .all()
      .map((row) => storedRecord(storedJobSchema, row.value));
  }
  job(id: string) {
    const job = this.jobs().find((entry) => entry.id === id);
    if (!job) throw new LocalError("JOB_NOT_FOUND", "Task does not exist");
    return job;
  }
  putJob(job: JobInput & { id: string; createdAt: string; updatedAt: string }) {
    this.db.run(
      sql`INSERT OR REPLACE INTO ${jobs} (id,value) VALUES (${job.id},${JSON.stringify(job)})`,
    );
    this.touch();
    return job;
  }
  deleteJob(id: string) {
    this.db.delete(jobs).where(eq(jobs.id, id)).run();
    this.touch();
  }
  putRun(run: JobRun) {
    this.db
      .insert(runs)
      .values({
        id: run.id,
        jobId: run.jobId,
        startedAt: run.startedAt,
        value: JSON.stringify(run),
      })
      .onConflictDoUpdate({
        target: runs.id,
        set: { jobId: run.jobId, startedAt: run.startedAt, value: JSON.stringify(run) },
      })
      .run();
    this.db
      .delete(runs)
      .where(
        or(
          lt(runs.startedAt, new Date(Date.now() - 30 * 86_400_000).toISOString()),
          and(
            eq(runs.jobId, run.jobId),
            notInArray(
              runs.id,
              this.db
                .select({ id: runs.id })
                .from(runs)
                .where(eq(runs.jobId, run.jobId))
                .orderBy(desc(runs.startedAt))
                .limit(100),
            ),
          ),
        ),
      )
      .run();
  }
  history(id: string): JobRun[] {
    return this.db
      .select({ value: runs.value })
      .from(runs)
      .where(eq(runs.jobId, id))
      .orderBy(desc(runs.startedAt))
      .limit(100)
      .all()
      .map((row) => storedRecord(jobRunSchema, row.value));
  }
}
export function acquireLock(directory: string, name: string): (() => void) | null {
  if (!/^[a-zA-Z0-9_-]+$/.test(name))
    throw new LocalError("INVALID_LOCK", "Invalid lock identifier");
  const db = new Database(join(directory, `${name}.lock.sqlite`), { create: true });
  try {
    db.exec("PRAGMA busy_timeout=0; BEGIN IMMEDIATE;");
  } catch {
    db.close();
    return null;
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    try {
      db.exec("ROLLBACK;");
    } finally {
      db.close();
    }
  };
}
