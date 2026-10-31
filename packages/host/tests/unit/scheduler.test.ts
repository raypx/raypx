import { afterEach, expect, it, vi } from "vite-plus/test";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { RemoteControl } from "../../src/control.js";
import { deferred, ManualScheduler, RelaySocket } from "../../../client/tests/helpers/relay.js";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
});
async function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "raypx-control-clock-"));
  const scheduler = new ManualScheduler(),
    sockets: RelaySocket[] = [];
  const streamId = crypto.randomUUID(),
    snapshotId = crypto.randomUUID();
  const attempts: number[] = [];
  const renewGrant = vi.fn(
    async (_account: string, binding: { deviceId: string; epoch: number }) => {
      attempts.push(scheduler.now());
      return {
        ...binding,
        token: "synthetic-renewed",
        expiresAt: new Date(scheduler.now() + 600_000).toISOString(),
      };
    },
  );
  const request = vi.fn(async (method: string): Promise<unknown> => {
    if (method === "agents.replay") return { streamId, sequence: 0, floor: 0, events: [] };
    if (method === "agents.events") return { instanceId: crypto.randomUUID() };
    if (method === "agents.snapshot")
      return { id: snapshotId, streamId, sequence: 0, records: [], next: 0, done: true };
    if (method === "agents.projects" || method === "agents.capabilities") return [];
    return { ok: true, value: {} };
  });
  const required = vi.fn();
  const value = new RemoteControl(directory, { request }, () => {}, required, {
    scheduler,
    renewGrant,
    socket: () => {
      const socket = new RelaySocket();
      sockets.push(socket);
      return socket.asWebSocket();
    },
  });
  const grant = {
    deviceId: crypto.randomUUID(),
    epoch: 1,
    token: "synthetic-device-grant",
    expiresAt: new Date(scheduler.now() + 600_000).toISOString(),
  };
  await value.enable("account", true);
  await value.attach("account", "https://relay.example.test", grant);
  async function authenticate(socket = sockets.at(-1)!) {
    socket.open();
    await socket.sent((frame) => frame.type === "auth");
    return socket;
  }
  async function ready(snapshot = false, socket = sockets.at(-1)!) {
    await authenticate(socket);
    socket.receive({ type: "ready", role: "device", protocolVersion: 3 });
    await socket.sent((frame) => frame.type === "announce");
    socket.receive({ type: "resume", streamId, sequence: 0, snapshot });
    if (!snapshot) await socket.sent((frame) => frame.type === "available");
    return socket;
  }
  async function dispose() {
    await value.detach();
    rmSync(directory, { force: true, recursive: true });
  }
  cleanups.push(dispose);
  return {
    value,
    scheduler,
    sockets,
    grant,
    attempts,
    request,
    required,
    renewGrant,
    streamId,
    authenticate,
    ready,
    dispose,
  };
}

it.each(["close", "error"] as const)(
  "backs off rejected grants through %s deterministically for 100 independent runs",
  async (trigger) => {
    for (let repetition = 0; repetition < 100; repetition++) {
      const f = await fixture();
      await f.ready();
      const initialRequests = f.required.mock.calls.length,
        startedAt = f.scheduler.now();
      let socket = f.sockets.at(-1)!;
      for (const delay of [400, 800, 1600]) {
        if (trigger === "close") socket.close(4001);
        else socket.receive({ type: "error", code: "AUTH_REQUIRED" });
        expect(f.scheduler.nextDelay).toBe(delay);
        const previous = f.sockets.length;
        f.scheduler.advance(delay - 1);
        expect(f.sockets).toHaveLength(previous);
        f.scheduler.advance(1);
        // Await renewal itself, including its command-drain continuation, before opening the next socket.
        expect(await f.value.refreshGrant()).toBe(true);
        expect(f.sockets).toHaveLength(previous + 1);
        socket = await f.authenticate();
      }
      expect(f.attempts.map((at) => at - startedAt)).toEqual([400, 1200, 2800]);
      expect(f.required).toHaveBeenCalledTimes(initialRequests);
      await f.dispose();
      cleanups.pop();
      expect(f.scheduler.pending).toBe(0);
    }
  },
);

it("bounds renewal drain and fences a command that completes on the replaced socket", async () => {
  const f = await fixture(),
    socket = await f.ready();
  const started = deferred(),
    command = deferred<unknown>(),
    original = f.request.getMockImplementation()!;
  f.request.mockImplementation(async (method) => {
    if (method === "agents.remote") {
      started.resolve();
      return command.promise;
    }
    return original(method);
  });
  const routeId = crypto.randomUUID();
  socket.receive({
    type: "command",
    routeId,
    command: {
      id: crypto.randomUUID(),
      deviceId: f.grant.deviceId,
      expiresAt: new Date(f.scheduler.now() + 60_000).toISOString(),
      request: { method: "tasks.cancel", input: { id: crypto.randomUUID() } },
    },
  });
  await started.promise;
  const renewal = f.value.refreshGrant();
  await f.renewGrant.mock.results[0]!.value;
  expect(f.sockets).toHaveLength(1);
  socket.receive({
    type: "command",
    routeId: crypto.randomUUID(),
    command: {
      id: crypto.randomUUID(),
      deviceId: f.grant.deviceId,
      expiresAt: new Date(f.scheduler.now() + 60_000).toISOString(),
      request: { method: "tasks.cancel", input: { id: crypto.randomUUID() } },
    },
  });
  expect(await socket.sent((frame) => frame.type === "result")).toMatchObject({
    result: { ok: false, code: "REQUEST_CLOSED" },
  });
  f.scheduler.advance(9999);
  expect(f.sockets).toHaveLength(1);
  f.scheduler.advance(1);
  expect(await renewal).toBe(true);
  expect(f.sockets).toHaveLength(2);
  command.resolve({ ok: true, value: {} });
  await command.promise;
  await f.value.wake();
  expect(socket.frames.some((frame) => frame.type === "result" && frame.routeId === routeId)).toBe(
    false,
  );
  expect(f.request.mock.calls.some(([method]) => method === "agents.detach")).toBe(false);
});

it("restarts an unacknowledged snapshot exactly at the injected acknowledgement deadline", async () => {
  const f = await fixture(),
    socket = await f.ready(true);
  await socket.sent((frame) => frame.type === "snapshot");
  const syncing = f.value.wake();
  f.scheduler.advance(9999);
  expect(f.sockets).toHaveLength(1);
  f.scheduler.advance(1);
  await syncing;
  expect(f.sockets).toHaveLength(2);
  expect(f.value.info("account").error).toBe("NETWORK_UNAVAILABLE");
});
