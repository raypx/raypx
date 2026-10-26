import { expect, it } from "vite-plus/test";
import type { CloudJobAction, CloudJobRun } from "@raypx/jobs";
import type { AgentTask } from "@raypx/contracts/tasks";
import { createRelayJobExecutor } from "../../server/relay/jobs.js";
import { connected } from "../helpers/control.js";
import { relayFixture, relaySocket } from "../helpers/relay.js";

function jobRun(action: CloudJobAction): CloudJobRun {
  const id = crypto.randomUUID(),
    now = new Date().toISOString();
  return {
    id,
    jobId: crypto.randomUUID(),
    jobRevision: 1,
    action,
    taskId: action.type === "agent.run" ? id : null,
    trigger: "schedule",
    scheduledFor: now,
    startedAt: now,
    finishedAt: null,
    status: "dispatching",
    code: null,
    sync: null,
  };
}
it("dispatches a scheduled task and commits a correlated sync over an actual relay socket without a browser session", async () => {
  const f = await relayFixture(),
    device = await connected(f.control, f.auth);
  const authorization = await f.control.authorizeHost(f.auth, device.grant),
    grant = await f.control.hostGrant(authorization.credential);
  f.repository.validSession = false;
  const host = await relaySocket(f.base, f.auth.user.id, {
    type: "auth",
    protocolVersion: 3,
    role: "device",
    token: grant.grant.token,
  });
  try {
    await host.take("ready");
    host.send({ ...device.announce, syncSupported: true });
    await host.take("resume");
    host.send({ type: "available" });
    host.send({ type: "ping" });
    await host.take("pong");
    const executor = createRelayJobExecutor(f.control, f.hub);
    const run = jobRun({
      type: "agent.run",
      deviceId: device.grant.deviceId,
      epoch: device.grant.epoch,
      projectId: device.input.projectId,
      provider: "codex",
      mode: "plan",
      prompt: "Scheduled plan",
    });
    const result = executor.execute(f.auth.user.id, run, new AbortController().signal);
    const command = await host.take("command");
    expect(command.command.id).toBe(run.id);
    const task: AgentTask = {
      ...device.input,
      id: run.id,
      mode: "plan",
      prompt: "Scheduled plan",
      parentTaskId: null,
      status: "waiting",
      summary: "",
      createdAt: run.startedAt,
      updatedAt: run.startedAt,
    };
    host.send({
      type: "events",
      streamId: device.announce.streamId,
      events: [
        {
          sequence: 1,
          event: {
            id: crypto.randomUUID(),
            taskId: run.id,
            kind: "status",
            status: "waiting",
            summary: "",
            task,
          },
        },
      ],
    });
    await host.take("ack");
    host.send({ type: "result", routeId: command.routeId, result: { ok: true, value: task } });
    expect(await result).toEqual({ type: "task", taskId: run.id, status: "waiting" });
    expect(await executor.task(f.auth.user.id, run.id)).toEqual({ status: "waiting" });
    const syncRun = jobRun({
      type: "device.sync",
      deviceId: device.grant.deviceId,
      epoch: device.grant.epoch,
    });
    const sync = executor.execute(f.auth.user.id, syncRun, new AbortController().signal),
      request = await host.take("resume");
    expect(request.syncId).toBe(syncRun.id);
    host.send({
      type: "snapshot",
      id: crypto.randomUUID(),
      syncId: syncRun.id,
      streamId: device.announce.streamId,
      sequence: 2,
      records: [{ kind: "task", task: { ...task, status: "succeeded", summary: "Complete" } }],
      done: true,
    });
    await host.take("ack");
    expect(await sync).toEqual({ type: "synced", streamId: device.announce.streamId, sequence: 2 });
    expect(await executor.task(f.auth.user.id, run.id)).toEqual({ status: "succeeded" });
    expect(await executor.task("unrelated-account", run.id)).toBeNull();
    expect(host.closed()).toBeUndefined();
  } finally {
    host.socket.close();
    await f.close();
  }
});
