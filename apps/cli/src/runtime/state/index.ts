import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { and, asc, desc, eq, lt, notInArray, or, sql } from "drizzle-orm";
import type { RootGrant } from "@raypx/contracts/local";
import type { JobInput, JobRun } from "@raypx/jobs";
import { LocalError } from "../errors";
import { drizzle, type LocalDatabase } from "../sqlite";
import { jobs, meta, roots, runs } from "../sqlite/schema";

const STATE_SCHEMA_VERSION = 1;
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
export class StateStore {
  readonly db: LocalDatabase;
  private readonly lease: Database;
  constructor(readonly directory: string) {
    mkdirSync(directory, { recursive: true });
    const database = new Database(join(directory, "state.sqlite"), { create: true, strict: true });
    this.db = drizzle({ client: database });
    database.exec("PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL;");
    this.lease = new Database(join(directory, "schema.lock.sqlite"), { create: true });
    try {
      this.lease.exec("PRAGMA busy_timeout=1000;");
      if (!this.lease.query("SELECT name FROM sqlite_master WHERE name='lease'").get())
        this.lease.exec(
          "CREATE TABLE IF NOT EXISTS lease (id INTEGER PRIMARY KEY); INSERT OR IGNORE INTO lease VALUES (1);",
        );
      const version = (database.query("PRAGMA user_version").get() as { user_version: number })
        .user_version;
      if (version > STATE_SCHEMA_VERSION) {
        throw new LocalError("NEWER_SCHEMA", "This profile requires a newer Raypx CLI");
      }
      if (version < STATE_SCHEMA_VERSION) {
        // Every process opens the schema lease before migration; existing runtimes
        // retain a shared reader lease so migrations cannot race live executors.
        const migration = new Database(join(directory, "schema.lock.sqlite"), { create: true });
        try {
          migration.exec("PRAGMA busy_timeout=1000; BEGIN EXCLUSIVE;");
          this.db.transaction(() => {
            database.exec(
              "CREATE TABLE IF NOT EXISTS roots (id TEXT PRIMARY KEY, value TEXT NOT NULL); CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY, value TEXT NOT NULL); CREATE TABLE IF NOT EXISTS runs (id TEXT PRIMARY KEY, jobId TEXT NOT NULL, startedAt TEXT NOT NULL, value TEXT NOT NULL); CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value INTEGER NOT NULL); INSERT OR IGNORE INTO meta VALUES ('revision',0); PRAGMA user_version=1;",
            );
          });
          migration.exec("COMMIT;");
        } finally {
          migration.close();
        }
      }
      this.lease.exec("BEGIN; SELECT id FROM lease;");
      this.db
        .delete(runs)
        .where(lt(runs.startedAt, new Date(Date.now() - 30 * 86_400_000).toISOString()))
        .run();
    } catch (error) {
      this.lease.close();
      this.db.$client.close();
      throw error;
    }
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
      .map((row) => JSON.parse(row.value));
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
      .map((row) => JSON.parse(row.value));
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
      .map((row) => JSON.parse(row.value));
  }
  close() {
    this.lease.exec("ROLLBACK;");
    this.lease.close();
    this.db.$client.close();
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
