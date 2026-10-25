import { afterEach, expect, it, vi } from "vite-plus/test";
import type { Database } from "@raypx/database/connection";
import type { SafeEvent } from "@raypx-kit/logger/safe";
import { createCleanupJob, runCleanupJob } from "../../../server/jobs/cleanup.js";
import { configurationDefaults } from "@raypx/contracts/api";
import { createApiLogging, type ApiLogging } from "../../../server/logging.js";
import { getApiEnvironment } from "../../../server/env.js";

let logger: ApiLogging | undefined;
afterEach(async () => {
  await logger?.close();
});

it("requires explicit enablement and rejects misspelled flags", () => {
  expect(getApiEnvironment({ NODE_ENV: "test" }).JOBS_ENABLED).toBe(false);
  expect(getApiEnvironment({ NODE_ENV: "test", JOBS_ENABLED: "true" }).JOBS_ENABLED).toBe(true);
  expect(() => getApiEnvironment({ NODE_ENV: "test", JOBS_ENABLED: "yes" })).toThrow(
    "JOBS_ENABLED",
  );
});

it("does not query the database while disabled", async () => {
  const transaction = vi.fn();
  const events: SafeEvent[] = [];
  logger = createApiLogging({
    environment: "test",
    sink: ({ event }) => {
      events.push(event);
    },
  });
  expect(await runCleanupJob({ transaction } as unknown as Database, logger, false)).toEqual({
    status: "disabled",
    sessions: 0,
    verifications: 0,
    rateLimits: 0,
    observedRequests: 0,
    observedSessions: 0,
  });
  expect(transaction).not.toHaveBeenCalled();
  await logger.flush();
  expect(events[0]).toMatchObject({ operation: "job.cleanup", job: { status: "disabled" } });
});

it("propagates a safe failure for the scheduler without logging driver details", async () => {
  const secret = "private-connection-password-and-session-token";
  const transaction = vi.fn().mockRejectedValue(new Error(secret));
  const events: SafeEvent[] = [];
  logger = createApiLogging({
    environment: "test",
    sink: ({ event }) => {
      events.push(event);
    },
  });
  await expect(runCleanupJob({ transaction } as unknown as Database, logger, true)).rejects.toThrow(
    "Cleanup job failed",
  );
  await logger.flush();
  expect(events[0]).toMatchObject({ operation: "job.cleanup", status: 500, code: "JOB_FAILED" });
  expect(JSON.stringify(events)).not.toContain(secret);
});

it("injects a live reader and keeps the deployment gate authoritative", async () => {
  const events: SafeEvent[] = [];
  logger = createApiLogging({
    environment: "test",
    sink: ({ event }) => {
      events.push(event);
    },
  });
  const transaction = vi.fn();
  const configuration = {
    read: vi.fn(async () => ({
      values: { ...configurationDefaults, cleanupEnabled: false },
      revision: 0,
      updatedAt: null,
    })),
  };
  const dependencies = { db: { transaction } as unknown as Database, logger, configuration };
  expect(await createCleanupJob({ ...dependencies, enabled: false })()).toMatchObject({
    status: "disabled",
  });
  expect(configuration.read).not.toHaveBeenCalled();
  const run = createCleanupJob({ ...dependencies, enabled: true });
  expect(await run()).toMatchObject({ status: "disabled" });
  const secret = "private-configuration-storage-credential";
  vi.mocked(configuration.read).mockRejectedValue(new Error(secret));
  await expect(run()).rejects.toThrow(/^Cleanup job failed$/);
  expect(configuration.read).toHaveBeenCalledTimes(2);
  expect(transaction).not.toHaveBeenCalled();
  await logger.flush();
  expect(events.at(-1)).toMatchObject({
    operation: "job.cleanup",
    status: 500,
    code: "JOB_FAILED",
  });
  expect(JSON.stringify(events)).not.toContain(secret);
});
