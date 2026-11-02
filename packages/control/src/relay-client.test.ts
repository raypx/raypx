import { expect, it, vi } from "vite-plus/test";
import { ControlService } from "./service.js";
import { createRemoteRelay } from "./relay/client.js";
import type { RelayCluster, RelayOperation, RelayReply } from "./relay/cluster.js";
import type { CloudJobRun } from "@raypx/jobs";
import { connected, memoryControlRepository } from "../tests/helpers/control.js";

async function fixture() {
  const repository = memoryControlRepository(),
    control = new ControlService(repository);
  const f = await connected(control),
    nodeId = crypto.randomUUID();
  const actor = await control.authenticate(
    "device",
    f.grant.token,
    `${nodeId}:${crypto.randomUUID()}`,
  );
  await control.announce(actor, f.announce);
  await control.snapshot(actor, f.announce.streamId, 0, []);
  await control.touch(actor);
  const now = new Date().toISOString(),
    id = crypto.randomUUID();
  const run: CloudJobRun = {
    id,
    jobId: crypto.randomUUID(),
    jobRevision: 1,
    trigger: "manual",
    scheduledFor: now,
    startedAt: now,
    finishedAt: null,
    status: "dispatching",
    code: null,
    sync: null,
    taskId: id,
    action: {
      type: "agent.run",
      deviceId: f.grant.deviceId,
      epoch: f.grant.epoch,
      projectId: f.input.projectId,
      provider: "codex",
      mode: "run",
      prompt: "Run tests",
    },
  };
  const invoke = vi.fn(
    async (
      _node: string,
      _operation: RelayOperation,
      _signal: AbortSignal,
    ): Promise<RelayReply> => ({ type: "task", taskId: id, status: "running" }),
  );
  const notify = vi.fn(async () => {});
  const cluster: RelayCluster = {
    nodeId: crypto.randomUUID(),
    ready: () => true,
    start: vi.fn(async () => {}),
    invoke,
    notify,
    close: vi.fn(async () => {}),
  };
  const remote = await createRemoteRelay(control, cluster);
  return { ...f, control, repository, nodeId, run, cluster, invoke, notify, remote };
}
it("routes API dispatch to the persisted socket owner without hosting any peer", async () => {
  const f = await fixture();
  expect(await f.remote.dispatch(f.auth.user.id, f.run, new AbortController().signal)).toEqual({
    type: "task",
    taskId: f.run.id,
    status: "running",
  });
  expect(f.invoke).toHaveBeenCalledWith(
    f.nodeId,
    expect.objectContaining({
      type: "dispatch",
      userId: f.auth.user.id,
      connectionId: expect.stringContaining(f.nodeId + ":"),
    }),
    expect.any(AbortSignal),
  );
  expect(f.remote).not.toHaveProperty("open");
  await f.remote.shutdown();
  expect(f.remote.ready()).toBe(false);
});
it("rejects cancellation and revoked targets before publishing any operation", async () => {
  const f = await fixture(),
    abort = new AbortController();
  abort.abort();
  await expect(f.remote.dispatch(f.auth.user.id, f.run, abort.signal)).rejects.toMatchObject({
    code: "REQUEST_TIMEOUT",
    uncertain: false,
  });
  await f.control.revoke(f.auth.user.id, { deviceId: f.grant.deviceId, epoch: f.grant.epoch });
  await expect(
    f.remote.dispatch(f.auth.user.id, f.run, new AbortController().signal),
  ).rejects.toMatchObject({ code: "DEVICE_REVOKED" });
  expect(f.invoke).not.toHaveBeenCalled();
  await f.remote.revoke(f.auth.user.id, f.grant.deviceId);
  expect(f.notify).toHaveBeenCalledWith({
    type: "revoke",
    userId: f.auth.user.id,
    deviceId: f.grant.deviceId,
  });
});
it("marks a mismatched result uncertain and has no process-local broker fallback", async () => {
  const f = await fixture();
  f.invoke.mockResolvedValue({ type: "task", taskId: crypto.randomUUID(), status: "running" });
  await expect(
    f.remote.dispatch(f.auth.user.id, f.run, new AbortController().signal),
  ).rejects.toMatchObject({ code: "INVALID_DEVICE_RESULT", uncertain: true });
  const offline = await createRemoteRelay(f.control);
  expect(offline.ready()).toBe(false);
  await expect(
    offline.sync(f.auth.user.id, f.run, new AbortController().signal),
  ).rejects.toMatchObject({ code: "SERVER_UNAVAILABLE", uncertain: false });
});
