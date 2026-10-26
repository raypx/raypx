import { afterAll, beforeAll, expect, it } from "vite-plus/test";
import { connectDatabase, migrateDatabase } from "@raypx/database";
import { cloudJob, cloudJobRun, controlTask, user } from "@raypx/database/schema";
import { and, eq, sql } from "drizzle-orm";
import type { CloudJobInput } from "@raypx/jobs";
import { createCloudJobsRepository } from "../../../server/jobs/repository.js";

const url = process.env.TEST_DATABASE_URL;
if (!url || !new URL(url).pathname.endsWith("_test"))
  throw new Error("An isolated *_test database is required");
const connection = connectDatabase(url, { max: 1 });
const otherConnection = connectDatabase(url, { max: 1 });
const repository = createCloudJobsRepository(connection.db);
const other = createCloudJobsRepository(otherConnection.db);
const owner = `jobs-${crypto.randomUUID()}`,
  stranger = `other-${crypto.randomUUID()}`;
const future = () => new Date(Date.now() + 3600_000).toISOString();
const input = (): CloudJobInput => ({
  name: "Sync fixture",
  cron: "* * * * *",
  timezone: "UTC",
  enabled: true,
  action: { type: "device.sync", deviceId: crypto.randomUUID(), epoch: 1 },
});
const agentInput = (): CloudJobInput => ({
  ...input(),
  action: {
    type: "agent.run",
    deviceId: crypto.randomUUID(),
    epoch: 1,
    projectId: crypto.randomUUID(),
    provider: "codex",
    mode: "run",
    prompt: "Original immutable task",
  },
});
beforeAll(async () => {
  await migrateDatabase(url);
  await connection.db
    .insert(user)
    .values(
      [owner, stranger].map((id) => ({ id, name: "Jobs fixture", email: `${id}@example.test` })),
    );
});
afterAll(async () => {
  try {
    await connection.db.delete(user).where(sql`${user.id} in (${owner},${stranger})`);
  } finally {
    await Promise.all([connection.close(), otherConnection.close()]);
  }
});

it("isolates owners, compares revisions and keeps execution history outside deleted plans", async () => {
  const job = await repository.create(owner, agentInput(), future(), crypto.randomUUID());
  expect((await repository.list(owner)).some((item) => item.id === job.id)).toBe(true);
  expect(await repository.list(stranger)).toEqual([]);
  expect(await repository.get(owner, job.id)).toEqual(job);
  await expect(repository.get(stranger, job.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(repository.update(stranger, job.id, 1, input(), future())).rejects.toMatchObject({
    code: "NOT_FOUND",
  });
  await expect(repository.history(stranger, job.id, 50)).rejects.toMatchObject({
    code: "NOT_FOUND",
  });
  const updated = await repository.update(owner, job.id, 1, { ...job, name: "Revised" }, future());
  expect(updated.revision).toBe(2);
  await expect(repository.update(owner, job.id, 1, input(), future())).rejects.toMatchObject({
    code: "JOB_CONFLICT",
  });
  const claim = await repository.claimManual(owner, job.id, crypto.randomUUID());
  await connection.db.insert(controlTask).values({
    id: claim.run.id,
    userId: owner,
    deviceId: job.action.deviceId,
    body: { status: "running" },
  });
  await expect(repository.remove(owner, job.id, 1)).rejects.toMatchObject({ code: "JOB_CONFLICT" });
  expect(await repository.remove(owner, job.id, 2)).toEqual({ deleted: true });
  expect(
    await connection.db.select().from(cloudJobRun).where(eq(cloudJobRun.jobId, job.id)),
  ).toEqual([]);
  expect(
    await connection.db
      .select()
      .from(controlTask)
      .where(and(eq(controlTask.userId, owner), eq(controlTask.id, claim.run.id))),
  ).toHaveLength(1);
});

it("claims a manual request once across instances and refuses cross-job/account ID reuse", async () => {
  const job = await repository.create(owner, agentInput(), future(), crypto.randomUUID());
  const requestId = crypto.randomUUID();
  const claims = await Promise.all([
    repository.claimManual(owner, job.id, requestId),
    other.claimManual(owner, job.id, requestId),
  ]);
  expect(claims.filter((claim) => claim.claimed)).toHaveLength(1);
  expect(claims.map((claim) => claim.run.id)).toEqual([requestId, requestId]);
  expect(claims[0].run.taskId).toBe(requestId);
  const revised = {
    ...job,
    action: { ...job.action, prompt: "A later edit must not change this run" },
  } as CloudJobInput;
  await repository.update(owner, job.id, 1, revised, future());
  expect((await repository.history(owner, job.id, 50))[0]!.action).toEqual(job.action);
  const secondJob = await repository.create(owner, input(), future(), crypto.randomUUID());
  const otherJob = await repository.create(stranger, input(), future(), crypto.randomUUID());
  await expect(repository.claimManual(owner, secondJob.id, requestId)).rejects.toMatchObject({
    code: "IDEMPOTENCY_CONFLICT",
  });
  await expect(repository.claimManual(stranger, otherJob.id, requestId)).rejects.toMatchObject({
    code: "IDEMPOTENCY_CONFLICT",
  });
});

it("recovers create retries by immutable request ID and rejects changed payload or owner", async () => {
  const definition = input(),
    id = crypto.randomUUID();
  const jobs = await Promise.all([
    repository.create(owner, definition, future(), id),
    other.create(owner, definition, future(), id),
  ]);
  expect(jobs[0]).toEqual(jobs[1]);
  expect(jobs[0].id).toBe(id);
  expect((await repository.list(owner)).filter((job) => job.id === id)).toHaveLength(1);
  const reordered = {
    ...definition,
    action: {
      epoch: definition.action.epoch,
      deviceId: definition.action.deviceId,
      type: "device.sync" as const,
    },
  };
  expect(
    await repository.create(owner, reordered, new Date(Date.now() + 7200_000).toISOString(), id),
  ).toEqual(jobs[0]);
  await expect(
    repository.create(owner, { ...definition, name: "Changed payload" }, future(), id),
  ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
  await expect(repository.create(stranger, definition, future(), id)).rejects.toMatchObject({
    code: "IDEMPOTENCY_CONFLICT",
  });
  await repository.update(owner, id, 1, { ...definition, enabled: false }, null);
  await expect(repository.create(owner, definition, future(), id)).rejects.toMatchObject({
    code: "IDEMPOTENCY_CONFLICT",
  });
});

it("returns an existing create receipt even after the account reaches its schedule quota", async () => {
  const quotaOwner = `quota-${crypto.randomUUID()}`;
  await connection.db
    .insert(user)
    .values({ id: quotaOwner, name: "Quota fixture", email: `${quotaOwner}@example.test` });
  try {
    const definition = input(),
      id = crypto.randomUUID();
    const original = await repository.create(quotaOwner, definition, future(), id);
    await connection.db.insert(cloudJob).values(
      Array.from({ length: 99 }, (_, index) => ({
        id: crypto.randomUUID(),
        userId: quotaOwner,
        ...definition,
        name: `Quota ${index}`,
        revision: 1,
        nextRunAt: new Date(future()),
      })),
    );
    expect(await repository.create(quotaOwner, definition, future(), id)).toEqual(original);
    await expect(
      repository.create(quotaOwner, definition, future(), crypto.randomUUID()),
    ).rejects.toMatchObject({ code: "JOB_LIMIT" });
    expect(await repository.list(quotaOwner)).toHaveLength(100);
  } finally {
    await connection.db.delete(user).where(eq(user.id, quotaOwner));
  }
});

it("atomically claims one scheduled occurrence, advances future time and skips overlap", async () => {
  const job = await repository.create(owner, input(), future(), crypto.randomUUID());
  await connection.db
    .update(cloudJob)
    .set({ nextRunAt: sql`now() - interval '10 seconds'` })
    .where(eq(cloudJob.id, job.id));
  const claims = (await Promise.all([repository.claimDue(5), other.claimDue(5)]))
    .flat()
    .filter((claim) => claim.job.id === job.id);
  expect(claims).toHaveLength(1);
  expect(claims[0]!.claimed).toBe(true);
  const saved = (await repository.list(owner)).find((item) => item.id === job.id)!;
  expect(Date.parse(saved.nextRunAt!)).toBeGreaterThan(Date.parse(claims[0]!.run.startedAt));
  await connection.db
    .update(cloudJob)
    .set({ nextRunAt: sql`now() - interval '5 seconds'` })
    .where(eq(cloudJob.id, job.id));
  const skipped = (await repository.claimDue(5)).find((claim) => claim.job.id === job.id)!;
  expect(skipped).toMatchObject({
    claimed: false,
    run: { status: "skipped", code: "ALREADY_RUNNING" },
  });
  expect(await repository.history(owner, job.id, 100)).toHaveLength(2);
});

it("records missed time once without replaying the backlog after a restart", async () => {
  const job = await repository.create(owner, input(), future(), crypto.randomUUID());
  await connection.db
    .update(cloudJob)
    .set({ nextRunAt: sql`now() - interval '2 hours'` })
    .where(eq(cloudJob.id, job.id));
  const claim = (await repository.claimDue(5)).find((item) => item.job.id === job.id)!;
  expect(claim).toMatchObject({
    claimed: false,
    run: { status: "skipped", code: "MISSED_SCHEDULE" },
  });
  expect((await other.claimDue(5)).some((item) => item.job.id === job.id)).toBe(false);
  const saved = (await repository.list(owner)).find((item) => item.id === job.id)!;
  expect(Date.parse(saved.nextRunAt!)).toBeGreaterThan(Date.parse(claim.run.startedAt));
  expect(await repository.history(owner, job.id, 100)).toHaveLength(1);
});

it("pauses uncertainty atomically and retains overlap protection without retransmission", async () => {
  const job = await repository.create(owner, agentInput(), future(), crypto.randomUUID());
  const first = await repository.claimManual(owner, job.id, crypto.randomUUID());
  await repository.updateRun(
    owner,
    first.run.id,
    { status: "unknown", finishedAt: null, code: "DELIVERY_UNCERTAIN", sync: null },
    true,
  );
  const paused = (await repository.list(owner)).find((item) => item.id === job.id)!;
  expect(paused).toMatchObject({ enabled: false, nextRunAt: null, revision: 2 });
  expect(await repository.claimManual(owner, job.id, crypto.randomUUID())).toMatchObject({
    claimed: false,
    run: { status: "skipped", code: "ALREADY_RUNNING" },
  });
  expect(await repository.claimManual(owner, job.id, first.run.id)).toMatchObject({
    claimed: false,
    run: { status: "unknown" },
  });
  await repository.updateRun(owner, first.run.id, {
    status: "success",
    finishedAt: new Date().toISOString(),
    code: null,
    sync: null,
  });
  expect((await repository.list(owner)).find((item) => item.id === job.id)!.enabled).toBe(false);
});

it("does not downgrade a terminal projection or pause a newly edited plan on a late receipt", async () => {
  const job = await repository.create(owner, agentInput(), future(), crypto.randomUUID());
  const claim = await repository.claimManual(owner, job.id, crypto.randomUUID());
  await repository.updateRun(owner, claim.run.id, {
    status: "success",
    finishedAt: new Date().toISOString(),
    code: null,
    sync: null,
  });
  const edited = await repository.update(
    owner,
    job.id,
    1,
    { ...job, name: "New consent" },
    future(),
  );
  expect(
    await repository.updateRun(
      owner,
      claim.run.id,
      { status: "unknown", finishedAt: null, code: "DELIVERY_UNCERTAIN", sync: null },
      true,
    ),
  ).toMatchObject({ status: "success" });
  expect((await repository.list(owner)).find((item) => item.id === job.id)).toMatchObject({
    enabled: true,
    revision: edited.revision,
  });
});

it("rotates active reconciliation fairly after the first 25 including unknown runs", async () => {
  const ids: string[] = [];
  for (let index = 0; index < 31; index++) {
    const job = await repository.create(owner, agentInput(), future(), crypto.randomUUID());
    const claim = await repository.claimManual(owner, job.id, crypto.randomUUID());
    ids.push(claim.run.id);
    if (index < 25)
      await repository.updateRun(
        owner,
        claim.run.id,
        { status: "unknown", finishedAt: null, code: "DELIVERY_UNCERTAIN", sync: null },
        true,
      );
  }
  const checked = new Set<string>();
  for (let index = 0; index < 3; index++)
    for (const claim of await (index % 2 ? other : repository).active(25))
      checked.add(claim.run.id);
  expect(ids.every((id) => checked.has(id))).toBe(true);
});
