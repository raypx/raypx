import { afterEach, expect, it, vi } from "vite-plus/test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RemoteControl } from "../../native/control";
import {
  relayClientSchema,
  type RelayClientFrame,
  type RelayServerFrame,
  type SequencedEvent,
  type SnapshotRecord,
} from "@raypx/contracts/tasks";
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
});
async function control(
  options: NonNullable<ConstructorParameters<typeof RemoteControl>[4]> = {},
  rejectAuthentication = () => false,
) {
  const directory = mkdtempSync(join(tmpdir(), "raypx-relay-native-"));
  const streamId = crypto.randomUUID(),
    instanceId = crypto.randomUUID();
  const frames: RelayClientFrame[] = [],
    urls: string[] = [],
    journal: SequencedEvent[] = [],
    records: SnapshotRecord[] = [];
  let cursor = 0,
    initialized = false,
    floor = 0;
  const sockets = new Set<ReturnType<typeof sendSocket>>();
  function sendSocket(
    send: (value: string) => unknown,
    close: (code?: number, reason?: string) => unknown,
  ) {
    return { send: (frame: RelayServerFrame) => send(JSON.stringify(frame)), close };
  }
  const server = Bun.serve<{ peer: ReturnType<typeof sendSocket> }>({
    hostname: "127.0.0.1",
    port: 0,
    fetch(request, listener) {
      urls.push(request.url);
      const data = { peer: undefined as unknown as ReturnType<typeof sendSocket> };
      if (listener.upgrade(request, { data })) return;
      return new Response(null, { status: 426 });
    },
    websocket: {
      open(socket) {
        socket.data.peer = sendSocket(
          (value) => socket.send(value),
          (code, reason) => socket.close(code, reason),
        );
        sockets.add(socket.data.peer);
      },
      message(socket, value) {
        const frame = relayClientSchema.parse(JSON.parse(String(value)));
        frames.push(frame);
        const peer = socket.data.peer;
        if (frame.type === "auth" && rejectAuthentication()) {
          peer.close(4001, "Rejected grant");
          return;
        }
        if (frame.type === "auth")
          peer.send({ type: "ready", protocolVersion: 2, role: frame.role });
        if (frame.type === "announce")
          peer.send({ type: "resume", streamId, sequence: cursor, snapshot: !initialized });
        if (frame.type === "snapshot" && frame.done) {
          cursor = frame.sequence;
          initialized = true;
          peer.send({ type: "ack", streamId, sequence: cursor, snapshotId: frame.id });
        }
        if (frame.type === "events") {
          cursor = frame.events.at(-1)!.sequence;
          peer.send({ type: "ack", streamId, sequence: cursor });
        }
        if (frame.type === "ping") peer.send({ type: "pong" });
      },
      close(socket) {
        sockets.delete(socket.data.peer);
      },
    },
  });
  const request = vi.fn(
    async (method: string, params: Record<string, unknown>): Promise<unknown> => {
      if (method === "agents.events")
        return { instanceId, events: journal.map((item) => item.event) };
      if (method === "agents.projects" || method === "agents.capabilities") return [];
      if (method === "agents.replay")
        return {
          streamId,
          sequence: journal.at(-1)?.sequence ?? 0,
          floor: floor || journal[0]?.sequence || 0,
          events: journal.filter((item) => item.sequence > Number(params.after)).slice(0, 50),
        };
      if (method === "agents.snapshot")
        return {
          id: params.id ?? crypto.randomUUID(),
          streamId,
          sequence: journal.at(-1)?.sequence ?? 0,
          records,
          next: records.length,
          done: true,
        };
      return { accepted: true };
    },
  );
  const notify = vi.fn(),
    renew = vi.fn(),
    value = new RemoteControl(directory, { request }, notify, renew, options);
  const grant = {
    deviceId: crypto.randomUUID(),
    epoch: 1,
    token: "private-device-grant-" + crypto.randomUUID(),
    expiresAt: new Date(Date.now() + 600_000).toISOString(),
  };
  cleanups.push(async () => {
    await value.detach();
    await server.stop(true);
    rmSync(directory, { recursive: true, force: true });
  });
  await value.enable("account", true);
  await value.attach("account", server.url.origin, grant);
  await expect.poll(() => value.info("account").connected).toBe(true);
  return {
    value,
    directory,
    frames,
    urls,
    journal,
    records,
    grant,
    request,
    notify,
    renew,
    sockets,
    base: server.url.origin,
    setFloor: (sequence: number) => {
      floor = sequence;
    },
  };
}
it.each(["close", "error"] as const)(
  "backs off grants rejected through %s after successful renewal",
  async (trigger) => {
    let reject = false;
    const attempts: number[] = [];
    const renewGrant = vi.fn(
      async (_account: string, binding: { deviceId: string; epoch: number }) => {
        attempts.push(Date.now());
        return {
          ...binding,
          token: "renewed-" + crypto.randomUUID(),
          expiresAt: new Date(Date.now() + 600_000).toISOString(),
        };
      },
    );
    const f = await control({ renewGrant }, () => reject);
    const initialRequests = f.renew.mock.calls.length;
    reject = true;
    for (const peer of f.sockets) {
      if (trigger === "close") peer.close(4001, "Rejected grant");
      else peer.send({ type: "error", code: "AUTH_REQUIRED" });
    }
    await expect.poll(() => attempts.length, { timeout: 8000 }).toBeGreaterThanOrEqual(3);
    expect(attempts[1]! - attempts[0]!).toBeGreaterThanOrEqual(700);
    expect(attempts[2]! - attempts[1]!).toBeGreaterThanOrEqual(1400);
    expect(f.renew).toHaveBeenCalledTimes(initialRequests);
  },
  10_000,
);
it("finishes an in-flight command before replacing its socket for proactive renewal", async () => {
  const renewGrant = vi.fn(
    async (_account: string, binding: { deviceId: string; epoch: number }) => ({
      ...binding,
      token: "renewed-" + crypto.randomUUID(),
      expiresAt: new Date(Date.now() + 600_000).toISOString(),
    }),
  );
  const f = await control({ renewGrant }),
    original = f.request.getMockImplementation()!;
  let release!: () => void,
    started = false;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  f.request.mockImplementation(async (method, params) => {
    if (method === "agents.remote") {
      started = true;
      await gate;
      return { ok: true, value: {} };
    }
    return original(method, params);
  });
  const routeId = crypto.randomUUID();
  for (const peer of f.sockets)
    peer.send({
      type: "command",
      routeId,
      command: {
        id: crypto.randomUUID(),
        deviceId: f.grant.deviceId,
        expiresAt: new Date(Date.now() + 15_000).toISOString(),
        request: { method: "tasks.cancel", input: { id: crypto.randomUUID() } },
      },
    });
  await expect.poll(() => started).toBe(true);
  const pending = f.value.refreshGrant();
  await expect.poll(() => renewGrant.mock.calls.length).toBe(1);
  expect(f.frames.filter((frame) => frame.type === "auth")).toHaveLength(1);
  const deferredRoute = crypto.randomUUID();
  for (const peer of f.sockets)
    peer.send({
      type: "command",
      routeId: deferredRoute,
      command: {
        id: crypto.randomUUID(),
        deviceId: f.grant.deviceId,
        expiresAt: new Date(Date.now() + 15_000).toISOString(),
        request: { method: "tasks.cancel", input: { id: crypto.randomUUID() } },
      },
    });
  await expect
    .poll(() =>
      f.frames.find((frame) => frame.type === "result" && frame.routeId === deferredRoute),
    )
    .toMatchObject({ result: { ok: false, code: "REQUEST_CLOSED" } });
  expect(f.request.mock.calls.filter(([method]) => method === "agents.remote")).toHaveLength(1);
  release();
  expect(await pending).toBe(true);
  await expect.poll(() => f.frames.filter((frame) => frame.type === "auth").length).toBe(2);
  expect(f.frames.some((frame) => frame.type === "result" && frame.routeId === routeId)).toBe(true);
});
it("caps proactive renewal draining at ten seconds without cancelling the in-flight task", async () => {
  const renewGrant = vi.fn(
    async (_account: string, binding: { deviceId: string; epoch: number }) => ({
      ...binding,
      token: "renewed-" + crypto.randomUUID(),
      expiresAt: new Date(Date.now() + 600_000).toISOString(),
    }),
  );
  const f = await control({ renewGrant }),
    original = f.request.getMockImplementation()!;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  f.request.mockImplementation(async (method, params) =>
    method === "agents.remote"
      ? gate.then(() => ({ ok: true, value: {} }))
      : original(method, params),
  );
  for (const peer of f.sockets)
    peer.send({
      type: "command",
      routeId: crypto.randomUUID(),
      command: {
        id: crypto.randomUUID(),
        deviceId: f.grant.deviceId,
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        request: { method: "tasks.cancel", input: { id: crypto.randomUUID() } },
      },
    });
  await expect
    .poll(() => f.request.mock.calls.some(([method]) => method === "agents.remote"))
    .toBe(true);
  try {
    const started = Date.now();
    expect(await f.value.refreshGrant()).toBe(true);
    expect(Date.now() - started).toBeGreaterThanOrEqual(9_900);
    expect(Date.now() - started).toBeLessThan(13_000);
    await expect.poll(() => f.frames.filter((frame) => frame.type === "auth").length).toBe(2);
    expect(f.request.mock.calls.some(([method]) => method === "agents.detach")).toBe(false);
  } finally {
    release();
  }
}, 18_000);
it("persists installation identity and account intent while keeping credentials off disk and URLs", async () => {
  const f = await control(),
    saved = readFileSync(join(f.directory, "remote-control.json"), "utf8");
  expect(saved).not.toContain(f.grant.token);
  expect(f.urls.every((url) => !url.includes(f.grant.token))).toBe(true);
  expect(f.frames[0]).toMatchObject({
    type: "auth",
    protocolVersion: 2,
    role: "device",
    token: f.grant.token,
  });
  const restored = new RemoteControl(
    f.directory,
    { request: async () => ({}) },
    () => {},
    () => {},
  );
  expect(restored.info("account").installationId).toBe(f.value.info("account").installationId);
});
it("pushes journal events on engine changes and checkpoints only after the relay acknowledges", async () => {
  const f = await control();
  const event = {
    id: crypto.randomUUID(),
    taskId: crypto.randomUUID(),
    kind: "status" as const,
    status: "succeeded" as const,
    summary: "Done",
  };
  f.journal.push({ sequence: 1, event });
  await f.value.wake();
  expect(f.frames.filter((frame) => frame.type === "events")).toHaveLength(1);
  expect(f.request).toHaveBeenCalledWith("agents.checkpoint", {
    binding: `account:${f.grant.deviceId}:1`,
    sequence: 1,
  });
  await f.value.wake();
  expect(f.frames.filter((frame) => frame.type === "events")).toHaveLength(1);
});
it("reconnects and sends only events after the server cursor without detaching local execution", async () => {
  const f = await control(),
    taskId = crypto.randomUUID();
  f.journal.push({
    sequence: 1,
    event: { id: crypto.randomUUID(), taskId, kind: "status", status: "running", summary: "" },
  });
  await f.value.wake();
  for (const socket of f.sockets) socket.close(1012, "Restart");
  await expect.poll(() => f.value.info("account").connected).toBe(false);
  f.journal.push({
    sequence: 2,
    event: {
      id: crypto.randomUUID(),
      taskId,
      kind: "status",
      status: "succeeded",
      summary: "Done",
    },
  });
  await expect.poll(() => f.frames.filter((frame) => frame.type === "events").length).toBe(2);
  const batches = f.frames.filter((frame) => frame.type === "events");
  expect(batches[1]?.events.map((item) => item.sequence)).toEqual([2]);
  expect(f.request.mock.calls.some(([method]) => method === "agents.detach")).toBe(false);
});
it("uses a complete snapshot when the replay cursor falls behind retained events", async () => {
  const f = await control();
  const task = {
    id: crypto.randomUUID(),
    deviceId: f.grant.deviceId,
    projectId: crypto.randomUUID(),
    provider: "codex" as const,
    mode: "run" as const,
    prompt: "Task",
    status: "succeeded" as const,
    summary: "Restored",
    parentTaskId: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  f.journal.push({
    sequence: 5000,
    event: {
      id: crypto.randomUUID(),
      taskId: task.id,
      kind: "status",
      status: "succeeded",
      summary: task.summary,
      task,
    },
  });
  f.records.push({ kind: "task", task });
  f.setFloor(5000);
  await f.value.wake();
  const snapshots = f.frames.filter((frame) => frame.type === "snapshot");
  expect(snapshots.at(-1)).toMatchObject({ sequence: 5000, records: [{ kind: "task", task }] });
});
it("renews a connection without cancelling tasks and disables execution after server revocation", async () => {
  const f = await control();
  await f.value.attach("account", f.base, {
    ...f.grant,
    token: "fresh-grant-" + crypto.randomUUID(),
    expiresAt: new Date(Date.now() + 59_000).toISOString(),
  });
  await expect.poll(() => f.value.info("account").connected).toBe(true);
  expect(f.renew).toHaveBeenCalled();
  expect(f.request.mock.calls.some(([method]) => method === "agents.detach")).toBe(false);
  for (const socket of f.sockets) socket.close(4003, "Revoked");
  await expect.poll(() => f.value.info("account").enabled).toBe(false);
  expect(f.request).toHaveBeenCalledWith("agents.detach", {
    binding: `account:${f.grant.deviceId}:1`,
  });
});
it("renews expiring grants entirely in Native without waking the renderer or detaching tasks", async () => {
  const renewGrant = vi.fn(
    async (_accountId: string, binding: { deviceId: string; epoch: number }) => ({
      ...binding,
      token: "native-renewed-token-" + crypto.randomUUID(),
      expiresAt: new Date(Date.now() + 600_000).toISOString(),
    }),
  );
  const f = await control({ renewGrant });
  f.renew.mockClear();
  await f.value.attach("account", f.base, {
    ...f.grant,
    expiresAt: new Date(Date.now() + 59_000).toISOString(),
  });
  await expect
    .poll(() =>
      f.frames.some(
        (frame) => frame.type === "auth" && frame.token.startsWith("native-renewed-token-"),
      ),
    )
    .toBe(true);
  await expect.poll(() => f.value.info("account").connected).toBe(true);
  expect(renewGrant).toHaveBeenCalledWith("account", { deviceId: f.grant.deviceId, epoch: 1 });
  expect(f.renew).not.toHaveBeenCalled();
  expect(f.request.mock.calls.some(([method]) => method === "agents.detach")).toBe(false);
});
it("does not reconnect a late native grant after logout and detaches on an expired account session", async () => {
  let complete!: (value: {
    deviceId: string;
    epoch: number;
    token: string;
    expiresAt: string;
  }) => void;
  const f = await control({
    renewGrant: () =>
      new Promise((resolve) => {
        complete = resolve;
      }),
  });
  const pending = f.value.refreshGrant();
  await f.value.detach();
  complete({ ...f.grant, token: "late-token" });
  expect(await pending).toBe(false);
  expect(f.value.info("account").connected).toBe(false);
  expect(f.frames.some((frame) => frame.type === "auth" && frame.token === "late-token")).toBe(
    false,
  );
  const expired = await control({
    renewGrant: async () => {
      throw Object.assign(new Error("AUTH_REQUIRED"), { code: "UNAUTHORIZED" });
    },
  });
  expect(await expired.value.refreshGrant()).toBe(false);
  expect(expired.value.info("account").connected).toBe(false);
  expect(expired.request).toHaveBeenCalledWith("agents.detach", {
    binding: `account:${expired.grant.deviceId}:1`,
  });
});
it("keeps startup available when local connection metadata is corrupt", async () => {
  const directory = mkdtempSync(join(tmpdir(), "raypx-relay-corrupt-"));
  writeFileSync(join(directory, "remote-control.json"), "{broken");
  try {
    const value = new RemoteControl(
      directory,
      { request: async () => ({}) },
      () => {},
      () => {},
    );
    expect(value.info("account").error).toBe("SETTINGS_UNAVAILABLE");
    await expect(value.enable("account", true)).rejects.toThrow("Remote settings are unavailable");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

it("delegates terminal authorization loss to its owner", async () => {
  const lost = vi.fn(async () => {});
  const fixture = await control({
    renewGrant: async () => {
      throw Object.assign(new Error("expired"), { code: "UNAUTHORIZED" });
    },
    authorizationLost: lost,
  });
  expect(await fixture.value.refreshGrant()).toBe(false);
  expect(lost).toHaveBeenCalledExactlyOnceWith("AUTH_REQUIRED");
});

it("tries the preferred protocol again when explicitly attaching after an old-server connection", async () => {
  const fixture = await control({ protocolVersion: 3 });
  expect(fixture.value.info("account").terminalSupported).toBe(false);
  await fixture.value.attach("account", fixture.base, {
    ...fixture.grant,
    token: "new-grant-" + crypto.randomUUID(),
  });
  await expect.poll(() => fixture.frames.filter((frame) => frame.type === "auth").length).toBe(2);
  expect(fixture.frames.filter((frame) => frame.type === "auth").at(-1)).toMatchObject({
    protocolVersion: 3,
  });
});
