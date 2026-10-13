import type { CloudApplication } from "@raypx/application";
import type { CloudRun } from "@raypx/core";
import { CloudExecutionError, publicFailureCode } from "./errors.js";

export type CloudExecutionOperations = Pick<
  CloudApplication,
  | "workerControl"
  | "workerAssets"
  | "acknowledgeCommand"
  | "startExecution"
  | "appendEvent"
  | "createWorkerAsset"
  | "completeWorkerAsset"
  | "finishExecution"
  | "finish"
  | "finishWithRevision"
  | "interrupt"
>;

export interface CloudExecutorOptions {
  app: Pick<
    CloudExecutionOperations,
    "workerControl" | "acknowledgeCommand" | "finish" | "interrupt"
  >;
  claimed: { run: CloudRun; epoch: number };
  ownerId: string;
  onError?: (error: unknown, runId: string) => void;
  onActivity?: (activity: CloudActivity) => void;
}

export interface CloudActivity {
  event: "run.started" | "run.settled";
  runId: string;
  durationMs?: number;
}

/** Keep durable lifecycle and ownership checks while model execution is unavailable. */
export function createCloudExecutor(
  options: CloudExecutorOptions,
): (runId: string, hostSignal?: AbortSignal) => Promise<void> {
  const { ownerId, claimed } = options;
  return async (runId, hostSignal) => {
    if (runId !== claimed.run.id) throw new Error("Claimed Run does not match execution request.");
    const runStartedAt = Date.now();
    const fence = { runId, ownerId, epoch: claimed.epoch };
    let cancelled = false;
    let checkingOwnership = false;
    options.onActivity?.({ event: "run.started", runId });
    try {
      hostSignal?.throwIfAborted();
      checkingOwnership = true;
      const snapshot = await options.app.workerControl(fence);
      cancelled = snapshot.run.cancelRequested;
      for (const command of snapshot.commands.filter((item) => item.status === "pending")) {
        if (command.type === "cancel") cancelled = true;
        await options.app.acknowledgeCommand({
          ...fence,
          commandId: command.id,
          status: command.type === "cancel" ? "applied" : "rejected",
        });
      }
      checkingOwnership = false;
      hostSignal?.throwIfAborted();
      if (cancelled) await options.app.finish({ ...fence, status: "cancelled" });
      else
        throw new CloudExecutionError("MODEL_UNAVAILABLE", "Cloud model execution is unavailable.");
    } catch (error) {
      options.onError?.(error, runId);
      try {
        if (hostSignal?.aborted && hostSignal.reason === "budget_exceeded")
          await options.app.finish({ ...fence, status: "failed", error: "BUDGET_EXCEEDED" });
        else if (hostSignal?.aborted || checkingOwnership) await options.app.interrupt(fence);
        else if (cancelled) await options.app.finish({ ...fence, status: "cancelled" });
        else
          await options.app.finish({ ...fence, status: "failed", error: publicFailureCode(error) });
      } catch {
        /* A terminal Run, expired lease or newer owner wins over this process. */
      }
    } finally {
      options.onActivity?.({ event: "run.settled", runId, durationMs: Date.now() - runStartedAt });
    }
  };
}
