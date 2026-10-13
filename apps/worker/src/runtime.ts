import { connectDatabase, PostgresCloudRepository } from "@raypx/db";
import { createCloudApplication } from "@raypx/application";
import { defaultCloudLimits } from "@raypx/core";
import { createS3Storage, createFilesystemStorage } from "@raypx/storage";
import { configureLogger, logger } from "@raypx/shared/logger";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getWorkerEnvironment } from "./env.js";
import { CLOUD_WORKER_OWNER, runCloudExecutions } from "./cloud.js";
import { startWorkerTelemetry } from "./telemetry.js";
import { createProcessExecutor } from "./process-executor.js";

export interface WorkerRuntime {
  run(signal?: AbortSignal): Promise<void>;
  close(): Promise<void>;
}

/** Multi-instance delivery host; each claimed Run owns a fenced lease and Bun child. */
export async function createCloudWorkerRuntime(
  values?: Record<string, string | boolean | number | undefined>,
): Promise<WorkerRuntime> {
  const env = getWorkerEnvironment(values);
  if (
    env.NODE_ENV === "production" &&
    (!env.CLOUD_ACCOUNT_MODEL_CALL_LIMIT ||
      !env.CLOUD_ACCOUNT_CONCURRENCY ||
      !env.CLOUD_ACCOUNT_STORAGE_BYTES)
  )
    throw new Error("Production Worker requires explicit positive account quotas.");
  if (env.NODE_ENV === "production" && !env.S3_BUCKET)
    throw new Error("Production Worker requires private S3 storage.");
  if (Boolean(env.S3_ACCESS_KEY_ID) !== Boolean(env.S3_SECRET_ACCESS_KEY))
    throw new Error("S3 credentials require both fields.");
  configureLogger({ service: "raypx-worker" });
  const controller = new AbortController();
  const connection = connectDatabase(env.DATABASE_URL);
  const storage = env.S3_BUCKET
    ? createS3Storage({
        bucket: env.S3_BUCKET,
        region: env.S3_REGION,
        ...(env.S3_ENDPOINT ? { endpoint: env.S3_ENDPOINT } : {}),
        forcePathStyle: env.S3_FORCE_PATH_STYLE,
        ...(env.S3_ACCESS_KEY_ID && env.S3_SECRET_ACCESS_KEY
          ? {
              credentials: {
                accessKeyId: env.S3_ACCESS_KEY_ID,
                secretAccessKey: env.S3_SECRET_ACCESS_KEY,
              },
            }
          : {}),
      })
    : createFilesystemStorage({
        directory: env.BLOB_STORAGE_DIR ?? join(tmpdir(), "raypx-cloud-objects"),
        ...(!env.BLOB_STORAGE_DIR
          ? { legacyDirectory: join(tmpdir(), "voidmix-cloud-objects") }
          : {}),
      });
  const limits = {
    ...defaultCloudLimits,
    accountCalls: env.CLOUD_ACCOUNT_MODEL_CALL_LIMIT ?? 100,
    accountConcurrentRuns: env.CLOUD_ACCOUNT_CONCURRENCY ?? 2,
    accountStorageBytes: env.CLOUD_ACCOUNT_STORAGE_BYTES ?? 100 * 1024 * 1024,
  };
  const app = createCloudApplication({
    repository: new PostgresCloudRepository(connection.db),
    limits,
  });
  try {
    await app.recoverInterrupted({ ownerId: CLOUD_WORKER_OWNER });
  } catch (error) {
    await connection.close();
    await storage.close?.();
    throw error;
  }
  const telemetry = startWorkerTelemetry(env.SENTRY_DSN);
  const report = (error: unknown, runId?: string) => {
    // Provider exceptions can contain prompts, file data, headers or credentials.
    const code =
      error &&
      typeof error === "object" &&
      "code" in error &&
      typeof error.code === "string" &&
      /^[A-Z_0-9]{1,60}$/.test(error.code)
        ? error.code
        : "WORKER_OPERATION_FAILED";
    logger({ service: "raypx-worker", ...(runId ? { runId } : {}), errorCode: code }).emit();
    telemetry.capture(code, runId);
  };
  const baseExecute = createProcessExecutor({
    app,
    ownerId: CLOUD_WORKER_OWNER,
    gatewayUrl: env.CLOUD_EXECUTION_GATEWAY_URL,
    limits,
    onError: report,
  });
  const execute = (runId: string, signal?: AbortSignal) =>
    telemetry.trace(runId, () => baseExecute(runId, signal));
  let running: Promise<void> | undefined;
  return {
    run(signal) {
      if (running) throw new Error("Worker runtime is already running.");
      const stop = () => controller.abort("shutdown");
      signal?.addEventListener("abort", stop, { once: true });
      if (signal?.aborted) stop();
      running = (async () => {
        try {
          const outcomes = await Promise.allSettled([
            runCloudExecutions(
              { app, execute, concurrency: env.CLOUD_WORKER_CONCURRENCY, onError: report },
              controller.signal,
            ).catch((error: unknown) => {
              controller.abort("execution_loop_failed");
              throw error;
            }),
            (async () => {
              while (!controller.signal.aborted) {
                try {
                  await app.recoverInterrupted({ ownerId: CLOUD_WORKER_OWNER });
                  for (const asset of await app.listExpiredUploads({ limit: 25 })) {
                    if (controller.signal.aborted) break;
                    const claimed = await app.claimExpiredUpload({ assetVersionId: asset.id });
                    if (!claimed) continue;
                    await storage.remove(claimed.objectKey);
                    await app.removeExpiredUpload({ assetVersionId: claimed.id });
                  }
                } catch (error) {
                  report(error);
                }
                if (!controller.signal.aborted)
                  await new Promise<void>((resolve) => {
                    const timer = setTimeout(done, 60_000);
                    function done() {
                      clearTimeout(timer);
                      controller.signal.removeEventListener("abort", done);
                      resolve();
                    }
                    controller.signal.addEventListener("abort", done, { once: true });
                  });
              }
            })(),
          ]);
          const failed = outcomes.find((outcome) => outcome.status === "rejected");
          if (failed?.status === "rejected") throw failed.reason;
        } finally {
          signal?.removeEventListener("abort", stop);
        }
      })();
      return running;
    },
    async close() {
      controller.abort("shutdown");
      if (running) await running.catch(() => {});
      await connection.close();
      await storage.close?.();
      await telemetry.close();
    },
  };
}
