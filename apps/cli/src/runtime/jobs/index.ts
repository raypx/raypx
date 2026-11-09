import { Cron } from "croner";
import { nextJobRuns, type JobDefinition, type JobInput, type JobRun } from "@raypx/jobs-model";
import type { LocalEvent } from "@raypx/contracts/local";

import { LocalError } from "../errors.ts";
import type { FileRuntime } from "../files/index.ts";
import type { ProcessRuntime } from "../process/index.ts";
import { acquireLock, type StateStore } from "../state/index.ts";
import { diagnosticCode, recordDiagnostic, type RecordDiagnostic } from "../../diagnostics.ts";

export class JobRuntime {
  private schedules: Cron[] = [];
  private revision = -1;
  private closing = false;
  private interval: ReturnType<typeof setInterval> | undefined;
  private releaseScheduler: (() => void) | undefined;
  private readonly active = new Map<
    string,
    { controller: AbortController; done: Promise<JobRun> }
  >();
  constructor(
    private readonly state: StateStore,
    private readonly files: FileRuntime,
    private readonly processes: ProcessRuntime,
    private readonly emit: (event: LocalEvent) => void,
    private readonly record?: RecordDiagnostic,
    private readonly assertInstance?: () => Promise<void>,
  ) {}
  validate(input: JobInput) {
    try {
      return nextJobRuns(input);
    } catch {
      throw new LocalError(
        "INVALID_CRON",
        "Use a valid five-field Cron expression and IANA time zone",
      );
    }
  }
  list(): JobDefinition[] {
    return this.state.jobs().map((job) => ({ ...job, nextRuns: this.validate(job) }));
  }
  create(input: JobInput) {
    this.validate(input);
    const now = new Date().toISOString();
    const job = this.state.putJob({
      ...input,
      id: crypto.randomUUID(),
      createdAt: now,
      updatedAt: now,
    });
    return { ...job, nextRuns: this.validate(job) };
  }
  update(id: string, input: JobInput) {
    const previous = this.state.job(id);
    this.validate(input);
    const job = this.state.putJob({
      ...input,
      id,
      createdAt: previous.createdAt,
      updatedAt: new Date().toISOString(),
    });
    return { ...job, nextRuns: this.validate(job) };
  }
  delete(id: string) {
    this.state.deleteJob(id);
    return { deleted: true };
  }
  history(id: string): JobRun[] {
    const history = this.state.history(id);
    if (!history.some((run) => run.status === "running")) return history;
    const release = acquireLock(this.state.directory, `job-${id}`);
    if (!release) return history;
    try {
      this.interruptRuns(id);
      return this.state.history(id);
    } finally {
      release();
    }
  }
  // Only the holder of the job lease can establish that a running record is stale.
  private interruptRuns(id: string) {
    this.state.db.transaction(() => {
      for (const run of this.state.history(id))
        if (run.status === "running")
          this.state.putRun({
            ...run,
            status: "interrupted",
            finishedAt: new Date().toISOString(),
          });
    });
  }
  async run(id: string): Promise<JobRun> {
    if (this.assertInstance) await this.assertInstance();
    if (this.closing) throw new LocalError("CLOSING", "Job runtime is stopping");
    const startedAt = performance.now();
    const job = this.state.job(id);
    const release = acquireLock(this.state.directory, `job-${id}`);
    const run: JobRun = {
      id: crypto.randomUUID(),
      jobId: id,
      startedAt: new Date().toISOString(),
      finishedAt: null,
      status: "running",
      output: "",
      exitCode: null,
    };
    if (!release) {
      run.status = "skipped";
      run.finishedAt = new Date().toISOString();
      run.output = "Task is already running";
      this.state.putRun(run);
      this.recordRun(run, startedAt);
      return run;
    }
    const controller = new AbortController();
    let code: string | undefined;
    // Install the active entry before execution, including synchronous storage failures.
    const done = Promise.resolve().then(async () => {
      try {
        this.interruptRuns(id);
        this.state.putRun(run);
        try {
          if (job.action.type === "directory.scan") {
            const result = await this.files.scan(
              job.action.rootId,
              job.action.path,
              controller.signal,
            );
            run.output = JSON.stringify(result);
            run.status = "success";
            run.exitCode = 0;
          } else {
            const result = await this.processes.run(job.action.command, controller.signal);
            run.output = result.output;
            run.exitCode = result.exitCode;
            run.status = result.cancelled
              ? "cancelled"
              : result.exitCode === 0
                ? "success"
                : "failed";
          }
        } catch (error) {
          code = diagnosticCode(error);
          run.status = controller.signal.aborted ? "cancelled" : "failed";
          run.output = error instanceof Error ? error.message : "Task failed";
        }
        run.finishedAt = new Date().toISOString();
        this.state.putRun(run);
      } finally {
        release();
        this.active.delete(id);
      }
      this.emit({ version: 1, event: "job.finished", data: { ...run } });
      this.recordRun(run, startedAt, code);
      return run;
    });
    this.active.set(id, { controller, done });
    return done;
  }
  private recordRun(run: JobRun, startedAt: number, code?: string) {
    recordDiagnostic(this.record, {
      operation: "job.completed",
      id: run.id,
      jobId: run.jobId,
      status: run.status,
      exitCode: run.exitCode,
      elapsedMs: Math.max(0, Math.round(performance.now() - startedAt)),
      ...(code ? { code } : {}),
    });
  }
  startScheduler() {
    if (this.closing) throw new LocalError("CLOSING", "Job runtime is stopping");
    const release = acquireLock(this.state.directory, "scheduler");
    if (!release)
      throw new LocalError("SCHEDULER_BUSY", "Another Desktop engine is scheduling this profile");
    try {
      for (const job of this.state.jobs()) this.history(job.id);
      this.reconcile();
      this.interval = setInterval(() => this.reconcile(), 1000);
      this.releaseScheduler = release;
    } catch (error) {
      for (const cron of this.schedules) cron.stop();
      this.schedules = [];
      this.revision = -1;
      release();
      throw error;
    }
  }
  private reconcile() {
    const revision = this.state.revision();
    if (revision === this.revision) return;
    this.revision = revision;
    for (const cron of this.schedules) cron.stop();
    this.schedules = [];
    for (const job of this.state.jobs()) {
      if (!job.enabled) continue;
      let due: Date | null = null;
      const cron = new Cron(job.cron, { timezone: job.timezone }, () => {
        const now = Date.now();
        const expected = due;
        due = cron.nextRun();
        // Croner can wake after OS sleep. Never turn missed triggers into catch-up runs.
        if (expected && now - expected.getTime() > 2000) return;
        void this.run(job.id).catch((error) =>
          recordDiagnostic(this.record, {
            operation: "scheduler.failed",
            jobId: job.id,
            code: diagnosticCode(error),
          }),
        );
      });
      due = cron.nextRun();
      this.schedules.push(cron);
    }
  }
  async close() {
    this.closing = true;
    if (this.interval) clearInterval(this.interval);
    for (const cron of this.schedules) cron.stop();
    this.schedules = [];
    for (const { controller } of this.active.values()) controller.abort();
    await Promise.allSettled([...this.active.values()].map((item) => item.done));
    this.releaseScheduler?.();
    this.releaseScheduler = undefined;
  }
}
