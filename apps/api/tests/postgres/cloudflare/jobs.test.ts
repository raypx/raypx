import { afterAll, beforeAll, describe, expect, it } from "vite-plus/test";
import { connectDatabase, migrateDatabase } from "@raypx/database";
import { cloudJob, controlDevice, user } from "@raypx/database/schema";
import { runWorkerSchedule } from "../../helpers/worker.js";
import { eq, sql } from "drizzle-orm";
import { createCloudJobsRepository } from "../../../server/jobs/repository.js";

const url = process.env.TEST_DATABASE_URL;
if (!url || !new URL(url).pathname.endsWith("_test"))
  throw new Error("An isolated *_test database is required");
const connection = connectDatabase(url, { max: 1 });
const repository = createCloudJobsRepository(connection.db);
const owner = `worker-jobs-${crypto.randomUUID()}`;
beforeAll(async () => {
  await migrateDatabase(url);
  await connection.db
    .insert(user)
    .values({ id: owner, name: "Worker jobs fixture", email: `${owner}@example.test` });
});
afterAll(async () => {
  try {
    await connection.db.delete(user).where(eq(user.id, owner));
  } finally {
    await connection.close();
  }
});

describe.each(["direct", "hyperdrive"])("Worker cloud jobs (%s)", (mode) => {
  it("claims a persisted occurrence, reaches the account room and records an offline skip once", async () => {
    const deviceId = crypto.randomUUID();
    await connection.db.insert(controlDevice).values({
      id: deviceId,
      userId: owner,
      deviceId,
      body: {
        id: deviceId,
        deviceId,
        installationId: crypto.randomUUID(),
        name: "Offline fixture",
        platform: "darwin",
        appVersion: "0.1.0",
        epoch: 1,
        revoked: false,
        lastSeenAt: null,
        streamId: null,
        instanceId: null,
        connectionId: null,
        cursor: 0,
        initialized: false,
        capabilities: [],
      },
    });
    const job = await repository.create(
      owner,
      {
        name: `Worker ${mode}`,
        cron: "* * * * *",
        timezone: "UTC",
        enabled: true,
        action: { type: "device.sync", deviceId, epoch: 1 },
      },
      new Date(Date.now() + 3_600_000).toISOString(),
      crypto.randomUUID(),
    );
    await connection.db
      .update(cloudJob)
      .set({ nextRunAt: sql`now()` })
      .where(eq(cloudJob.id, job.id));
    await runWorkerSchedule(url, mode, "schedules");
    const runs = await repository.history(owner, job.id, 50);
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ status: "skipped", code: "DEVICE_OFFLINE", taskId: null });
    const saved = (await repository.list(owner)).find((item) => item.id === job.id)!;
    expect(Date.parse(saved.nextRunAt!)).toBeGreaterThan(Date.parse(runs[0]!.scheduledFor));
  }, 65_000);
});
