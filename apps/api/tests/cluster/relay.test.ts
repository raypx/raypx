import { afterAll, afterEach, beforeAll, expect, it } from "vite-plus/test";
import { serve } from "bun";
import { Redis } from "ioredis";
import { connectDatabase, migrateDatabase } from "@raypx/database";
import { user, session } from "@raypx/database/schema";
import { eq } from "drizzle-orm";
import {
  relayServerSchema,
  type RelayClientFrame,
  type RelayServerFrame,
} from "@raypx/contracts/tasks";
import type { CloudJobAction, CloudJobRun } from "@raypx/jobs";
import type { AgentTask } from "@raypx/core/tasks";
import { RelayHub } from "../../server/relay/hub.js";
import { RedisRelayCluster } from "../../server/relay/redis.js";
import { ControlService } from "../../server/control/service.js";
import { createControlRepository } from "../../server/control/repository.js";
import { createApiRuntime } from "../../server/runtime/server.js";
import { getApiEnvironment } from "../../server/env.js";
import { connected, controlAuth, observed } from "../helpers/control.js";

const url = process.env.TEST_DATABASE_URL,
  redisUrl = process.env.TEST_REDIS_URL;
if (!url || !new URL(url).pathname.endsWith("_test") || !redisUrl)
  throw new Error("Isolated *_test PostgreSQL and TEST_REDIS_URL are required");
const database = connectDatabase(url, { max: 2 });
const cleanups: (() => Promise<void>)[] = [];
beforeAll(() => migrateDatabase(url));
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});
afterAll(() => database.close());

async function node(prefix: string) {
  const connection = connectDatabase(url!, { max: 2 });
  const control = new ControlService(createControlRepository(connection.db));
  const hub = new RelayHub(async (use) => use(control));
  const cluster = new RedisRelayCluster(redisUrl!, prefix);
  cleanups.push(async () => {
    await hub.shutdown();
    await connection.close();
  });
  await hub.attachCluster(cluster);
  const server = serve<{ id: string }>({
    hostname: "127.0.0.1",
    port: 0,
    fetch(request, listener) {
      if (listener.upgrade(request, { data: { id: crypto.randomUUID() } })) return;
      return new Response(null, { status: 426 });
    },
    websocket: {
      open(socket) {
        hub.open({
          id: socket.data.id,
          send(frame) {
            socket.send(JSON.stringify(frame));
          },
          close(code, reason) {
            socket.close(code, reason);
          },
        });
      },
      message(socket, value) {
        if (typeof value === "string") void hub.receive(socket.data.id, value);
      },
      close(socket) {
        void hub.close(socket.data.id).catch(() => {});
      },
    },
  });
  cleanups.push(async () => {
    await server.stop(true);
  });
  return { hub, control, cluster, url: `ws://127.0.0.1:${server.port}/relay` };
}
async function wire(
  target: Awaited<ReturnType<typeof node>>,
  role: "viewer" | "device",
  token: string,
) {
  const socket = new WebSocket(target.url),
    frames: RelayServerFrame[] = [],
    history: RelayServerFrame[] = [];
  const closed: number[] = [];
  socket.addEventListener("message", (event) => {
    const frame = relayServerSchema.parse(JSON.parse(String(event.data)));
    frames.push(frame);
    history.push(frame);
  });
  socket.addEventListener("close", (event) => closed.push(event.code));
  const send = (frame: RelayClientFrame) => socket.send(JSON.stringify(frame));
  async function take<T extends RelayServerFrame["type"]>(type: T) {
    await expect
      .poll(() => frames.some((frame) => frame.type === type), { timeout: 3000 })
      .toBe(true);
    return frames.splice(
      frames.findIndex((frame) => frame.type === type),
      1,
    )[0] as Extract<RelayServerFrame, { type: T }>;
  }
  cleanups.push(async () => {
    socket.close();
  });
  await expect.poll(() => socket.readyState).toBe(WebSocket.OPEN);
  send({ type: "auth", protocolVersion: 4, role, token });
  await take("ready");
  return { socket, send, take, history, closed };
}
async function fixture() {
  const auth = controlAuth(`cluster-${crypto.randomUUID()}`);
  await database.db.insert(user).values(auth.user);
  await database.db.insert(session).values({
    id: auth.session.id,
    userId: auth.user.id,
    token: crypto.randomUUID(),
    expiresAt: auth.session.expiresAt,
  });
  cleanups.push(async () => {
    await database.db.delete(user).where(eq(user.id, auth.user.id));
  });
  const prefix = `raypx-cluster-test:${crypto.randomUUID()}:`;
  const a = await node(prefix),
    b = await node(prefix);
  const f = await connected(a.control, auth);
  const credential = await a.control.authorizeHost(auth, f.grant);
  const host = await a.control.hostGrant(credential.credential);
  const device = await wire(b, "device", host.grant.token);
  device.send(f.announce);
  await device.take("resume");
  device.send({ type: "available" });
  await expect
    .poll(async () => (await a.control.connection(auth.user.id, f.grant.deviceId))?.ready)
    .toBe(true);
  const ticket = await a.control.ticket(auth);
  const viewer = await wire(a, "viewer", ticket.token);
  return { ...f, auth, a, b, device, viewer, token: host.grant.token };
}
function run(jobAction: CloudJobAction): CloudJobRun {
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
    action: jobAction,
    taskId: jobAction.type === "agent.run" ? id : null,
    code: null,
    sync: null,
  };
}
function action(f: Awaited<ReturnType<typeof fixture>>): CloudJobAction {
  return {
    type: "agent.run",
    deviceId: f.grant.deviceId,
    epoch: f.grant.epoch,
    projectId: f.input.projectId,
    provider: "codex",
    mode: "run",
    prompt: f.input.prompt,
  };
}
function task(f: Awaited<ReturnType<typeof fixture>>, id: string): AgentTask {
  const now = new Date().toISOString();
  return {
    ...f.input,
    id,
    parentTaskId: null,
    status: "running",
    summary: "",
    createdAt: now,
    updatedAt: now,
  };
}

it("owns Relay and readiness per server runtime and closes one without stopping the other", async () => {
  const environment = getApiEnvironment({
    NODE_ENV: "test",
    DATABASE_URL: url,
    REDIS_URL: redisUrl,
  });
  const first = await createApiRuntime(environment),
    second = await createApiRuntime(environment);
  cleanups.push(
    () => second.close(),
    () => first.close(),
  );
  const ready = () => second.app.fetch(new Request("http://localhost/ready"));
  expect((await ready()).status).toBe(200);
  await first.close();
  expect(first.relay.ready()).toBe(false);
  expect(second.relay.ready()).toBe(true);
  expect(await (await ready()).json()).toMatchObject({
    status: "ok",
    checks: { database: "ok", redis: "ok", relay: "ok" },
  });
});

it("routes a viewer command and committed task/observed changes across two socket servers", async () => {
  const f = await fixture();
  f.viewer.send({
    type: "request",
    id: f.input.id,
    request: { method: "tasks.create", input: f.input },
  });
  const command = await f.device.take("command");
  expect(command.command.id).toBe(f.input.id);
  const value = task(f, f.input.id);
  f.device.send({ type: "result", routeId: command.routeId, result: { ok: true, value } });
  expect(await f.viewer.take("result")).toMatchObject({
    id: f.input.id,
    result: { ok: true, value },
  });
  f.device.send({
    type: "events",
    streamId: f.announce.streamId,
    events: [
      {
        sequence: 1,
        event: {
          id: crypto.randomUUID(),
          taskId: value.id,
          kind: "status",
          status: "running",
          summary: "",
          task: value,
        },
      },
    ],
  });
  await f.device.take("ack");
  await expect
    .poll(() => f.viewer.history.some((frame) => frame.type === "changed" && frame.sequence === 1))
    .toBe(true);
  expect((await f.a.control.getTask(f.auth.user.id, value.id, 0)).task.id).toBe(value.id);
  const observation = observed(f.input.projectId);
  f.device.send(observation.frame);
  await f.device.take("observed_ack");
  expect(await f.viewer.take("observed_changed")).toEqual({
    type: "observed_changed",
    deviceId: f.grant.deviceId,
  });
});

it("dispatches jobs without browser sessions and completes sync only after the correlated final snapshot commits", async () => {
  const f = await fixture(),
    job = run(action(f)),
    signal = new AbortController().signal;
  await database.db.delete(session).where(eq(session.id, f.auth.session.id));
  const pending = f.a.hub.dispatch(f.auth.user.id, job, signal);
  const command = await f.device.take("command");
  const value = task(f, job.id);
  f.device.send({ type: "result", routeId: command.routeId, result: { ok: true, value } });
  expect(await pending).toEqual({ type: "task", taskId: job.id, status: "running" });
  expect(await f.a.control.jobTask(f.auth.user.id, job.id)).toBeNull();
  const sync = run({ type: "device.sync", deviceId: f.grant.deviceId, epoch: f.grant.epoch });
  let complete = false;
  const synced = f.a.hub.sync(f.auth.user.id, sync, signal).then((syncedValue) => {
    complete = true;
    return syncedValue;
  });
  const resume = await f.device.take("resume");
  expect(resume.syncId).toBe(sync.id);
  const snapshot = {
    type: "snapshot" as const,
    id: crypto.randomUUID(),
    streamId: f.announce.streamId,
    sequence: 7,
    syncId: sync.id,
  };
  f.device.send({ ...snapshot, records: [{ kind: "task", task: value }], done: false });
  f.device.send({ type: "ping" });
  await f.device.take("pong");
  expect(complete).toBe(false);
  expect(await f.a.control.jobTask(f.auth.user.id, job.id)).toBeNull();
  f.device.send({ ...snapshot, records: [], done: true });
  await f.device.take("ack");
  expect(await synced).toEqual({ type: "synced", streamId: snapshot.streamId, sequence: 7 });
  expect(await f.a.control.jobTask(f.auth.user.id, job.id)).toEqual({ status: "running" });
});

it("fences the previous node after reconnect and propagates revocation from another node", async () => {
  const f = await fixture();
  const previous = await f.a.control.connection(f.auth.user.id, f.grant.deviceId);
  const replacement = await wire(f.a, "device", f.token);
  replacement.send(f.announce);
  await replacement.take("resume");
  replacement.send({ type: "available" });
  await expect
    .poll(async () => (await f.b.control.connection(f.auth.user.id, f.grant.deviceId))?.ready)
    .toBe(true);
  await expect.poll(() => f.device.closed).toContain(4002);
  const current = await f.b.control.connection(f.auth.user.id, f.grant.deviceId);
  expect(current?.id).not.toBe(previous?.id);
  await expect(
    f.a.cluster.invoke(
      f.b.cluster.nodeId,
      {
        type: "sync",
        userId: f.auth.user.id,
        connectionId: previous!.id,
        run: run({ type: "device.sync", deviceId: f.grant.deviceId, epoch: f.grant.epoch }),
      },
      new AbortController().signal,
    ),
  ).rejects.toMatchObject({ code: "DEVICE_OFFLINE", uncertain: false });
  await f.b.control.revoke(f.auth.user.id, { deviceId: f.grant.deviceId, epoch: f.grant.epoch });
  await f.b.hub.revoke(f.auth.user.id, f.grant.deviceId);
  await expect.poll(() => replacement.closed).toContain(4003);
  await expect(
    f.a.hub.dispatch(f.auth.user.id, run(action(f)), new AbortController().signal),
  ).rejects.toMatchObject({ code: "DEVICE_REVOKED", uncertain: false });
});

it.each(["subscriber", "publisher"])(
  "marks delivery uncertain on %s loss, disconnects viewers, recovers and never resends",
  async (role) => {
    const f = await fixture(),
      job = run(action(f));
    const pending = f.a.hub.dispatch(f.auth.user.id, job, new AbortController().signal);
    const settled = pending.catch((error: unknown) => error);
    const command = await f.device.take("command");
    const admin = new Redis(redisUrl);
    try {
      const clients = String(await admin.client("LIST")).split("\n");
      const line = clients.find((entry) =>
        entry.includes(`name=raypx-relay:${f.a.cluster.nodeId}:${role} `),
      );
      const id = line?.match(/^id=(\d+) /)?.[1];
      expect(id).toBeDefined();
      await admin.client("KILL", "ID", id!);
      await expect(settled).resolves.toMatchObject({ code: "SERVER_UNAVAILABLE", uncertain: true });
      await expect.poll(() => f.viewer.closed).toContain(1013);
      await expect.poll(() => f.a.hub.ready()).toBe(true);
      f.device.send({
        type: "result",
        routeId: command.routeId,
        result: { ok: true, value: task(f, job.id) },
      });
      f.device.send({ type: "ping" });
      await f.device.take("pong");
      expect(f.device.history.filter((frame) => frame.type === "command")).toHaveLength(1);
    } finally {
      admin.disconnect();
    }
  },
);

it("revalidates the originating viewer on the owning node before sending a forwarded command", async () => {
  const f = await fixture();
  const ticket = await f.a.control.ticket(f.auth);
  const viewer = await f.a.control.authenticate("viewer", ticket.token, crypto.randomUUID());
  const command = await f.a.control.route(f.auth.user.id, f.input.id, {
    method: "tasks.create",
    input: f.input,
  });
  const connection = await f.a.control.connection(f.auth.user.id, f.grant.deviceId);
  await database.db.delete(session).where(eq(session.id, f.auth.session.id));
  await expect(
    f.a.cluster.invoke(
      f.b.cluster.nodeId,
      {
        type: "command",
        viewer: { ...viewer, role: "viewer" },
        connectionId: connection!.id,
        command,
      },
      new AbortController().signal,
    ),
  ).rejects.toMatchObject({ code: "AUTH_REQUIRED", uncertain: false });
  expect(f.device.history.some((frame) => frame.type === "command")).toBe(false);
});

it("distinguishes an absent owner from cancellation after delivery without retrying execution", async () => {
  const f = await fixture(),
    job = run(action(f));
  await expect(
    f.a.cluster.invoke(
      crypto.randomUUID(),
      { type: "dispatch", userId: f.auth.user.id, connectionId: crypto.randomUUID(), run: job },
      new AbortController().signal,
    ),
  ).rejects.toMatchObject({ code: "DEVICE_OFFLINE", uncertain: false });
  const abort = new AbortController();
  const pending = f.a.hub.dispatch(f.auth.user.id, job, abort.signal);
  const settled = pending.catch((error: unknown) => error);
  const command = await f.device.take("command");
  abort.abort();
  await expect(settled).resolves.toMatchObject({ code: "REQUEST_TIMEOUT", uncertain: true });
  f.device.send({
    type: "result",
    routeId: command.routeId,
    result: { ok: true, value: task(f, job.id) },
  });
  f.device.send({ type: "ping" });
  await f.device.take("pong");
  expect(f.device.history.filter((frame) => frame.type === "command")).toHaveLength(1);
});
