import { JobError, type CloudJobAction, type CloudJobRun } from "@raypx/jobs";
import type { CloudJobExecutor, JobDispatchResult } from "@raypx/jobs/server";
import { ControlError, type ControlService } from "../control/service.js";

export interface RelayJobTransport {
  dispatch(
    userId: string,
    run: CloudJobRun,
    signal: AbortSignal,
  ): Promise<Extract<JobDispatchResult, { type: "task" }>>;
  sync(
    userId: string,
    run: CloudJobRun,
    signal: AbortSignal,
  ): Promise<Extract<JobDispatchResult, { type: "synced" }>>;
}
/** Internal application port. No browser session, credentials or public execution route. */
export function createRelayJobExecutor(
  control: ControlService,
  transport: RelayJobTransport,
): CloudJobExecutor {
  const validate = async (userId: string, action: CloudJobAction) => {
    try {
      await control.validateJobTarget(userId, action);
    } catch (error) {
      throw new JobError(error instanceof ControlError ? error.code : "SERVER_UNAVAILABLE");
    }
  };
  return {
    validate,
    async execute(userId, run, signal) {
      if (signal.aborted) throw new JobError("REQUEST_TIMEOUT");
      await validate(userId, run.action);
      if (signal.aborted) throw new JobError("REQUEST_TIMEOUT");
      if (run.action.type === "agent.run") {
        if (run.taskId !== run.id) throw new JobError("IDEMPOTENCY_CONFLICT");
        return transport.dispatch(userId, run, signal);
      }
      return transport.sync(userId, run, signal);
    },
    async task(userId, taskId) {
      try {
        return await control.jobTask(userId, taskId);
      } catch (error) {
        throw new JobError(error instanceof ControlError ? error.code : "SERVER_UNAVAILABLE");
      }
    },
  };
}
