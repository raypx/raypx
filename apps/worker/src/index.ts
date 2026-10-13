import type { OutboxEvent, OutboxRepository } from "@raypx/core";
export { createCloudDispatcher, createCloudExecutor, runCloudExecutions } from "./cloud.js";
export type { CloudExecutorOptions } from "./cloud.js";

export type OutboxItem = OutboxEvent;
export type { OutboxRepository } from "@raypx/core";

export interface WorkerOptions {
  outbox: OutboxRepository;
  dispatch: (item: OutboxItem) => Promise<void>;
  pollMs?: number;
  leaseMs?: number;
  batchSize?: number;
  workerId?: string;
  sleep?: (ms: number) => Promise<void>;
  onError?: (error: unknown, item: OutboxItem) => void;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const initialRetryDelayMs = 1_000;
const maximumRetryDelayMs = 60_000;
const maximumRetryExponent = Math.ceil(Math.log2(maximumRetryDelayMs / initialRetryDelayMs));

function retryDelayMs(attempts: number): number {
  const exponent = Math.max(0, Math.min(maximumRetryExponent, attempts - 1));
  return Math.min(maximumRetryDelayMs, initialRetryDelayMs * 2 ** exponent);
}

/**
 * Run the Agent outbox loop. The repository owns the atomic lease operation;
 * dispatch failures schedule only that item for a later retry.
 */
export async function runWorker(options: WorkerOptions, signal?: AbortSignal): Promise<void> {
  const pollMs = options.pollMs ?? 1_000;
  const leaseMs = options.leaseMs ?? 60_000;
  const batchSize = options.batchSize ?? 10;
  const workerId = options.workerId ?? "worker-default";
  const sleep = options.sleep ?? defaultSleep;

  while (!signal?.aborted) {
    const items = await options.outbox.claim({ workerId, limit: batchSize, leaseMs });
    if (items.length === 0) {
      await sleep(pollMs);
      continue;
    }

    const results = await Promise.allSettled(
      items.map(async (item) => {
        const lease = { id: item.id, workerId, attempts: item.attempts };
        try {
          await options.dispatch(item);
          await options.outbox.acknowledge(lease);
        } catch (error) {
          await options.outbox.release({ ...lease, retryDelayMs: retryDelayMs(item.attempts) });
          if (options.onError) {
            options.onError(error, item);
          } else throw error;
        }
      }),
    );
    const failed = results.find((result) => result.status === "rejected");
    if (failed?.status === "rejected") throw failed.reason;
  }
}
