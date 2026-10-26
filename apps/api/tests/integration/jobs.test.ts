import { expect, it, vi } from "vite-plus/test";
import { createApiClient } from "@raypx/client";
import {
  JobError,
  type CloudJob,
  type CloudJobCreateInput,
  type CloudJobInput,
  type CloudJobRun,
} from "@raypx/jobs";
import type { CloudJobsService } from "@raypx/jobs/server";
import { createApiApp } from "../../server/api.js";
import { controlAuth } from "../helpers/control.js";

function fixture() {
  const auth = controlAuth("job-owner");
  let signedIn = true;
  const input: CloudJobInput = {
    name: "Sync",
    cron: "*/5 * * * *",
    timezone: "UTC",
    enabled: true,
    action: { type: "device.sync", deviceId: crypto.randomUUID(), epoch: 1 },
  };
  const createInput = { ...input, requestId: crypto.randomUUID() };
  const now = new Date().toISOString();
  const job: CloudJob = {
    ...input,
    id: crypto.randomUUID(),
    revision: 1,
    createdAt: now,
    updatedAt: now,
    nextRunAt: now,
  };
  const run: CloudJobRun = {
    id: crypto.randomUUID(),
    jobId: job.id,
    jobRevision: 1,
    trigger: "manual",
    scheduledFor: now,
    startedAt: now,
    finishedAt: now,
    status: "success",
    action: job.action,
    taskId: null,
    code: null,
    sync: { streamId: "stream", sequence: 10 },
  };
  const service = {
    list: vi.fn(async () => ({ enabled: true, jobs: [job] })),
    create: vi.fn(async () => job),
    update: vi.fn(async () => job),
    remove: vi.fn(async () => ({ deleted: true as const })),
    history: vi.fn(async () => [run]),
    run: vi.fn(async () => run),
  };
  const limit = vi.fn(async (_key: string, _rule: { window: number; max: number }) => true);
  const readSession = vi.fn(async () => (signedIn ? auth : null));
  const app = createApiApp({
    cloudJobs: service as unknown as CloudJobsService,
    authHandler: async () => new Response(null, { status: 404 }),
    readSession,
    allowedOrigins: ["https://web.example.test", "views://main"],
    rateLimit: limit,
  });
  const client = (origin = "https://web.example.test") =>
    createApiClient({
      baseUrl: "https://api.example.test",
      headers: origin ? { origin } : {},
      fetch: async (url, init) => app.fetch(new Request(url, init)),
    }).jobs;
  return {
    auth,
    input,
    createInput,
    job,
    run,
    service,
    limit,
    readSession,
    client,
    signOut: () => {
      signedIn = false;
    },
  };
}

it("resolves the owner from a fresh session for each read and write", async () => {
  const f = fixture();
  await f.client().list({});
  await f.client().history({ id: f.job.id });
  await f.client().create(f.createInput);
  await f.client().update({ id: f.job.id, revision: 1, job: f.input });
  await f.client().run({ id: f.job.id, requestId: f.run.id });
  await f.client().remove({ id: f.job.id, revision: 1 });
  expect(f.readSession).toHaveBeenCalledTimes(6);
  expect(f.service.list).toHaveBeenCalledWith(f.auth.user.id);
  expect(f.service.history).toHaveBeenCalledWith(f.auth.user.id, { id: f.job.id, limit: 50 });
  expect(f.service.create).toHaveBeenCalledWith(f.auth.user.id, f.createInput);
  expect(f.service.run).toHaveBeenCalledWith(f.auth.user.id, { id: f.job.id, requestId: f.run.id });
  f.signOut();
  await expect(f.client().list({})).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  await expect(f.client().create(f.createInput)).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  expect(f.service.list).toHaveBeenCalledOnce();
  expect(f.service.create).toHaveBeenCalledOnce();
});

it("requires a trusted Origin on every cookie-authenticated mutation, including manual runs", async () => {
  const f = fixture();
  for (const origin of ["", "https://attacker.example.test"]) {
    await expect(f.client(origin).create(f.createInput)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(
      f.client(origin).update({ id: f.job.id, revision: 1, job: f.input }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(f.client(origin).remove({ id: f.job.id, revision: 1 })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(f.client(origin).run({ id: f.job.id, requestId: f.run.id })).rejects.toMatchObject(
      { code: "FORBIDDEN" },
    );
  }
  expect(f.service.create).not.toHaveBeenCalled();
  expect(f.service.update).not.toHaveBeenCalled();
  expect(f.service.remove).not.toHaveBeenCalled();
  expect(f.service.run).not.toHaveBeenCalled();
  expect(await f.client("views://main").create(f.createInput)).toEqual(f.job);
});

it("rejects caller-selected owners and arbitrary shell actions before the service boundary", async () => {
  const f = fixture();
  await expect(
    f.client().create({ ...f.createInput, userId: "another-owner" } as CloudJobCreateInput),
  ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  await expect(
    f.client().create({
      ...f.createInput,
      action: {
        type: "command.run",
        command: { executable: "sh", args: ["-c", "private"], cwd: "/" },
      },
    } as unknown as CloudJobCreateInput),
  ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  expect(f.service.create).not.toHaveBeenCalled();
});

it("maps revision conflicts and disabled deployment safely and rate-limits reads and writes", async () => {
  const f = fixture();
  f.service.update.mockRejectedValueOnce(new JobError("JOB_CONFLICT"));
  await expect(
    f.client().update({ id: f.job.id, revision: 1, job: f.input }),
  ).rejects.toMatchObject({ code: "CONFLICT", data: { error: { code: "JOB_CONFLICT" } } });
  f.service.run.mockRejectedValueOnce(new JobError("JOBS_DISABLED"));
  await expect(f.client().run({ id: f.job.id, requestId: f.run.id })).rejects.toMatchObject({
    code: "SERVICE_UNAVAILABLE",
    data: { error: { code: "JOBS_DISABLED" } },
  });
  f.limit.mockResolvedValue(false);
  await expect(f.client().list({})).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
  await expect(f.client().create(f.createInput)).rejects.toMatchObject({
    code: "TOO_MANY_REQUESTS",
  });
  expect(f.limit.mock.calls.map(([key]) => key)).toContain(`rpc:${f.auth.user.id}:jobs.list`);
  expect(f.service.list).not.toHaveBeenCalled();
  expect(f.service.create).not.toHaveBeenCalled();
});
