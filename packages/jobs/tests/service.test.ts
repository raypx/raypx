import { expect, it, vi } from "vite-plus/test";
import { JobError, type CloudJob, type CloudJobRun } from "../src/index.js";
import {
  CloudJobsService,
  type CloudJobsRepository,
  type CloudJobExecutor,
  type JobClaim,
} from "../src/server.js";

const now = Date.parse("2026-10-26T00:00:00Z");
const jobId = "11111111-1111-4111-8111-111111111111";
const runId = "22222222-2222-4222-8222-222222222222";
function fixture(enabled = true, sync = false) {
  const job: CloudJob = {
    id: jobId,
    revision: 1,
    name: "Daily checks",
    cron: "0 9 * * *",
    timezone: "Asia/Singapore",
    enabled: true,
    action: sync
      ? { type: "device.sync", deviceId: "33333333-3333-4333-8333-333333333333", epoch: 2 }
      : {
          type: "agent.run",
          deviceId: "33333333-3333-4333-8333-333333333333",
          epoch: 2,
          projectId: "44444444-4444-4444-8444-444444444444",
          provider: "codex",
          mode: "run",
          prompt: "Check tests",
        },
    nextRunAt: "2026-10-26T01:00:00.000Z",
    createdAt: new Date(now).toISOString(),
    updatedAt: new Date(now).toISOString(),
  };
  let run: CloudJobRun = {
    id: runId,
    jobId,
    jobRevision: 1,
    action: job.action,
    trigger: "manual",
    scheduledFor: new Date(now).toISOString(),
    startedAt: new Date(now).toISOString(),
    finishedAt: null,
    status: "dispatching",
    taskId: sync ? null : runId,
    code: null,
    sync: null,
  };
  let claimed = false;
  const claim = (): JobClaim => ({
    userId: "owner",
    job: structuredClone(job),
    run: structuredClone(run),
    claimed: true,
  });
  const repository = {
    list: vi.fn(async () => [job]),
    get: vi.fn(async () => structuredClone(job)),
    create: vi.fn(async (_owner, input, nextRunAt) => ({ ...job, ...input, nextRunAt })),
    update: vi.fn(async (_owner, _id, revision, input, nextRunAt) => ({
      ...job,
      ...input,
      revision: revision + 1,
      nextRunAt,
    })),
    remove: vi.fn(async () => ({ deleted: true as const })),
    history: vi.fn(async () => [run]),
    claimDue: vi.fn(async () => [] as JobClaim[]),
    claimManual: vi.fn(async () => {
      const value = { ...claim(), claimed: !claimed };
      claimed = true;
      return value;
    }),
    active: vi.fn(async () => [] as JobClaim[]),
    updateRun: vi.fn(async (_owner, _id, patch, pause) => {
      run = { ...run, ...patch };
      if (pause) {
        job.enabled = false;
        job.nextRunAt = null;
        job.revision++;
      }
      return structuredClone(run);
    }),
  } satisfies CloudJobsRepository;
  const executor = {
    validate: vi.fn(async () => {}),
    execute: vi.fn<CloudJobExecutor["execute"]>(async (_owner, current) =>
      sync
        ? { type: "synced", streamId: "stream", sequence: 12 }
        : { type: "task", taskId: current.id, status: "running" },
    ),
    task: vi.fn<CloudJobExecutor["task"]>(async () => null),
  } satisfies CloudJobExecutor;
  const service = new CloudJobsService({ repository, executor, enabled, now: () => now });
  return { job, repository, executor, service, claim, current: () => run };
}

it("disabled ticks do not read the database and disabled manual runs never dispatch", async () => {
  const f = fixture(false);
  expect(await f.service.tick()).toEqual({ enabled: false, claimed: 0, reconciled: 0, failed: 0 });
  await expect(f.service.run("owner", { id: jobId, requestId: runId })).rejects.toMatchObject({
    code: "JOBS_DISABLED",
  });
  expect(f.repository.active).not.toHaveBeenCalled();
  expect(f.repository.claimDue).not.toHaveBeenCalled();
  expect(f.executor.execute).not.toHaveBeenCalled();
});

it("validates captured targets before writing and passes account identity only through ports", async () => {
  const f = fixture();
  const {
    id: _id,
    revision: _revision,
    createdAt: _createdAt,
    updatedAt: _updatedAt,
    nextRunAt: _nextRun,
    ...input
  } = f.job;
  await f.service.create("owner", { ...input, requestId: jobId });
  expect(f.executor.validate).toHaveBeenCalledWith("owner", input.action);
  expect(f.repository.create).toHaveBeenCalledWith(
    "owner",
    input,
    "2026-10-26T01:00:00.000Z",
    jobId,
  );
  f.executor.validate.mockRejectedValueOnce(new JobError("DEVICE_REVOKED"));
  await expect(
    f.service.update("other", { id: jobId, revision: 1, job: input }),
  ).rejects.toMatchObject({ code: "DEVICE_REVOKED" });
  expect(f.repository.update).not.toHaveBeenCalled();
  await expect(f.service.list("")).rejects.toMatchObject({ code: "AUTH_REQUIRED" });
});

it("can pause an unchanged revoked target but validates enabling and target edits", async () => {
  const f = fixture();
  f.executor.validate.mockRejectedValue(new JobError("DEVICE_REVOKED"));
  const {
    id: _id,
    revision: _revision,
    createdAt: _createdAt,
    updatedAt: _updatedAt,
    nextRunAt: _next,
    ...input
  } = f.job;
  const paused = { ...input, enabled: false };
  expect(await f.service.update("owner", { id: jobId, revision: 1, job: paused })).toMatchObject({
    enabled: false,
    nextRunAt: null,
  });
  expect(f.repository.get).toHaveBeenCalledWith("owner", jobId);
  expect(f.executor.validate).not.toHaveBeenCalled();
  await expect(
    f.service.update("owner", { id: jobId, revision: 1, job: { ...paused, enabled: true } }),
  ).rejects.toMatchObject({ code: "DEVICE_REVOKED" });
  await expect(
    f.service.update("owner", {
      id: jobId,
      revision: 1,
      job: { ...paused, action: { ...paused.action, epoch: 3 } },
    }),
  ).rejects.toMatchObject({ code: "DEVICE_REVOKED" });
  expect(f.repository.update).toHaveBeenCalledTimes(1);
});

it("keeps task acceptance active until an authoritative terminal projection arrives", async () => {
  const f = fixture();
  expect((await f.service.run("owner", { id: jobId, requestId: runId })).status).toBe("running");
  expect(f.current().finishedAt).toBeNull();
  f.repository.active.mockImplementation(async () => [f.claim()]);
  f.executor.task.mockResolvedValueOnce({ status: "waiting" });
  await f.service.tick();
  expect(f.current().status).toBe("waiting");
  f.executor.task.mockResolvedValueOnce({ status: "succeeded" });
  await f.service.tick();
  expect(f.current()).toMatchObject({ status: "success", finishedAt: new Date(now).toISOString() });
  expect(f.executor.execute).toHaveBeenCalledTimes(1);
});

it("a duplicate manual request returns its stored receipt without another inference", async () => {
  const f = fixture();
  const first = await f.service.run("owner", { id: jobId, requestId: runId });
  const repeat = await f.service.run("owner", { id: jobId, requestId: runId });
  expect(repeat).toEqual(first);
  expect(f.executor.execute).toHaveBeenCalledTimes(1);
});

it("unknown Agent delivery pauses the plan and never changes or resends its task ID", async () => {
  const f = fixture();
  f.executor.execute.mockRejectedValueOnce(new JobError("DELIVERY_EXPIRED", true));
  const result = await f.service.run("owner", { id: jobId, requestId: runId });
  expect(result).toMatchObject({
    id: runId,
    taskId: runId,
    status: "unknown",
    code: "DELIVERY_UNCERTAIN",
    finishedAt: null,
  });
  expect(f.job.enabled).toBe(false);
  f.repository.active.mockImplementation(async () => [f.claim()]);
  await f.service.tick();
  await f.service.run("owner", { id: jobId, requestId: runId });
  expect(f.executor.execute).toHaveBeenCalledTimes(1);
});

it("known offline outcomes skip a run, while a changed device epoch pauses the plan", async () => {
  for (const code of ["DEVICE_OFFLINE", "DEVICE_CHANGED"]) {
    const f = fixture();
    f.executor.validate.mockRejectedValueOnce(new JobError(code));
    expect(await f.service.run("owner", { id: jobId, requestId: runId })).toMatchObject({
      status: "skipped",
      code,
    });
    expect(f.executor.execute).not.toHaveBeenCalled();
    expect(f.job.enabled).toBe(code === "DEVICE_OFFLINE");
  }
});

it("sync completes only after the executor supplies its committed checkpoint", async () => {
  const f = fixture(true, true);
  expect(await f.service.run("owner", { id: jobId, requestId: runId })).toMatchObject({
    status: "success",
    taskId: null,
    sync: { streamId: "stream", sequence: 12 },
  });
  const failed = fixture(true, true);
  failed.executor.execute.mockRejectedValueOnce(new JobError("DELIVERY_EXPIRED", true));
  expect(await failed.service.run("owner", { id: jobId, requestId: runId })).toMatchObject({
    status: "failed",
    code: "DELIVERY_EXPIRED",
  });
  expect(failed.job.enabled).toBe(true);
});

it("pauses scheduled inference when a pinned reference is no longer eligible", async () => {
  const f = fixture();
  f.executor.validate.mockRejectedValueOnce(new JobError("CONTEXT_ARCHIVED"));
  expect(await f.service.run("owner", { id: jobId, requestId: runId })).toMatchObject({
    status: "failed",
    code: "CONTEXT_ARCHIVED",
  });
  expect(f.executor.execute).not.toHaveBeenCalled();
  expect(f.job.enabled).toBe(false);
});

it("a stale dispatch after restart is reconciled without sending another command", async () => {
  const f = fixture();
  const previous = f.claim();
  previous.run.startedAt = new Date(now - 121_000).toISOString();
  f.repository.active.mockResolvedValueOnce([previous]);
  await f.service.tick();
  expect(f.current()).toMatchObject({ status: "unknown", code: "DELIVERY_UNCERTAIN" });
  expect(f.job.enabled).toBe(false);
  expect(f.executor.execute).not.toHaveBeenCalled();
});

it("a late dispatch result cannot undo a timed-out unknown outcome", async () => {
  const f = fixture();
  const deadline = new AbortController();
  const timeout = vi.spyOn(AbortSignal, "timeout").mockReturnValue(deadline.signal);
  let entered!: () => void, release!: () => void;
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  f.executor.execute.mockImplementationOnce(async () => {
    entered();
    await new Promise<void>((resolve) => {
      release = resolve;
    });
    return { type: "task", taskId: runId, status: "running" };
  });
  try {
    const operation = f.service.run("owner", { id: jobId, requestId: runId });
    await started;
    deadline.abort();
    expect(await operation).toMatchObject({ status: "unknown", code: "DELIVERY_UNCERTAIN" });
    release();
    await Promise.resolve();
    expect(f.current().status).toBe("unknown");
    expect(f.repository.updateRun).toHaveBeenCalledTimes(1);
  } finally {
    timeout.mockRestore();
  }
});
