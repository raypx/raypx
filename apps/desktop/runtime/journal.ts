import { DatabaseSync } from "node:sqlite";
import { chmodSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { RunEventDto } from "@voidmix/contracts";
import type { Claim, EventInput, LocalRun, RunnerBinding, StoredArtifact } from "./types.js";

export class RunnerJournal {
  private readonly db: DatabaseSync;
  constructor(path: string) {
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(path);
    chmodSync(path, 0o600);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON;
      CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS bindings (id TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS runs (id TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS events (run_id TEXT NOT NULL, seq INTEGER NOT NULL, value TEXT NOT NULL, PRIMARY KEY(run_id,seq));
      CREATE TABLE IF NOT EXISTS commands (id TEXT PRIMARY KEY, value TEXT NOT NULL);`);
    this.db.exec("CREATE TABLE IF NOT EXISTS artifacts (id TEXT PRIMARY KEY, value TEXT NOT NULL)");
  }
  setting<T>(key: string): T | null {
    const row = this.db.prepare("SELECT value FROM settings WHERE key=?").get(key);
    return row ? (JSON.parse(String(row.value)) as T) : null;
  }
  setSetting(key: string, value: unknown): void {
    this.db
      .prepare(
        "INSERT INTO settings VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
      )
      .run(key, JSON.stringify(value));
  }
  bindings(): RunnerBinding[] {
    return this.db
      .prepare("SELECT value FROM bindings")
      .all()
      .map((row) => JSON.parse(String(row.value)) as RunnerBinding);
  }
  binding(id: string): RunnerBinding | null {
    return this.bindings().find((binding) => binding.localBindingId === id) ?? null;
  }
  saveBinding(binding: RunnerBinding): void {
    this.db
      .prepare(
        "INSERT INTO bindings VALUES (?,?) ON CONFLICT(id) DO UPDATE SET value=excluded.value",
      )
      .run(binding.localBindingId, JSON.stringify(binding));
  }
  revokeBinding(id: string): void {
    this.db.prepare("DELETE FROM bindings WHERE id=?").run(id);
  }
  runs(): LocalRun[] {
    return this.db
      .prepare("SELECT value FROM runs")
      .all()
      .map((row) => JSON.parse(String(row.value)) as LocalRun);
  }
  run(id: string): LocalRun | null {
    return this.runs().find((run) => run.claim.run.id === id) ?? null;
  }
  saveRun(run: LocalRun): void {
    this.db
      .prepare("INSERT INTO runs VALUES (?,?) ON CONFLICT(id) DO UPDATE SET value=excluded.value")
      .run(run.claim.run.id, JSON.stringify(run));
  }
  claim(claim: Claim): LocalRun {
    const existing = this.run(claim.run.id);
    if (existing) {
      if (existing.claim.claimId !== claim.claimId)
        throw new Error("Run claim does not match the durable local claim.");
      return existing;
    }
    const run: LocalRun = {
      claim,
      acknowledged: false,
      status: "queued",
      error: null,
      sessionFile: null,
      syncedSeq: 0,
      pendingApproval: null,
    };
    this.saveRun(run);
    return run;
  }
  append(runId: string, input: EventInput): RunEventDto {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const row = this.db
        .prepare("SELECT COALESCE(MAX(seq),0)+1 AS seq FROM events WHERE run_id=?")
        .get(runId)!;
      const event = {
        ...input,
        runId,
        seq: Number(row.seq),
        occurredAt: new Date(),
      } as RunEventDto;
      this.db
        .prepare("INSERT INTO events VALUES (?,?,?)")
        .run(runId, event.seq, JSON.stringify(event));
      const run = this.run(runId);
      if (run && input.type === "run.status") {
        run.status = input.payload.status;
        run.error = input.payload.error ?? null;
        if (run.status !== "waiting_for_approval") run.pendingApproval = null;
        this.saveRun(run);
      }
      this.db.exec("COMMIT");
      return event;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
  events(runId: string, afterSeq = 0, limit = 100): RunEventDto[] {
    return this.db
      .prepare("SELECT value FROM events WHERE run_id=? AND seq>? ORDER BY seq LIMIT ?")
      .all(runId, afterSeq, limit)
      .map((row) => {
        const event = JSON.parse(String(row.value)) as RunEventDto;
        return { ...event, occurredAt: new Date(event.occurredAt) };
      });
  }
  command(id: string): { outcome: "applied" | "rejected"; error?: string } | null {
    const row = this.db.prepare("SELECT value FROM commands WHERE id=?").get(id);
    return row
      ? (JSON.parse(String(row.value)) as { outcome: "applied" | "rejected"; error?: string })
      : null;
  }
  recordCommand(id: string, result: { outcome: "applied" | "rejected"; error?: string }): void {
    this.db
      .prepare(
        "INSERT INTO commands VALUES (?,?) ON CONFLICT(id) DO UPDATE SET value=excluded.value",
      )
      .run(id, JSON.stringify(result));
  }
  artifacts(runId: string): StoredArtifact[] {
    return this.db
      .prepare("SELECT value FROM artifacts")
      .all()
      .map((row) => JSON.parse(String(row.value)) as StoredArtifact)
      .filter((file) => file.runId === runId);
  }
  saveArtifact(artifact: StoredArtifact): void {
    this.db
      .prepare(
        "INSERT INTO artifacts VALUES (?,?) ON CONFLICT(id) DO UPDATE SET value=excluded.value",
      )
      .run(artifact.id, JSON.stringify(artifact));
  }
  recoverInterrupted(): void {
    for (const run of this.runs())
      if (run.acknowledged && ["running", "waiting_for_approval", "queued"].includes(run.status))
        this.append(run.claim.run.id, {
          type: "run.status",
          payload: { status: "failed", error: "interrupted" },
        });
  }
  close(): void {
    this.db.close();
  }
}
