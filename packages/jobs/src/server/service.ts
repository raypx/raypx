import { activeTaskStatuses } from "@raypx/core/tasks";
import {
  cloudJobInputSchema,
  cloudJobCreateSchema,
  type CloudJobCreateInput,
  type CloudJobAction,
  type CloudJobInput,
  type CloudJobRun,
  type CloudJobRunStatus,
} from "../model.js";
import { JobError, nextJobRuns } from "../schedule.js";
import type { CloudJobsServiceOptions, JobClaim, JobRunUpdate } from "./types.js";

const knownFailures = new Set([
  "DEVICE_OFFLINE",
  "DEVICE_REVOKED",
  "DEVICE_CHANGED",
  "NOT_FOUND",
  "PROJECT_UNAVAILABLE",
  "PROVIDER_UNAVAILABLE",
  "AGENT_UNAVAILABLE",
  "PROJECT_BUSY",
  "TASK_BUSY",
  "UPGRADE_REQUIRED",
  "CONTROL_UNAVAILABLE",
  "REQUEST_CLOSED",
  "DELIVERY_EXPIRED",
  "AUTH_REQUIRED",
  "DEVICE_REPLACED",
  "CONTEXT_NOT_FOUND",
  "CONTEXT_ARCHIVED",
  "CONTEXT_PROJECT_MISMATCH",
  "CONTEXT_TOO_LARGE",
  "CONTEXT_UNAVAILABLE",
]);
const skipFailures = new Set([
  "DEVICE_OFFLINE",
  "DEVICE_REVOKED",
  "DEVICE_CHANGED",
  "NOT_FOUND",
  "PROJECT_UNAVAILABLE",
  "PROVIDER_UNAVAILABLE",
  "AGENT_UNAVAILABLE",
  "PROJECT_BUSY",
  "TASK_BUSY",
  "AUTH_REQUIRED",
]);

function sameAction(left: CloudJobAction, right: CloudJobAction) {
  return (
    left.type === right.type &&
    left.deviceId === right.deviceId &&
    left.epoch === right.epoch &&
    (left.type === "device.sync" ||
      (right.type === "agent.run" &&
        left.projectId === right.projectId &&
        left.provider === right.provider &&
        left.mode === right.mode &&
        left.prompt === right.prompt &&
        JSON.stringify(left.contextSelection) === JSON.stringify(right.contextSelection)))
  );
}

/** Use cases shared by Node and Worker schedulers. Platform schedules, SQL and routing are injected. */
export class CloudJobsService {
  private readonly now: () => number;
  private readonly timeout: number;
  constructor(private readonly options: CloudJobsServiceOptions) {
    this.now = options.now ?? Date.now;
    this.timeout = options.dispatchTimeoutMs ?? 8_000;
    if (!Number.isInteger(this.timeout) || this.timeout < 1 || this.timeout > 10_000)
      throw new JobError("INVALID_JOB");
  }
  private owner(userId: string) {
    if (!userId) throw new JobError("AUTH_REQUIRED");
    return userId;
  }
  private input(value: CloudJobInput) {
    const parsed = cloudJobInputSchema.safeParse(value);
    if (!parsed.success) throw new JobError("INVALID_JOB");
    const next = nextJobRuns(parsed.data, new Date(this.now()), 1)[0]!;
    return { input: parsed.data, next: parsed.data.enabled ? next : null };
  }
  async list(userId: string) {
    return {
      enabled: this.options.enabled,
      jobs: await this.options.repository.list(this.owner(userId)),
    };
  }
  async create(userId: string, value: CloudJobCreateInput) {
    this.owner(userId);
    const parsed = cloudJobCreateSchema.safeParse(value);
    if (!parsed.success) throw new JobError("INVALID_JOB");
    const { requestId, ...job } = parsed.data;
    const { input, next } = this.input(job);
    await this.options.executor.validate(userId, input.action);
    return this.options.repository.create(userId, input, next, requestId);
  }
  async update(userId: string, value: { id: string; revision: number; job: CloudJobInput }) {
    this.owner(userId);
    const { input, next } = this.input(value.job);
    const current = input.enabled ? null : await this.options.repository.get(userId, value.id);
    // Disabling an unchanged target remains possible after its authorization is revoked.
    if (!current || !sameAction(current.action, input.action))
      await this.options.executor.validate(userId, input.action);
    return this.options.repository.update(userId, value.id, value.revision, input, next);
  }
  remove(userId: string, value: { id: string; revision: number }) {
    return this.options.repository.remove(this.owner(userId), value.id, value.revision);
  }
  history(userId: string, value: { id: string; limit?: number | undefined }) {
    const limit = value.limit ?? 50;
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new JobError("INVALID_JOB");
    return this.options.repository.history(this.owner(userId), value.id, limit);
  }
  async run(userId: string, value: { id: string; requestId: string }) {
    this.owner(userId);
    if (!this.options.enabled) throw new JobError("JOBS_DISABLED");
    const claim = await this.options.repository.claimManual(userId, value.id, value.requestId);
    return claim.claimed ? this.execute(claim) : claim.run;
  }
  private patch(status: CloudJobRunStatus, code: string | null = null): JobRunUpdate {
    return {
      status,
      finishedAt: ["running", "waiting", "dispatching", "unknown"].includes(status)
        ? null
        : new Date(this.now()).toISOString(),
      code,
      sync: null,
    };
  }
  private async execute(claim: JobClaim): Promise<CloudJobRun> {
    const { userId, run } = claim;
    let dispatched = false;
    try {
      // A persisted plan is consent for its captured target, never a browser-session surrogate.
      await this.options.executor.validate(userId, run.action);
      const signal = AbortSignal.timeout(this.timeout);
      const result = await new Promise<Awaited<ReturnType<typeof this.options.executor.execute>>>(
        (resolve, reject) => {
          const aborted = () => reject(new JobError("DELIVERY_EXPIRED", true));
          signal.addEventListener("abort", aborted, { once: true });
          dispatched = true;
          this.options.executor.execute(userId, run, signal).then(
            (value) => {
              signal.removeEventListener("abort", aborted);
              resolve(value);
            },
            (error: unknown) => {
              signal.removeEventListener("abort", aborted);
              reject(error);
            },
          );
        },
      );
      if (result.type === "synced" && run.action.type === "device.sync")
        return this.options.repository.updateRun(userId, run.id, {
          ...this.patch("success"),
          sync: { streamId: result.streamId, sequence: result.sequence },
        });
      if (result.type !== "task" || run.action.type !== "agent.run" || result.taskId !== run.taskId)
        throw new JobError("DELIVERY_UNCERTAIN", true);
      return this.options.repository.updateRun(userId, run.id, this.taskPatch(result.status));
    } catch (error) {
      const failure = error instanceof JobError ? error : new JobError("JOB_FAILED", dispatched);
      const unknown = run.action.type === "agent.run" && dispatched && failure.uncertain;
      const code = unknown
        ? "DELIVERY_UNCERTAIN"
        : knownFailures.has(failure.code)
          ? failure.code
          : "JOB_FAILED";
      const status = unknown ? "unknown" : skipFailures.has(code) ? "skipped" : "failed";
      const pause =
        unknown ||
        [
          "DEVICE_REVOKED",
          "DEVICE_CHANGED",
          "AUTH_REQUIRED",
          "CONTEXT_NOT_FOUND",
          "CONTEXT_ARCHIVED",
          "CONTEXT_PROJECT_MISMATCH",
          "CONTEXT_TOO_LARGE",
        ].includes(code);
      return this.options.repository.updateRun(userId, run.id, this.patch(status, code), pause);
    }
  }
  private taskPatch(status: Parameters<typeof activeTaskStatuses.includes>[0]): JobRunUpdate {
    if (activeTaskStatuses.includes(status))
      return this.patch(status === "waiting" ? "waiting" : "running");
    return this.patch(
      status === "succeeded"
        ? "success"
        : status === "cancelled"
          ? "cancelled"
          : status === "interrupted"
            ? "interrupted"
            : "failed",
      status === "failed"
        ? "AGENT_FAILED"
        : status === "delivery_failed"
          ? "DELIVERY_FAILED"
          : null,
    );
  }
  private async reconcile(claim: JobClaim) {
    const { run, userId } = claim;
    if (run.taskId) {
      const task = await this.options.executor.task(userId, run.taskId);
      if (task) {
        await this.options.repository.updateRun(userId, run.id, this.taskPatch(task.status));
        return;
      }
    }
    if (run.status !== "dispatching" || this.now() - Date.parse(run.startedAt) < 120_000) return;
    const unknown = run.action.type === "agent.run";
    await this.options.repository.updateRun(
      userId,
      run.id,
      this.patch(
        unknown ? "unknown" : "interrupted",
        unknown ? "DELIVERY_UNCERTAIN" : "HOST_RESTARTED",
      ),
      unknown,
    );
  }
  async tick() {
    if (!this.options.enabled) return { enabled: false, claimed: 0, reconciled: 0, failed: 0 };
    const active = await this.options.repository.active(25);
    const reconciliation = await Promise.allSettled(active.map((claim) => this.reconcile(claim)));
    const due = await this.options.repository.claimDue(25);
    const claimed = due.filter((claim) => claim.claimed);
    const dispatches: PromiseSettledResult<CloudJobRun>[] = [];
    for (let offset = 0; offset < claimed.length; offset += 5)
      dispatches.push(
        ...(await Promise.allSettled(
          claimed.slice(offset, offset + 5).map((claim) => this.execute(claim)),
        )),
      );
    return {
      enabled: true,
      claimed: claimed.length,
      reconciled: reconciliation.filter((item) => item.status === "fulfilled").length,
      failed: [...reconciliation, ...dispatches].filter((item) => item.status === "rejected")
        .length,
    };
  }
}
