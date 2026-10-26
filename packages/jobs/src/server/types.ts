import type { TaskStatus } from "@raypx/core/tasks";
import type { CloudJob, CloudJobAction, CloudJobInput, CloudJobRun } from "../model.js";

export interface JobClaim {
  userId: string;
  job: CloudJob;
  run: CloudJobRun;
  /** Only the atomic claimant may dispatch; duplicate manual IDs return the stored result. */
  claimed: boolean;
}
export type JobRunUpdate = Pick<CloudJobRun, "status" | "finishedAt" | "code" | "sync">;
export interface CloudJobsRepository {
  list(userId: string): Promise<CloudJob[]>;
  get(userId: string, id: string): Promise<CloudJob>;
  create(
    userId: string,
    input: CloudJobInput,
    nextRunAt: string | null,
    requestId: string,
  ): Promise<CloudJob>;
  update(
    userId: string,
    id: string,
    revision: number,
    input: CloudJobInput,
    nextRunAt: string | null,
  ): Promise<CloudJob>;
  remove(userId: string, id: string, revision: number): Promise<{ deleted: true }>;
  history(userId: string, id: string, limit: number): Promise<CloudJobRun[]>;
  /** DB time, row locks and unique occurrence keys; advance to the next future slot, never catch up. */
  claimDue(limit: number): Promise<JobClaim[]>;
  claimManual(userId: string, id: string, requestId: string): Promise<JobClaim>;
  active(limit: number): Promise<JobClaim[]>;
  /** Never downgrade an authoritative terminal result. Pause atomically on uncertain delivery. */
  updateRun(
    userId: string,
    id: string,
    update: JobRunUpdate,
    pause?: boolean,
  ): Promise<CloudJobRun>;
}
export type JobDispatchResult =
  | { type: "synced"; streamId: string; sequence: number }
  | { type: "task"; taskId: string; status: TaskStatus };
export interface CloudJobExecutor {
  /** Ownership, captured device epoch, project and available provider are checked again per run. */
  validate(userId: string, action: CloudJobAction): Promise<void>;
  /** For agent.run, run.id === run.taskId === command.id. Never create a new ID on retry. */
  execute(userId: string, run: CloudJobRun, signal: AbortSignal): Promise<JobDispatchResult>;
  task(userId: string, taskId: string): Promise<{ status: TaskStatus } | null>;
}
export interface CloudJobsServiceOptions {
  repository: CloudJobsRepository;
  executor: CloudJobExecutor;
  enabled: boolean;
  now?: () => number;
  dispatchTimeoutMs?: number;
}
