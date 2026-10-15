import { Cron } from "croner";
import type { JobDefinition, JobInput, JobRun, LocalEvent } from "@raypx/contracts/local";
import { LocalError } from "../errors";
import type { FileRuntime } from "../files";
import type { ProcessRuntime } from "../process";
import { acquireLock, type StateStore } from "../state";

export class JobRuntime {
  private schedules: Cron[] = [];
  private revision = -1;
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
  ) {}
  validate(input: JobInput) {
    if (input.cron.trim().split(/\s+/).length !== 5)
      throw new LocalError("INVALID_CRON", "Use a five-field Cron expression");
    try {
      new Intl.DateTimeFormat("en", { timeZone: input.timezone });
      const cron = new Cron(input.cron, { timezone: input.timezone, paused: true });
      const dates = cron.nextRuns(5);
      cron.stop();
      if (dates.length === 0) throw new Error("No future execution");
      return dates.map((date) => date.toISOString());
    } catch (error) {
      throw new LocalError(
        "INVALID_CRON",
        error instanceof Error ? error.message : "Invalid Cron expression or time zone",
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
  async run(id: string): Promise<JobRun> {
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
      return run;
    }
    // Acquiring the kernel-backed job lease proves prior running records are stale.
    for (const previous of this.state.history(id))
      if (previous.status === "running")
        this.state.putRun({
          ...previous,
          status: "interrupted",
          finishedAt: new Date().toISOString(),
        });
    this.state.putRun(run);
    const controller = new AbortController();
    const done = (async () => {
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
        run.status = controller.signal.aborted ? "cancelled" : "failed";
        run.output = error instanceof Error ? error.message : "Task failed";
      } finally {
        run.finishedAt = new Date().toISOString();
        this.state.putRun(run);
        release();
        this.active.delete(id);
        this.emit({ version: 1, event: "job.finished", data: { ...run } });
      }
      return run;
    })();
    this.active.set(id, { controller, done });
    return done;
  }
  startScheduler() {
    const release = acquireLock(this.state.directory, "scheduler");
    if (!release)
      throw new LocalError("SCHEDULER_BUSY", "Another Desktop engine is scheduling this profile");
    this.releaseScheduler = release;
    this.reconcile();
    this.interval = setInterval(() => this.reconcile(), 1000);
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
          console.error(
            "Scheduled task failed:",
            error instanceof Error ? error.message : "Unknown failure",
          ),
        );
      });
      due = cron.nextRun();
      this.schedules.push(cron);
    }
  }
  async close() {
    if (this.interval) clearInterval(this.interval);
    for (const cron of this.schedules) cron.stop();
    this.schedules = [];
    for (const { controller } of this.active.values()) controller.abort();
    await Promise.allSettled([...this.active.values()].map((item) => item.done));
    this.releaseScheduler?.();
    this.releaseScheduler = undefined;
  }
}
