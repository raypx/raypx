import { afterEach, expect, it, vi } from "vite-plus/test";
import type { CloudJob, CloudJobAction, CloudJobRun } from "@raypx/jobs";
import { CloudJobsService, type CloudJobsRepository } from "@raypx/jobs/server";
import type { RelayServerFrame } from "@raypx/contracts/tasks";
import type { AgentTask } from "@raypx/core/tasks";
import { ControlService } from "../../server/control/service.js";
import { RelayHub } from "../../server/relay/hub.js";
import { createRelayJobExecutor } from "../../server/relay/jobs.js";
import { connected, memoryControlRepository } from "../helpers/control.js";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const close of cleanups.splice(0)) await close();
  vi.restoreAllMocks();
});
function run(action: CloudJobAction): CloudJobRun {
  const id = crypto.randomUUID(),
    now = new Date().toISOString();
  return {
    id,
    jobId: crypto.randomUUID(),
    jobRevision: 1,
    trigger: "manual",
    scheduledFor: now,
    startedAt: now,
    finishedAt: null,
    status: "dispatching",
    action,
    taskId: action.type === "agent.run" ? id : null,
    code: null,
    sync: null,
  };
}
async function fixture(syncSupported = true) {
  const repository = memoryControlRepository(),
    control = new ControlService(repository),
    f = await connected(control);
  const credential = await control.authorizeHost(f.auth, f.grant),
    hostGrant = await control.hostGrant(credential.credential);
  const hub = new RelayHub(async (use) => use(control)),
    id = crypto.randomUUID(),
    frames: RelayServerFrame[] = [],
    close = vi.fn();
  hub.open({ id, send: (frame) => frames.push(frame), close });
  await hub.receive(
    id,
    JSON.stringify({
      type: "auth",
      protocolVersion: 3,
      role: "device",
      token: hostGrant.grant.token,
    }),
  );
  await hub.receive(id, JSON.stringify({ ...f.announce, syncSupported }));
  await hub.receive(id, JSON.stringify({ type: "available" }));
  repository.validSession = false; // Jobs and restricted hosts keep no browser-session dependency.
  cleanups.push(() => hub.shutdown());
  const action: CloudJobAction = {
    type: "agent.run",
    deviceId: f.grant.deviceId,
    epoch: f.grant.epoch,
    projectId: f.input.projectId,
    provider: "codex",
    mode: "run",
    prompt: "Scheduled fixture",
  };
  return {
    ...f,
    control,
    hub,
    id,
    frames,
    close,
    action,
    executor: createRelayJobExecutor(control, hub),
    hostToken: hostGrant.grant.token,
  };
}
function task(f: Awaited<ReturnType<typeof fixture>>, jobRun: CloudJobRun): AgentTask {
  if (jobRun.action.type !== "agent.run") throw new Error("Expected agent run");
  return {
    ...f.input,
    id: jobRun.id,
    prompt: jobRun.action.prompt,
    parentTaskId: null,
    status: "running",
    summary: "",
    createdAt: jobRun.startedAt,
    updatedAt: jobRun.startedAt,
  };
}
it("dispatches a persisted task id without a viewer/session and waits for the host receipt", async () => {
  const f = await fixture(),
    jobRun = run(f.action);
  const pending = f.executor.execute(f.auth.user.id, jobRun, new AbortController().signal);
  await expect.poll(() => f.frames.some((frame) => frame.type === "command")).toBe(true);
  const command = f.frames.find((frame) => frame.type === "command")!;
  if (command.type !== "command") throw new Error("Missing command");
  expect(command.command).toMatchObject({
    id: jobRun.id,
    request: { method: "tasks.create", input: { id: jobRun.id } },
  });
  await f.hub.receive(
    f.id,
    JSON.stringify({
      type: "result",
      routeId: command.routeId,
      result: { ok: true, value: task(f, jobRun) },
    }),
  );
  expect(await pending).toEqual({ type: "task", taskId: jobRun.id, status: "running" });
  expect(await f.executor.task(f.auth.user.id, jobRun.id)).toBeNull(); // An ACK is not a projection commit.
  expect(await f.executor.task("another-account", jobRun.id)).toBeNull();
});
it("permits offline plans but rejects dispatch before sending, and revalidates ownership/epoch/project/provider", async () => {
  const f = await fixture();
  await expect(f.executor.validate("other-account", f.action)).rejects.toMatchObject({
    code: "NOT_FOUND",
    uncertain: false,
  });
  await expect(
    f.executor.validate(f.auth.user.id, { ...f.action, epoch: 2 }),
  ).rejects.toMatchObject({ code: "DEVICE_REVOKED" });
  await expect(
    f.executor.validate(f.auth.user.id, { ...f.action, projectId: crypto.randomUUID() }),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(
    f.executor.validate(f.auth.user.id, { ...f.action, provider: "claude" }),
  ).rejects.toMatchObject({ code: "PROVIDER_UNAVAILABLE" });
  await f.hub.close(f.id);
  await expect(f.executor.validate(f.auth.user.id, f.action)).resolves.toBeUndefined();
  await expect(
    f.executor.execute(f.auth.user.id, run(f.action), new AbortController().signal),
  ).rejects.toMatchObject({ code: "DEVICE_OFFLINE", uncertain: false });
  expect(f.frames.some((frame) => frame.type === "command")).toBe(false);
});
it("never dispatches to a peer superseded by a newer persisted connection", async () => {
  const f = await fixture();
  const replacement = await f.control.authenticate("device", f.hostToken, crypto.randomUUID());
  await f.control.announce(replacement, f.announce);
  await expect(
    f.executor.execute(f.auth.user.id, run(f.action), new AbortController().signal),
  ).rejects.toMatchObject({ code: "DEVICE_REPLACED", uncertain: false });
  expect(f.frames.some((frame) => frame.type === "command")).toBe(false);
});
it("classifies aborted/closed delivery as uncertain only after sending and never resends", async () => {
  const f = await fixture(),
    before = new AbortController();
  before.abort();
  await expect(
    f.executor.execute(f.auth.user.id, run(f.action), before.signal),
  ).rejects.toMatchObject({ uncertain: false });
  const controller = new AbortController(),
    pending = f.executor.execute(f.auth.user.id, run(f.action), controller.signal);
  const rejected = pending.catch((error: unknown) => error);
  await expect.poll(() => f.frames.filter((frame) => frame.type === "command").length).toBe(1);
  controller.abort();
  expect(await rejected).toMatchObject({ code: "REQUEST_TIMEOUT", uncertain: true });
  expect(f.close).not.toHaveBeenCalled();
  expect(f.frames.filter((frame) => frame.type === "command")).toHaveLength(1);
  const disconnected = f.executor.execute(
    f.auth.user.id,
    run(f.action),
    new AbortController().signal,
  );
  const lost = disconnected.catch((error: unknown) => error);
  await expect.poll(() => f.frames.filter((frame) => frame.type === "command").length).toBe(2);
  await f.hub.close(f.id);
  expect(await lost).toMatchObject({ code: "DEVICE_OFFLINE", uncertain: true });
});
it("resolves sync only after its correlated final snapshot commits and keeps commands connected", async () => {
  const f = await fixture(),
    jobRun = run({ type: "device.sync", deviceId: f.grant.deviceId, epoch: f.grant.epoch });
  let settled = false;
  const pending = f.executor
    .execute(f.auth.user.id, jobRun, new AbortController().signal)
    .then((value) => {
      settled = true;
      return value;
    });
  await expect
    .poll(() => f.frames.some((frame) => frame.type === "resume" && frame.syncId === jobRun.id))
    .toBe(true);
  const snapshotId = crypto.randomUUID();
  await f.hub.receive(
    f.id,
    JSON.stringify({
      type: "snapshot",
      id: snapshotId,
      syncId: jobRun.id,
      streamId: f.announce.streamId,
      sequence: 0,
      records: [],
      done: false,
    }),
  );
  expect(settled).toBe(false);
  let release!: () => void, entered!: () => void;
  const gate = new Promise<void>((resolve) => {
      release = resolve;
    }),
    reached = new Promise<void>((resolve) => {
      entered = resolve;
    });
  const original = f.control.snapshot.bind(f.control);
  vi.spyOn(f.control, "snapshot").mockImplementation(async (...args) => {
    entered();
    await gate;
    return original(...args);
  });
  const final = f.hub.receive(
    f.id,
    JSON.stringify({
      type: "snapshot",
      id: snapshotId,
      syncId: jobRun.id,
      streamId: f.announce.streamId,
      sequence: 0,
      records: [],
      done: true,
    }),
  );
  await reached;
  expect(settled).toBe(false);
  release();
  await final;
  expect(await pending).toEqual({ type: "synced", streamId: f.announce.streamId, sequence: 0 });
  expect(f.close).not.toHaveBeenCalled();
  expect(f.frames.some((frame) => frame.type === "ack" && frame.snapshotId === snapshotId)).toBe(
    true,
  );
});
it("fails old hosts explicitly and does not accept an unrelated snapshot as a sync result", async () => {
  const old = await fixture(false),
    action = { type: "device.sync" as const, deviceId: old.grant.deviceId, epoch: old.grant.epoch };
  await expect(
    old.executor.execute(old.auth.user.id, run(action), new AbortController().signal),
  ).rejects.toMatchObject({ code: "UPGRADE_REQUIRED", uncertain: false });
  const f = await fixture(),
    controller = new AbortController(),
    jobRun = run({ ...action, deviceId: f.grant.deviceId });
  const pending = f.executor.execute(f.auth.user.id, jobRun, controller.signal);
  const rejected = pending.catch((error: unknown) => error);
  await expect
    .poll(() => f.frames.some((frame) => frame.type === "resume" && frame.syncId === jobRun.id))
    .toBe(true);
  await f.hub.receive(
    f.id,
    JSON.stringify({
      type: "snapshot",
      id: crypto.randomUUID(),
      syncId: crypto.randomUUID(),
      streamId: f.announce.streamId,
      sequence: 0,
      records: [],
      done: true,
    }),
  );
  controller.abort();
  expect(await rejected).toMatchObject({ code: "REQUEST_TIMEOUT", uncertain: true });
});

it("accepts a proven host preflight rejection as known and rejects receipts for a different task target", async () => {
  const f = await fixture();
  const failed = f.executor
    .execute(f.auth.user.id, run(f.action), new AbortController().signal)
    .catch((error: unknown) => error);
  await expect.poll(() => f.frames.some((frame) => frame.type === "command")).toBe(true);
  const command = f.frames.find((frame) => frame.type === "command")!;
  if (command.type !== "command") throw new Error("Missing command");
  await f.hub.receive(
    f.id,
    JSON.stringify({
      type: "result",
      routeId: command.routeId,
      result: { ok: false, code: "PROJECT_BUSY" },
    }),
  );
  expect(await failed).toMatchObject({ code: "PROJECT_BUSY", uncertain: false });
  const jobRun = run(f.action),
    invalid = f.executor
      .execute(f.auth.user.id, jobRun, new AbortController().signal)
      .catch((error: unknown) => error);
  await expect.poll(() => f.frames.filter((frame) => frame.type === "command").length).toBe(2);
  const next = f.frames.filter((frame) => frame.type === "command")[1]!;
  if (next.type !== "command") throw new Error("Missing command");
  await f.hub.receive(
    f.id,
    JSON.stringify({
      type: "result",
      routeId: next.routeId,
      result: { ok: true, value: { ...task(f, jobRun), id: crypto.randomUUID() } },
    }),
  );
  expect(await invalid).toMatchObject({ code: "INVALID_DEVICE_RESULT", uncertain: true });
});

it.each(["CLOSING", "DELIVERY_EXPIRED", "REQUEST_CLOSED"])(
  "keeps the explicit pre-execution rejection %s known",
  async (code) => {
    const f = await fixture();
    const pending = f.executor
      .execute(f.auth.user.id, run(f.action), new AbortController().signal)
      .catch((error: unknown) => error);
    await expect.poll(() => f.frames.some((frame) => frame.type === "command")).toBe(true);
    const command = f.frames.find((frame) => frame.type === "command")!;
    if (command.type !== "command") throw new Error("Missing command");
    await f.hub.receive(
      f.id,
      JSON.stringify({ type: "result", routeId: command.routeId, result: { ok: false, code } }),
    );
    expect(await pending).toMatchObject({ code, uncertain: false });
  },
);

it.each([
  "AGENT_UNAVAILABLE",
  "SERVER_UNAVAILABLE",
  "NETWORK_UNAVAILABLE",
  "UNRECOGNIZED_HOST_FAILURE",
  "untrusted host error",
])("treats the explicit host failure %s as uncertain after delivery", async (code) => {
  const f = await fixture();
  const pending = f.executor
    .execute(f.auth.user.id, run(f.action), new AbortController().signal)
    .catch((error: unknown) => error);
  await expect.poll(() => f.frames.some((frame) => frame.type === "command")).toBe(true);
  const command = f.frames.find((frame) => frame.type === "command")!;
  if (command.type !== "command") throw new Error("Missing command");
  await f.hub.receive(
    f.id,
    JSON.stringify({ type: "result", routeId: command.routeId, result: { ok: false, code } }),
  );
  expect(await pending).toMatchObject({
    code: code === "untrusted host error" ? "DEVICE_UNAVAILABLE" : code,
    uncertain: true,
  });
});

it("pauses a plan after execution succeeded but saving its host receipt failed, without resending", async () => {
  const f = await fixture();
  let current = run(f.action),
    claimed = false,
    effects = 0;
  const job: CloudJob = {
    id: current.jobId,
    name: "Receipt failure",
    cron: "* * * * *",
    timezone: "UTC",
    enabled: true,
    action: f.action,
    revision: 1,
    nextRunAt: current.startedAt,
    createdAt: current.startedAt,
    updatedAt: current.startedAt,
  };
  const claim = () => ({
    userId: f.auth.user.id,
    job: structuredClone(job),
    run: structuredClone(current),
    claimed: false,
  });
  const repository: CloudJobsRepository = {
    list: async () => [job],
    get: async () => job,
    create: async () => job,
    update: async () => job,
    remove: async () => ({ deleted: true }),
    history: async () => [current],
    claimDue: async () => [],
    claimManual: async () => {
      const next = { ...claim(), claimed: !claimed };
      claimed = true;
      return next;
    },
    active: async () => [claim()],
    updateRun: async (_owner, _id, update, pause) => {
      current = { ...current, ...update };
      if (pause) {
        job.enabled = false;
        job.nextRunAt = null;
      }
      return structuredClone(current);
    },
  };
  const execute = vi.spyOn(f.executor, "execute");
  const service = new CloudJobsService({ repository, executor: f.executor, enabled: true });
  const pending = service.run(f.auth.user.id, { id: job.id, requestId: current.id });
  await expect.poll(() => f.frames.some((frame) => frame.type === "command")).toBe(true);
  const command = f.frames.find((frame) => frame.type === "command")!;
  if (command.type !== "command") throw new Error("Missing command");
  // AgentRuntime.remote can start execution and then fail in store.complete.
  effects++;
  await f.hub.receive(
    f.id,
    JSON.stringify({
      type: "result",
      routeId: command.routeId,
      result: { ok: false, code: "AGENT_UNAVAILABLE" },
    }),
  );
  expect(await pending).toMatchObject({
    id: command.command.id,
    taskId: command.command.id,
    status: "unknown",
    code: "DELIVERY_UNCERTAIN",
    finishedAt: null,
  });
  expect(job.enabled).toBe(false);
  expect(job.nextRunAt).toBeNull();
  await service.tick();
  await service.run(f.auth.user.id, { id: job.id, requestId: current.id });
  expect(execute).toHaveBeenCalledTimes(1);
  expect(f.frames.filter((frame) => frame.type === "command")).toHaveLength(1);
  expect(effects).toBe(1);
});
