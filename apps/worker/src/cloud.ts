import type { CloudApplication } from "@raypx/application";
import type { Mailer } from "@raypx/mail/types";
import type { OutboxItem } from "./index.js";
export { createCloudExecutor } from "./execution.js";
export type { CloudExecutorOptions, CloudExecutionOperations, CloudActivity } from "./execution.js";

export const CLOUD_WORKER_OWNER = `cloud-worker-${crypto.randomUUID()}`;
export function createCloudDispatcher(options: {
  app: CloudApplication;
  mailer: Mailer;
  webUrl: string;
}): (item: OutboxItem) => Promise<void> {
  return async (item) => {
    if (item.type === "cloud.run.queued") {
      const runId = item.payload.runId;
      if (typeof runId !== "string") throw new Error("Cloud run delivery is missing runId.");
      await options.app.acceptQueued({ runId });
      return;
    }
    if (item.type === "cloud.notification.created") {
      const notificationId = item.payload.notificationId;
      if (typeof notificationId !== "string")
        throw new Error("Notification delivery is missing notificationId.");
      const context = await options.app.getDeliveryContext({ notificationId });
      if (!context) return;
      const resourceId = context.notification.taskId ?? context.notification.conversationId;
      if (!resourceId) throw new Error("Notification has no accessible task or conversation.");
      const kinds = {
        "task.review": "review_ready",
        "run.failed": "run_failed",
        "task.waiting_input": "waiting_input",
        "task.completed": "task_completed",
      } as const;
      await options.mailer.sendTaskNotification({
        email: context.email,
        ...(context.name ? { name: context.name } : {}),
        locale: context.locale,
        kind: kinds[context.notification.type],
        taskId: resourceId,
        taskUrl: new URL(
          `/${context.notification.taskId ? "tasks" : "chat"}/${encodeURIComponent(resourceId)}`,
          options.webUrl,
        ).href,
        idempotencyKey: `notification:${notificationId}:${context.notification.recipientId}`,
      });
      await options.app.markNotificationDelivered({ notificationId });
      return;
    }
    throw new Error(`Unsupported cloud delivery type: ${item.type}`);
  };
}

export async function runCloudExecutions(
  options: {
    app: CloudApplication;
    execute: (runId: string, signal?: AbortSignal) => Promise<void>;
    concurrency?: number;
    pollMs?: number;
    onError?: (error: unknown) => void;
  },
  signal: AbortSignal,
): Promise<void> {
  const active = new Map<string, Promise<void>>();
  const concurrency = options.concurrency ?? 3;
  const controller = new AbortController();
  const stop = () => controller.abort("shutdown");
  signal.addEventListener("abort", stop, { once: true });
  if (signal.aborted) stop();
  try {
    while (!controller.signal.aborted) {
      const ready = await options.app.listReadyRuns({
        limit: Math.max(0, concurrency - active.size),
      });
      for (const run of ready)
        if (!active.has(run.id) && active.size < concurrency) {
          const pending = options
            .execute(run.id, controller.signal)
            .catch((error: unknown) => options.onError?.(error))
            .finally(() => active.delete(run.id));
          active.set(run.id, pending);
        }
      if (!controller.signal.aborted)
        await new Promise<void>((resolve) => {
          const timer = setTimeout(done, options.pollMs ?? 250);
          function done() {
            clearTimeout(timer);
            controller.signal.removeEventListener("abort", done);
            resolve();
          }
          controller.signal.addEventListener("abort", done, { once: true });
        });
    }
  } finally {
    controller.abort("execution_loop_stopped");
    signal.removeEventListener("abort", stop);
    await Promise.allSettled(active.values());
  }
}
