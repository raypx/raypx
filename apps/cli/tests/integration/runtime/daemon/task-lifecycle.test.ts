import { afterEach, expect, it } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createApiClient } from "@raypx/client/api";
import { createTaskClient } from "@raypx/client/tasks";
import type { DesktopChannel } from "@raypx/contracts/desktop";
import { LOCAL_WORKSPACE_ID } from "@raypx/contracts/local";
import { createLocalClient } from "@raypx/contracts/local-client";
import { AgentStore } from "../../../../src/runtime/agents/store.js";
import { connectDesktop, desktopGateway } from "../../../helpers/desktop-channel.js";
import { startDaemon } from "../../../helpers/enrolled.js";
import { removeTemporaryDirectory } from "../../../helpers/temporary.js";

const cleanups: (() => unknown)[] = [];
afterEach(async () => {
  const failures: unknown[] = [];
  for (const cleanup of cleanups.splice(0).reverse()) {
    try {
      await cleanup();
    } catch (error) {
      failures.push(error);
    }
  }
  if (failures.length) throw new AggregateError(failures, "Task lifecycle fixture cleanup failed");
});

async function startRelay() {
  const script = fileURLToPath(
    new URL("../../../../../api/tests/fixtures/task-lifecycle-relay.ts", import.meta.url),
  );
  const ready = Promise.withResolvers<string>();
  const child = Bun.spawn([process.execPath, "--no-env-file", script], {
    stdout: "ignore",
    stderr: "inherit",
    timeout: 55_000,
    ipc(message) {
      if (typeof message === "string") ready.resolve(message);
    },
  });
  cleanups.push(async () => {
    if (child.exitCode !== null || child.signalCode !== null) return;
    const timeout = setTimeout(() => child.kill(), 3000);
    try {
      child.disconnect();
      await child.exited;
    } finally {
      clearTimeout(timeout);
    }
  });
  const base = await Promise.race([
    ready.promise,
    child.exited.then((code) => {
      throw new Error(`Task lifecycle relay exited (${code})`);
    }),
  ]);
  return { base, pause: () => child.send("pause"), resume: () => child.send("resume") };
}

async function codexFixture(directory: string) {
  const fixture = fileURLToPath(
    new URL("../../../fixtures/agents/codex-local-workflow.ts", import.meta.url),
  );
  if (process.platform === "win32") {
    const outfile = join(directory, "codex.exe");
    const result = await Bun.build({ entrypoints: [fixture], compile: { outfile } });
    if (!result.success)
      throw new AggregateError(result.logs, "Could not compile the Codex fixture");
    return outfile;
  }
  const executable = join(directory, "codex");
  writeFileSync(executable, `#!${process.execPath}\nimport ${JSON.stringify(fixture)};\n`, {
    mode: 0o700,
  });
  return executable;
}

it("starts, approves, reconnects and revokes local and remote work on the same project", async () => {
  const directory = mkdtempSync(join(tmpdir(), "raypx-task-lifecycle-"));
  cleanups.push(() => removeTemporaryDirectory(directory));
  const project = join(directory, "project");
  mkdirSync(project);
  const report = join(project, "report.txt");
  const holdApproval = join(project, "hold-approval");
  const providerStarts = () => readFileSync(join(project, "sessions"), "utf8").trim().split("\n");
  writeFileSync(join(project, "seed.txt"), "TASK_LIFECYCLE_SEED");

  const relay = await startRelay();
  const api = createApiClient({
    baseUrl: relay.base,
    headers: { cookie: "fixture", origin: "views://main" },
  });
  const account = await api.account.get({});
  const scope = { apiUrl: relay.base, accountId: account.id };
  const host = await startDaemon({
    dataDir: join(directory, "profile"),
    agentExecutables: { codex: await codexFixture(directory) },
  });
  cleanups.push(host.close);
  const store = new AgentStore(host.runtime.state.db);
  const gateway = desktopGateway(host.endpoint, relay.base);
  let descriptor = await gateway.bootstrap();
  const native = (action: Record<string, unknown>) => gateway.native(descriptor, action);
  const checkQuit = async () => {
    const state = (await native({ action: "quit_tasks" })) as {
      count: number;
      confirmation: string;
    };
    expect(state).toEqual({ count: 1, confirmation: expect.any(String) });
    return state.confirmation;
  };
  const root = (await gateway.native(descriptor, { action: "pick", path: project })) as {
    id: string;
  };
  const first = await connectDesktop(cleanups, descriptor.channel);
  await first.ready;
  let local = createLocalClient(first.local);
  await local("agents.configure", { rootId: root.id, providers: ["codex"] });
  const localOwner = { accountId: LOCAL_WORKSPACE_ID } as const;
  const device = await local("agents.local.device", localOwner);

  const cloud = await api.devices.register({
    installationId: host.control.info(scope).installationId,
    name: "Task lifecycle fixture",
    platform: process.platform,
    appVersion: host.endpoint.version,
    reconnect: false,
  });
  await host.control.request("host.session", scope);
  await host.control.request("host.enable", { ...scope, enabled: true });
  const authorization = await api.hosts.authorize({ deviceId: cloud.deviceId, epoch: cloud.epoch });
  await host.control.request("host.authorize", { ...scope, authorization });
  const cloudDevice = async () =>
    (await api.devices.list({})).find((item) => item.id === cloud.deviceId);
  await expect
    .poll(cloudDevice)
    .toMatchObject({ online: true, projects: [{ id: root.id, providers: ["codex"] }] });
  const viewer = createTaskClient(api, { baseUrl: relay.base });
  viewer.setAccount(scope.accountId);
  const unsubscribe = viewer.subscribe(() => {});
  cleanups.push(() => {
    unsubscribe();
    viewer.setAccount(null);
  });

  const input = (deviceId: string, prompt: string) => ({
    id: crypto.randomUUID(),
    deviceId,
    projectId: root.id,
    provider: "codex" as const,
    mode: "run" as const,
    prompt,
  });
  const startLocal = async (task: ReturnType<typeof input>) => {
    expect(
      await local("agents.local.execute", {
        ...localOwner,
        id: task.id,
        request: { method: "tasks.create", input: task },
      }),
    ).toMatchObject({ ok: true, value: { id: task.id, projectId: root.id } });
    const approval = async () =>
      (await local("agents.local.approvals", localOwner)).find((item) => item.taskId === task.id);
    await expect.poll(approval).toMatchObject({ kind: "permission", status: "pending" });
    return (await approval())!;
  };
  const approveLocal = async (taskId: string, approvalId: string) => {
    expect(
      await local("agents.local.execute", {
        ...localOwner,
        id: crypto.randomUUID(),
        request: {
          method: "approvals.decide",
          input: { id: approvalId, decision: { type: "allow" } },
        },
      }),
    ).toMatchObject({ ok: true });
    await expect
      .poll(() => local("agents.local.get", { ...localOwner, id: taskId, after: 0 }))
      .toMatchObject({
        task: { status: "succeeded" },
        requests: [{ id: approvalId, decision: { type: "allow" } }],
      });
    expect(readFileSync(report, "utf8")).toBe("TASK_LIFECYCLE_SEED\napproved\n");
    rmSync(report);
  };

  const localTask = input(device.id, "Device-only synthetic task");
  const localApproval = await startLocal(localTask);
  expect(existsSync(report)).toBe(false);
  expect(await api.approvals.list({})).toEqual([]);
  first.socket.close();
  await first.ended;
  const channel = (await gateway.native(descriptor, { action: "channel" })) as DesktopChannel;
  const reconnected = await connectDesktop(cleanups, channel);
  await reconnected.ready;
  local = createLocalClient(reconnected.local);
  expect(
    await local("agents.local.get", { ...localOwner, id: localTask.id, after: 0 }),
  ).toMatchObject({
    runStatus: "waiting_approval",
    requests: [{ id: localApproval.id, status: "pending" }],
  });
  const previousConfirmation = await checkQuit();
  expect(await native({ action: "quit" })).toBe(true);
  await reconnected.ended;
  descriptor = await gateway.bootstrap();
  const reopened = await connectDesktop(cleanups, descriptor.channel);
  await reopened.ready;
  local = createLocalClient(reopened.local);
  await expect(
    native({ action: "stop_quit_tasks", confirmation: previousConfirmation }),
  ).rejects.toMatchObject({ code: "QUIT_TASKS_CHANGED" });
  const localConfirmation = await checkQuit();
  await approveLocal(localTask.id, localApproval.id);
  const cloudTasks = () =>
    api.tasks.list({ projectId: root.id, deviceId: cloud.deviceId, limit: 50 });
  expect(await api.tasks.list({ projectId: root.id, limit: 50 })).toEqual([]);
  expect(providerStarts()).toHaveLength(1);

  writeFileSync(holdApproval, "");
  const remoteTask = input(cloud.deviceId, "Remote synthetic task");
  expect(await viewer.tasks.create(remoteTask)).toMatchObject({
    id: remoteTask.id,
    projectId: root.id,
  });
  await expect.poll(cloudTasks).toMatchObject([{ id: remoteTask.id, status: "running" }]);
  expect(await native({ action: "stop_quit_tasks", confirmation: localConfirmation })).toEqual({
    stopped: true,
  });
  expect(store.get(remoteTask.id)?.task.status).toBe("running");
  relay.pause();
  await expect.poll(() => host.control.info(scope).connected).toBe(false);
  rmSync(holdApproval);
  const persistedRequest = (taskId: string) => {
    const record = store.get(taskId);
    return record ? store.requests(record.binding, taskId)[0] : undefined;
  };
  await expect
    .poll(() => persistedRequest(remoteTask.id))
    .toMatchObject({ kind: "permission", status: "pending" });
  const remoteApproval = persistedRequest(remoteTask.id)!;
  expect(await api.approvals.list({})).toEqual([]);
  expect(existsSync(report)).toBe(false);

  relay.resume();
  await expect.poll(() => host.control.info(scope).connected).toBe(true);
  await expect
    .poll(() => api.approvals.list({}))
    .toMatchObject([{ id: remoteApproval.id, taskId: remoteTask.id, status: "pending" }]);
  expect(await viewer.tasks.create(remoteTask)).toMatchObject({ id: remoteTask.id });
  const allow = (id: string) => ({ id, decision: { type: "allow" as const } });
  await viewer.approvals.decide(allow(remoteApproval.id));
  await expect
    .poll(() => api.tasks.get({ id: remoteTask.id, after: 0 }))
    .toMatchObject({
      task: { status: "succeeded" },
      requests: [{ id: remoteApproval.id, decision: { type: "allow" } }],
    });
  expect(providerStarts()).toHaveLength(2);
  expect(readFileSync(report, "utf8")).toBe("TASK_LIFECYCLE_SEED\napproved\n");
  rmSync(report);

  const stopOnQuit = input(cloud.deviceId, "Remote task awaiting the quit decision");
  await viewer.tasks.create(stopOnQuit);
  await expect
    .poll(() => api.approvals.list({}))
    .toMatchObject([{ taskId: stopOnQuit.id, status: "pending" }]);
  const confirmation = await checkQuit();
  expect(await native({ action: "stop_quit_tasks", confirmation })).toEqual({ stopped: true });
  await expect
    .poll(() => api.tasks.get({ id: stopOnQuit.id, after: 0 }))
    .toMatchObject({
      task: { status: "cancelled" },
      requests: [{ status: "cancelled", decision: null }],
    });
  await expect(native({ action: "stop_quit_tasks", confirmation })).rejects.toMatchObject({
    code: "QUIT_TASKS_CHANGED",
  });
  expect(await native({ action: "quit_tasks" })).toEqual({ count: 0 });

  const revokedTask = input(cloud.deviceId, "Remote task awaiting revocation");
  await viewer.tasks.create(revokedTask);
  await expect
    .poll(() => api.approvals.list({}))
    .toMatchObject([{ taskId: revokedTask.id, status: "pending" }]);
  const revokedApproval = persistedRequest(revokedTask.id)!;
  expect(await api.devices.revoke({ deviceId: cloud.deviceId, epoch: cloud.epoch })).toEqual({
    revoked: true,
  });
  await expect
    .poll(() => host.control.info(scope))
    .toMatchObject({ authorized: false, connected: false, error: "DEVICE_REVOKED" });
  await expect.poll(() => store.get(revokedTask.id)?.task.status).toBe("cancelled");
  expect(persistedRequest(revokedTask.id)).toMatchObject({
    id: revokedApproval.id,
    status: "cancelled",
    decision: null,
  });
  await expect(viewer.approvals.decide(allow(revokedApproval.id))).rejects.toMatchObject({
    data: { error: { code: "DEVICE_REVOKED" } },
  });
  await expect(
    viewer.tasks.create(input(cloud.deviceId, "Forbidden remote task")),
  ).rejects.toMatchObject({ data: { error: { code: "DEVICE_REVOKED" } } });
  expect(existsSync(report)).toBe(false);
  expect(providerStarts()).toHaveLength(4);

  const afterRevoke = input(device.id, "Device-only task after revocation");
  await approveLocal(afterRevoke.id, (await startLocal(afterRevoke)).id);
  const stopLocal = input(device.id, "Device-only task awaiting the quit decision");
  const stopLocalApproval = await startLocal(stopLocal);
  expect(await native({ action: "stop_quit_tasks", confirmation: await checkQuit() })).toEqual({
    stopped: true,
  });
  expect(await local("agents.local.get", { ...localOwner, id: stopLocal.id })).toMatchObject({
    task: { status: "cancelled" },
    requests: [{ id: stopLocalApproval.id, status: "cancelled", decision: null }],
  });
  const localTasks = await local("agents.local.list", {
    ...localOwner,
    projectId: root.id,
    limit: 50,
  });
  expect(localTasks.map((task) => task.id).sort()).toEqual(
    [localTask.id, afterRevoke.id, stopLocal.id].sort(),
  );
  expect(
    (await api.tasks.list({ projectId: root.id, limit: 50 })).map((task) => task.id).sort(),
  ).toEqual([remoteTask.id, stopOnQuit.id, revokedTask.id].sort());

  expect(await local("roots.remove", { id: root.id })).toEqual({ removed: true });
  const blocked = input(device.id, "Device-only task after directory grant removal");
  expect(
    await local("agents.local.execute", {
      ...localOwner,
      id: blocked.id,
      request: { method: "tasks.create", input: blocked },
    }),
  ).toMatchObject({ ok: true, value: { status: "failed", summary: "AGENT_UNAVAILABLE" } });
  expect(await local("agents.local.get", { ...localOwner, id: afterRevoke.id })).toMatchObject({
    task: { status: "succeeded" },
  });
  expect(existsSync(report)).toBe(false);
  expect(providerStarts()).toHaveLength(6);
}, 45_000);
