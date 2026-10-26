import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vite-plus/test";
import { connectDatabase, migrateDatabase } from "@raypx/database";
import { cloudJob, controlDevice, user } from "@raypx/database/schema";
import { pinnedNode } from "@raypx/tooling/repository";
import { eq, sql } from "drizzle-orm";
import { createCloudJobsRepository } from "../../../server/jobs/repository.js";

const url = process.env.TEST_DATABASE_URL;
if (!url || !new URL(url).pathname.endsWith("_test"))
  throw new Error("An isolated *_test database is required");
const root = fileURLToPath(new URL("../../../../../", import.meta.url));
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

async function scheduled(mode: string) {
  const child = spawn(
    pinnedNode(root),
    [fileURLToPath(import.meta.resolve("@raypx/tooling/cloudflare")), root, "--run-api-schedules"],
    {
      cwd: root,
      env: { ...process.env, TEST_DATABASE_URL: url!, TEST_DATABASE_MODE: mode },
      stdio: ["ignore", "ignore", "pipe"],
    },
  );
  await new Promise<void>((resolve, reject) => {
    let diagnostic = "";
    child.stderr.on("data", (chunk: Buffer) => {
      diagnostic = (diagnostic + chunk.toString())
        .replace(/postgres(?:ql)?:\/\/[^\s]+/g, "[DATABASE_URL]")
        .slice(-2000);
    });
    const timeout = setTimeout(() => child.kill("SIGKILL"), 60_000);
    child.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once("exit", (code) => {
      clearTimeout(timeout);
      if (code === 0) resolve();
      else reject(new Error(`Worker jobs fixture exited ${code}: ${diagnostic}`));
    });
  });
}

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
    await scheduled(mode);
    const runs = await repository.history(owner, job.id, 50);
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ status: "skipped", code: "DEVICE_OFFLINE", taskId: null });
    const saved = (await repository.list(owner)).find((item) => item.id === job.id)!;
    expect(Date.parse(saved.nextRunAt!)).toBeGreaterThan(Date.parse(runs[0]!.scheduledFor));
  }, 65_000);
});
