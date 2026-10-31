import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import type { RootGrant } from "@raypx/contracts/local";
import type { JobInput, JobRun } from "@raypx/jobs";
import { LocalError } from "../errors";

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
  readonly db: Database;
  private readonly lease: Database;
  constructor(readonly directory: string) {
    mkdirSync(directory, { recursive: true });
    this.db = new Database(join(directory, "state.sqlite"), { create: true, strict: true });
    this.db.exec("PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL;");
    this.lease = new Database(join(directory, "schema.lock.sqlite"), { create: true });
    try {
      this.lease.exec("PRAGMA busy_timeout=1000;");
      if (!this.lease.query("SELECT name FROM sqlite_master WHERE name='lease'").get())
        this.lease.exec(
          "CREATE TABLE IF NOT EXISTS lease (id INTEGER PRIMARY KEY); INSERT OR IGNORE INTO lease VALUES (1);",
        );
      const version = (this.db.query("PRAGMA user_version").get() as { user_version: number })
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
            this.db.exec(
              "CREATE TABLE IF NOT EXISTS roots (id TEXT PRIMARY KEY, value TEXT NOT NULL); CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY, value TEXT NOT NULL); CREATE TABLE IF NOT EXISTS runs (id TEXT PRIMARY KEY, jobId TEXT NOT NULL, startedAt TEXT NOT NULL, value TEXT NOT NULL); CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value INTEGER NOT NULL); INSERT OR IGNORE INTO meta VALUES ('revision',0); PRAGMA user_version=1;",
            );
          })();
          migration.exec("COMMIT;");
        } finally {
          migration.close();
        }
      }
      this.lease.exec("BEGIN; SELECT id FROM lease;");
      this.db
        .query("DELETE FROM runs WHERE startedAt < ?")
        .run(new Date(Date.now() - 30 * 86_400_000).toISOString());
    } catch (error) {
      this.lease.close();
      this.db.close();
      throw error;
    }
  }
  revision() {
    return (this.db.query("SELECT value FROM meta WHERE key='revision'").get() as { value: number })
      .value;
  }
  touch() {
    this.db.exec("UPDATE meta SET value=value+1 WHERE key='revision'");
  }
  roots(): RootGrant[] {
    return (
      this.db.query("SELECT value FROM roots ORDER BY rowid").all() as { value: string }[]
    ).map((row) => JSON.parse(row.value));
  }
  root(id: string) {
    const root = this.roots().find((entry) => entry.id === id);
    if (!root) throw new LocalError("ROOT_NOT_FOUND", "Directory grant does not exist");
    return root;
  }
  putRoot(root: RootGrant) {
    this.db.query("INSERT OR REPLACE INTO roots VALUES (?,?)").run(root.id, JSON.stringify(root));
    this.touch();
    return root;
  }
  removeRoot(id: string) {
    this.db.query("DELETE FROM roots WHERE id=?").run(id);
    this.touch();
  }
  jobs(): (JobInput & { id: string; createdAt: string; updatedAt: string })[] {
    return (
      this.db.query("SELECT value FROM jobs ORDER BY rowid").all() as { value: string }[]
    ).map((row) => JSON.parse(row.value));
  }
  job(id: string) {
    const job = this.jobs().find((entry) => entry.id === id);
    if (!job) throw new LocalError("JOB_NOT_FOUND", "Task does not exist");
    return job;
  }
  putJob(job: JobInput & { id: string; createdAt: string; updatedAt: string }) {
    this.db.query("INSERT OR REPLACE INTO jobs VALUES (?,?)").run(job.id, JSON.stringify(job));
    this.touch();
    return job;
  }
  deleteJob(id: string) {
    this.db.query("DELETE FROM jobs WHERE id=?").run(id);
    this.touch();
  }
  putRun(run: JobRun) {
    this.db
      .query("INSERT OR REPLACE INTO runs VALUES (?,?,?,?)")
      .run(run.id, run.jobId, run.startedAt, JSON.stringify(run));
    this.db
      .query(
        "DELETE FROM runs WHERE startedAt < ? OR (jobId=? AND id NOT IN (SELECT id FROM runs WHERE jobId=? ORDER BY startedAt DESC LIMIT 100))",
      )
      .run(new Date(Date.now() - 30 * 86_400_000).toISOString(), run.jobId, run.jobId);
  }
  history(id: string): JobRun[] {
    return (
      this.db
        .query("SELECT value FROM runs WHERE jobId=? ORDER BY startedAt DESC LIMIT 100")
        .all(id) as { value: string }[]
    ).map((row) => JSON.parse(row.value));
  }
  close() {
    this.lease.exec("ROLLBACK;");
    this.lease.close();
    this.db.close();
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
