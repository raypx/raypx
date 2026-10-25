import { afterEach, expect, it } from "vite-plus/test";
import { createApiClient, createTaskClient } from "@raypx/client";
import { relayFixture, relaySocket } from "../helpers/relay.js";
import { controlAuth } from "../helpers/control.js";
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const close of cleanups.splice(0)) await close();
});
async function setup() {
  const f = await relayFixture();
  cleanups.push(f.close);
  const api = createApiClient({ baseUrl: f.base, headers: { cookie: "fixture" } });
  const grant = await api.devices.register({
    installationId: crypto.randomUUID(),
    name: "Workstation",
    platform: "test",
    appVersion: "0.1.0",
    reconnect: false,
  });
  const native = await relaySocket(f.base, f.auth.user.id, {
    type: "auth",
    protocolVersion: 2,
    role: "device",
    token: grant.token,
  });
  await native.take("ready");
  const projectId = crypto.randomUUID(),
    streamId = crypto.randomUUID(),
    instanceId = crypto.randomUUID();
  const announce = {
    type: "announce" as const,
    streamId,
    instanceId,
    projects: [{ id: projectId, name: "Project", providers: ["codex" as const], dirty: false }],
    capabilities: [
      { provider: "codex" as const, available: true, version: "0.163.0", reason: "ready" as const },
    ],
  };
  native.send(announce);
  await native.take("resume");
  native.send({
    type: "snapshot",
    id: crypto.randomUUID(),
    streamId,
    sequence: 0,
    records: [],
    done: true,
  });
  await native.take("ack");
  native.send({ type: "available" });
  await expect.poll(async () => (await api.devices.list({}))[0]?.online).toBe(true);
  const ticket = await api.relay.ticket({}),
    viewer = await relaySocket(f.base, f.auth.user.id, {
      type: "auth",
      protocolVersion: 2,
      role: "viewer",
      token: ticket.token,
    });
  await viewer.take("ready");
  const input = {
    id: crypto.randomUUID(),
    deviceId: grant.deviceId,
    projectId,
    provider: "codex" as const,
    mode: "run" as const,
    prompt: "Run tests",
  };
  return { ...f, api, grant, native, viewer, announce, input };
}
it("routes a browser command directly and publishes only the host-confirmed result", async () => {
  const f = await setup();
  f.viewer.send({
    type: "request",
    id: f.input.id,
    request: { method: "tasks.create", input: f.input },
  });
  const command = await f.native.take("command");
  expect(command.command.request).toMatchObject({ method: "tasks.create", input: f.input });
  expect(await f.api.tasks.list({ limit: 100 })).toEqual([]);
  const task = {
    ...f.input,
    status: "succeeded" as const,
    summary: "Tests passed",
    parentTaskId: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  f.native.send({
    type: "events",
    streamId: f.announce.streamId,
    events: [
      {
        sequence: 1,
        event: {
          id: crypto.randomUUID(),
          kind: "status",
          taskId: task.id,
          status: task.status,
          summary: task.summary,
          task,
        },
      },
    ],
  });
  await f.native.take("ack");
  f.native.send({ type: "result", routeId: command.routeId, result: { ok: true, value: task } });
  expect((await f.viewer.take("result")).result).toMatchObject({
    ok: true,
    value: { status: "succeeded" },
  });
  expect((await f.api.tasks.get({ id: task.id, after: 0 })).task.summary).toBe("Tests passed");
});
it("resumes device events and replays the viewer cursor after reconnect", async () => {
  const f = await setup(),
    task = {
      ...f.input,
      status: "running" as const,
      summary: "",
      parentTaskId: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  const event = {
    id: crypto.randomUUID(),
    kind: "status" as const,
    taskId: task.id,
    status: "running" as const,
    summary: "",
    task,
  };
  f.native.send({
    type: "events",
    streamId: f.announce.streamId,
    events: [{ sequence: 1, event }],
  });
  await f.native.take("ack");
  f.native.socket.close();
  const next = await relaySocket(f.base, f.auth.user.id, {
    type: "auth",
    protocolVersion: 2,
    role: "device",
    token: f.grant.token,
  });
  await next.take("ready");
  next.send(f.announce);
  expect((await next.take("resume")).sequence).toBe(1);
  next.send({ type: "events", streamId: f.announce.streamId, events: [{ sequence: 1, event }] });
  await next.take("ack");
  expect((await f.api.tasks.get({ id: task.id, after: 0 })).events).toHaveLength(1);
  const ticket = await f.api.relay.ticket({}),
    viewer = await relaySocket(f.base, f.auth.user.id, {
      type: "auth",
      protocolVersion: 2,
      role: "viewer",
      token: ticket.token,
      cursors: [{ deviceId: f.grant.deviceId, streamId: f.announce.streamId, sequence: 0 }],
    });
  await viewer.take("ready");
  expect((await viewer.take("changed")).events?.[0]?.sequence).toBe(1);
});
it("rejects cross-account commands and closes an authenticated device when revoked", async () => {
  const f = await setup(),
    other = controlAuth("other"),
    ticket = await f.control.ticket(other);
  const viewer = await relaySocket(f.base, other.user.id, {
    type: "auth",
    protocolVersion: 2,
    role: "viewer",
    token: ticket.token,
  });
  await viewer.take("ready");
  viewer.send({
    type: "request",
    id: f.input.id,
    request: { method: "tasks.create", input: f.input },
  });
  expect((await viewer.take("result")).result).toMatchObject({ ok: false, code: "NOT_FOUND" });
  expect(f.native.messages.some((frame) => frame.type === "command")).toBe(false);
  await f.api.devices.revoke({ deviceId: f.grant.deviceId, epoch: f.grant.epoch });
  await expect.poll(f.native.closed).toBe(4003);
});
it("rejects replaying a consumed viewer ticket", async () => {
  const f = await setup(),
    ticket = await f.api.relay.ticket({});
  const viewer = await relaySocket(f.base, f.auth.user.id, {
    type: "auth",
    protocolVersion: 2,
    role: "viewer",
    token: ticket.token,
  });
  await viewer.take("ready");
  const duplicate = await relaySocket(f.base, f.auth.user.id, {
    type: "auth",
    protocolVersion: 2,
    role: "viewer",
    token: ticket.token,
  });
  expect((await duplicate.take("error")).code).toBe("AUTH_REQUIRED");
  await expect.poll(duplicate.closed).toBe(4001);
});
it("uses the shared task SDK over WebSocket while reads remain HTTP projections", async () => {
  const f = await setup(),
    client = createTaskClient(f.api, { baseUrl: f.base });
  client.setAccount(f.auth.user.id);
  let changes = 0;
  const stop = client.subscribe(() => changes++);
  cleanups.push(async () => {
    stop();
    client.setAccount(null);
  });
  await expect.poll(() => changes).toBeGreaterThan(0);
  const result = client.tasks.create(f.input),
    replayed = client.tasks.create(f.input);
  const command = await f.native.take("command"),
    task = {
      ...f.input,
      status: "running" as const,
      summary: "",
      parentTaskId: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  f.native.send({
    type: "events",
    streamId: f.announce.streamId,
    events: [
      {
        sequence: 1,
        event: {
          id: crypto.randomUUID(),
          kind: "status",
          taskId: task.id,
          status: "running",
          summary: "",
          task,
        },
      },
    ],
  });
  await f.native.take("ack");
  f.native.send({ type: "result", routeId: command.routeId, result: { ok: true, value: task } });
  expect((await result).id).toBe(task.id);
  expect((await replayed).id).toBe(task.id);
  expect(f.native.messages.some((frame) => frame.type === "command")).toBe(false);
  expect((await client.tasks.list({ limit: 100 }))[0]?.id).toBe(task.id);
});
it("connects a standalone SDK mutation without requiring a view subscription", async () => {
  const f = await setup(),
    client = createTaskClient(f.api, { baseUrl: f.base });
  client.setAccount(f.auth.user.id);
  cleanups.push(async () => client.setAccount(null));
  const result = client.tasks.create(f.input),
    command = await f.native.take("command"),
    task = {
      ...f.input,
      status: "running" as const,
      summary: "",
      parentTaskId: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  f.native.send({ type: "result", routeId: command.routeId, result: { ok: true, value: task } });
  expect((await result).id).toBe(task.id);
});
