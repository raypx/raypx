import { afterEach, expect, it } from "vite-plus/test";
import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  writeFileSync,
  cpSync,
  existsSync,
  readFileSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { DesktopChannel } from "@raypx/contracts/desktop";
import { startDaemon } from "../../../../helpers/enrolled.ts";
import { startDaemon as startUnenrolledDaemon } from "../../../../../src/runtime/daemon/server.ts";
import { daemonFetch } from "../../../../../src/runtime/daemon/endpoint.ts";
import { localFetch, type LocalAddress } from "../../../../../src/runtime/local-http.ts";
import { readTerminalEndpoint, terminalFetch } from "../../../../../src/runtime/terminal/host.ts";
import type { ObservedProjection } from "@raypx/contracts/terminal";

const pageOrigin = `mygo://${"a".repeat(32)}`;
type Packet = {
  type: string;
  id?: string;
  streamId?: string;
  sequence?: number;
  result?: unknown;
  error?: { code: string };
  event?: { event: string; data: Record<string, unknown> };
};
const cleanups: (() => unknown)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

async function fixture(agent = false, enrolled = true) {
  const dataDir = mkdtempSync(join(tmpdir(), "raypx-desktop-gateway-"));
  cleanups.push(() => rmSync(dataDir, { recursive: true, force: true }));
  const project = join(dataDir, "project"),
    bin = join(dataDir, "bin");
  mkdirSync(project);
  mkdirSync(bin);
  if (agent) {
    cpSync(join(import.meta.dirname, "../../../../fixtures/agents"), bin, { recursive: true });
    writeFileSync(join(bin, "codex"), `#!${process.execPath}\nimport "./codex-interactive.ts";`, {
      mode: 0o700,
    });
  }
  const start = enrolled ? startDaemon : startUnenrolledDaemon;
  const host = await start({
    dataDir,
    ...(agent ? { agentExecutables: { codex: join(bin, "codex") } } : {}),
  });
  cleanups.push(() => host.close());
  const apiUrl = "https://api.example.test";
  async function bootstrap(extra: Record<string, unknown> = {}) {
    const response = await daemonFetch(host.endpoint, "/desktop", {
      action: "bootstrap",
      protocol: 1,
      apiUrl,
      pageOrigin,
      key: Buffer.alloc(32, 4).toString("base64"),
      ...extra,
    });
    const envelope = (await response.json()) as {
      result: { channel: DesktopChannel; nativeCapability: string; nativeAddress: LocalAddress };
      error?: unknown;
    };
    expect(envelope.error).toBeUndefined();
    return envelope.result;
  }
  const descriptor = await bootstrap();
  async function native(action: Record<string, unknown>) {
    const response = await localFetch(descriptor.nativeAddress, "/desktop/native", {
      method: "POST",
      headers: {
        authorization: `Bearer ${descriptor.nativeCapability}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(action),
    });
    expect(response.ok).toBe(true);
    return ((await response.json()) as { result: unknown }).result;
  }
  return { dataDir, project, host, descriptor, bootstrap, native };
}

async function connect(
  channel: DesktopChannel,
  options: { origin?: string; capability?: string; protocol?: number; ack?: boolean } = {},
) {
  const socket = new WebSocket(channel.url, { headers: { origin: options.origin ?? pageOrigin } });
  cleanups.push(() => {
    socket.close();
  });
  const packets: Packet[] = [];
  const pending = new Map<
    string,
    { resolve(value: unknown): void; reject(error: unknown): void }
  >();
  let ready!: () => void;
  const opened = new Promise<void>((resolve) => {
    ready = resolve;
  });
  let closed!: () => void;
  const ended = new Promise<void>((resolve) => {
    closed = resolve;
  });
  socket.addEventListener("close", () => {
    for (const operation of pending.values()) operation.reject(new Error("channel closed"));
    pending.clear();
    closed();
  });
  socket.addEventListener("error", () => {
    closed();
  });
  socket.addEventListener("open", () => {
    socket.send(
      JSON.stringify({
        type: "authenticate",
        protocol: options.protocol ?? 1,
        capability: options.capability ?? channel.capability,
      }),
    );
  });
  socket.addEventListener("message", ({ data }) => {
    const packet = JSON.parse(String(data)) as Packet;
    packets.push(packet);
    if (packet.type === "ready") ready();
    if (packet.type === "event" && options.ack !== false)
      socket.send(
        JSON.stringify({ type: "ack", streamId: packet.streamId, sequence: packet.sequence }),
      );
    if (packet.type === "response" && packet.id) {
      const operation = pending.get(packet.id);
      pending.delete(packet.id);
      if (packet.error)
        operation?.reject(Object.assign(new Error(packet.error.code), packet.error));
      else operation?.resolve(packet.result);
    }
  });
  function request(method: string, params: unknown) {
    const id = crypto.randomUUID();
    return new Promise<unknown>((resolve, reject) => {
      pending.set(id, { resolve, reject });
      socket.send(JSON.stringify({ type: "request", id, method, params }));
    });
  }
  return {
    socket,
    packets,
    ready: opened,
    ended,
    request,
    local: (method: string, params: unknown = {}) => request("local_request", { method, params }),
  };
}

it("exposes a separate authenticated listener and refuses admin/native authority to the renderer", async () => {
  const { host, descriptor, native } = await fixture();
  expect(JSON.stringify(descriptor.channel)).not.toContain(host.endpoint.token);
  expect(descriptor.channel.capability).not.toBe(descriptor.nativeCapability);
  expect(
    (
      await localFetch(host.endpoint, "/info", {
        headers: { authorization: `Bearer ${descriptor.channel.capability}` },
      })
    ).status,
  ).toBe(403);
  for (const [path, token] of [
    ["/info", descriptor.nativeCapability],
    ["/desktop/native", descriptor.channel.capability],
  ] as const) {
    expect(
      (
        await localFetch(host.endpoint, path, {
          method: path === "/info" ? "GET" : "POST",
          headers: { authorization: `Bearer ${token}` },
        })
      ).status,
    ).toBe(403);
  }
  const peer = await connect(descriptor.channel);
  await peer.ready;
  expect(await peer.local("roots.list")).toEqual([]);
  for (const method of [
    "roots.register",
    "host.info",
    "host.authorize",
    "approvals.local.watch",
    "observed.remote",
    "agents.remote",
    "runtime.info",
  ])
    await expect(peer.local(method)).rejects.toMatchObject({ code: "METHOD_NOT_PERMITTED" });
  await expect(
    peer.local("agents.local.list", { accountId: "cloud-account" }),
  ).rejects.toMatchObject({ code: "LOCAL_ERROR" });
  await expect(peer.request("visible", { active: true })).rejects.toMatchObject({
    code: "METHOD_NOT_PERMITTED",
  });
  await expect(
    peer.request("api_fetch", {
      path: "/rpc/hosts/authorize",
      method: "POST",
      headers: {},
      body: "{}",
    }),
  ).rejects.toMatchObject({ code: "INVALID_API_REQUEST" });
  await native({ action: "open_approvals", scope: "local" });
  await expect
    .poll(() => peer.packets.some((packet) => packet.event?.event === "approval.open"))
    .toBe(true);
});

it("keeps an unenrolled renderer available for first-time instance registration", async () => {
  const { descriptor, native } = await fixture(false, false);
  const peer = await connect(descriptor.channel);
  await peer.ready;
  await native({ action: "visible", active: true });
  expect(await peer.local("instance.status")).toMatchObject({ state: "unregistered" });
  await expect(peer.local("roots.list")).rejects.toMatchObject({
    code: "INSTANCE_ENROLLMENT_REQUIRED",
  });
  expect(peer.socket.readyState).toBe(WebSocket.OPEN);
});

it.skipIf(process.platform === "win32")(
  "holds the approval lease only while the native window and authenticated renderer are available",
  async () => {
    const { descriptor, native, project, host } = await fixture();
    const peer = await connect(descriptor.channel);
    await peer.ready;
    const root = (await native({ action: "pick", path: project })) as { id: string; path: string };
    await peer.local("agents.configure", { rootId: root.id, providers: ["claude"] });
    await peer.local("approvals.local.configure", {
      rootIds: [root.id],
      away: true,
      waitSeconds: 60,
    });
    const endpoint = readTerminalEndpoint(join(host.runtime.state.directory, "terminal"));
    const hook = () =>
      terminalFetch(endpoint, "hook", "/hook", {
        provider: "claude",
        input: {
          hook_event_name: "PermissionRequest",
          session_id: crypto.randomUUID(),
          cwd: root.path,
          tool_name: "Bash",
          tool_input: { command: "printf synthetic" },
        },
      }).then((response) => response.json());
    expect(await hook()).toEqual({ fallback: true });
    await native({ action: "visible", active: true });
    const hidden = hook();
    await expect
      .poll(async () => {
        const projection = (await peer.local("approvals.local.list")) as ObservedProjection;
        return projection.requests.filter((request) => request.status === "pending").length;
      })
      .toBe(1);
    expect(await native({ action: "notifications" })).toMatchObject({
      scope: "local",
      revision: expect.any(Number),
      bindingId: expect.any(String),
    });
    await native({ action: "visible", active: false });
    expect(await hidden).toEqual({ fallback: true });
    await native({ action: "visible", active: true });
    const disconnected = hook();
    await expect
      .poll(async () => {
        const projection = (await peer.local("approvals.local.list")) as ObservedProjection;
        return projection.requests.filter((request) => request.status === "pending").length;
      })
      .toBe(1);
    peer.socket.close();
    expect(await disconnected).toEqual({ fallback: true });
    const reconnected = await connect((await native({ action: "channel" })) as DesktopChannel);
    await reconnected.ready;
    const released = hook();
    await expect
      .poll(async () => {
        const projection = (await reconnected.local("approvals.local.list")) as ObservedProjection;
        return projection.requests.filter((request) => request.status === "pending").length;
      })
      .toBe(1);
    await native({ action: "release" });
    expect(await released).toEqual({ fallback: true });
  },
);

it("delivers the maximum supported text file even when JSON escaping exceeds one MiB", async () => {
  const { descriptor, project, native } = await fixture();
  const root = (await native({ action: "pick", path: project })) as { id: string };
  const text = '"\n'.repeat(512 * 1024);
  writeFileSync(join(project, "large.txt"), text);
  const peer = await connect(descriptor.channel);
  await peer.ready;
  expect(await peer.local("files.read", { rootId: root.id, path: "large.txt" })).toMatchObject({
    text,
  });
  expect(await peer.local("roots.list")).toMatchObject([{ id: root.id }]);
});

it("checks the exact Origin/Host and first-frame protocol, rejects native capabilities, and consumes a ticket once", async () => {
  const { descriptor, native } = await fixture();
  for (const options of [
    { origin: "https://evil.test" },
    { origin: "null" },
    { origin: "" },
    { capability: descriptor.nativeCapability },
    { protocol: 2 },
  ]) {
    const peer = await connect(descriptor.channel, options);
    await peer.ended;
    expect(peer.packets).toEqual([]);
  }
  const url = new URL(descriptor.channel.url);
  const foreignHost = await fetch(`http://127.0.0.1:${url.port}/desktop`, {
    headers: { host: "evil.test", origin: pageOrigin },
    proxy: false,
  });
  expect(foreignHost.status).toBe(403);
  const peer = await connect(descriptor.channel);
  await peer.ready;
  const repeated = await connect(descriptor.channel);
  await repeated.ended;
  const replacement = await connect((await native({ action: "channel" })) as DesktopChannel);
  await replacement.ready;
  await peer.ended;
  expect(await replacement.local("roots.list")).toEqual([]);
});

it("requires an exact stream ACK and disconnects a renderer whose bounded event credit overflows", async () => {
  const { host, descriptor, native } = await fixture();
  const peer = await connect(descriptor.channel, { ack: false });
  await peer.ready;
  await expect.poll(() => peer.packets.some((packet) => packet.type === "event")).toBe(true);
  const event = peer.packets.find((packet) => packet.type === "event")!;
  peer.socket.send(
    JSON.stringify({ type: "ack", streamId: crypto.randomUUID(), sequence: event.sequence }),
  );
  await peer.ended;
  const blocked = await connect((await native({ action: "channel" })) as DesktopChannel, {
    ack: false,
  });
  await blocked.ready;
  for (let index = 0; index < 1025; index++)
    host.emit({ version: 1, event: "agent.changed", data: {} });
  await blocked.ended;
});

it("sends events within the renderer's credit without waiting for each acknowledgement", async () => {
  const { host, descriptor } = await fixture();
  const peer = await connect(descriptor.channel, { ack: false });
  await peer.ready;
  const events = () => peer.packets.filter((packet) => packet.type === "event");
  await expect.poll(() => events().length).toBe(1);
  for (let index = 0; index < 50; index++)
    host.emit({ version: 1, event: "agent.changed", data: {} });
  // Nothing has been acknowledged, yet the whole burst is already on the wire in order.
  await expect.poll(() => events().length).toBe(51);
  expect(events().map((packet) => packet.sequence)).toEqual(
    Array.from({ length: 51 }, (_, index) => index + 1),
  );
  // One acknowledgement covers everything up to its sequence and keeps the channel open.
  peer.socket.send(JSON.stringify({ type: "ack", streamId: events()[0]!.streamId, sequence: 51 }));
  host.emit({ version: 1, event: "agent.changed", data: {} });
  await expect.poll(() => events().length).toBe(52);
  expect(await peer.local("roots.list")).toEqual([]);
  // An acknowledgement for an event that was never sent is a protocol violation.
  peer.socket.send(JSON.stringify({ type: "ack", streamId: events()[0]!.streamId, sequence: 999 }));
  await peer.ended;
});

it("reports a failed native operation as data and keeps the capability usable", async () => {
  const { descriptor, native } = await fixture();
  const response = await localFetch(descriptor.nativeAddress, "/desktop/native", {
    method: "POST",
    headers: {
      authorization: `Bearer ${descriptor.nativeCapability}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ action: "pick", path: join(tmpdir(), crypto.randomUUID()) }),
  });
  expect(response.status).toBe(200);
  const envelope = (await response.json()) as { result?: unknown; error?: { code: string } };
  expect(envelope.result).toBeUndefined();
  expect(envelope.error?.code).toMatch(/^[A-Z][A-Z0-9_]*$/);
  expect(await native({ action: "visible", active: true })).toBe(true);
});

it("closes peers that never authenticate or acknowledge an event by the deadline", async () => {
  const { descriptor } = await fixture();
  const anonymous = new WebSocket(descriptor.channel.url, { headers: { origin: pageOrigin } });
  cleanups.push(() => anonymous.close());
  const unauthenticatedClosed = new Promise<void>((resolve) =>
    anonymous.addEventListener("close", () => resolve()),
  );
  const stalled = await connect(descriptor.channel, { ack: false });
  await stalled.ready;
  await Promise.all([unauthenticatedClosed, stalled.ended]);
  expect(stalled.packets.filter((packet) => packet.type === "event")).toHaveLength(1);
});

it("bounds pending renderer HTTP requests and cancels them when the connection is closed", async () => {
  const responses: ((value: Response) => void)[] = [];
  const api = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: () => new Promise<Response>((resolve) => responses.push(resolve)),
  });
  cleanups.push(async () => {
    for (const resolve of responses) resolve(Response.json(null));
    await api.stop(true);
  });
  const { bootstrap } = await fixture();
  const { channel } = await bootstrap({ apiUrl: `http://127.0.0.1:${api.port}` });
  const peer = await connect(channel);
  await peer.ready;
  const params = { path: "/api/auth/get-session", method: "GET", headers: {} };
  const pending = [peer.request("api_fetch", params).catch(() => {})];
  await expect.poll(() => responses.length).toBe(1);
  for (let index = 0; index < 64; index++)
    pending.push(peer.request("api_fetch", params).catch(() => {}));
  await expect.poll(() => peer.socket.readyState).toBe(WebSocket.CLOSED);
  await Promise.all(pending);
  expect(responses.length).toBeLessThanOrEqual(64);
});

it("uses a finite stdin bootstrap without returning the daemon administrative credential", async () => {
  const { dataDir, host } = await fixture();
  const child = Bun.spawn(
    [
      process.execPath,
      join(import.meta.dirname, "../../../../../src/main.ts"),
      "daemon",
      "desktop",
      "--data-dir",
      dataDir,
      "--json",
    ],
    {
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
    },
  );
  cleanups.push(async () => {
    child.kill();
    await child.exited;
  });
  await child.stdin.write(
    JSON.stringify({
      action: "bootstrap",
      protocol: 1,
      apiUrl: "https://api.example.test",
      pageOrigin,
    }),
  );
  await child.stdin.end();
  const [output, diagnostics, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  expect(code).toBe(0);
  const diagnosticLines = diagnostics
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  expect(diagnosticLines).toMatchObject([{ operation: "cli.completed", outcome: "success" }]);
  expect(output).not.toContain(host.endpoint.token);
  expect(diagnostics).not.toContain(host.endpoint.token);
  expect(JSON.parse(output)).toMatchObject({
    channel: { protocol: 1 },
    features: { localTerminalApprovals: expect.any(Boolean) },
  });
});

it("revokes a different persisted origin even if the previous native binding was released", async () => {
  const { host, native, bootstrap } = await fixture();
  await native({ action: "release" });
  const file = join(host.runtime.state.directory, "host-session.json");
  writeFileSync(
    file,
    JSON.stringify({ accountId: "previous-account", apiUrl: "https://previous.example.test" }),
  );
  await bootstrap({ apiUrl: "https://different.example.test" });
  expect(JSON.parse(readFileSync(file, "utf8"))).toEqual({
    accountId: null,
    apiUrl: "https://different.example.test",
  });
});

it("cancels page-owned tools on disconnect and reconnects to the same daemon", async () => {
  const { descriptor, project, native } = await fixture();
  const peer = await connect(descriptor.channel);
  await peer.ready;
  const id = crypto.randomUUID();
  const started = join(project, "started");
  const pending = peer
    .local("tools.run", {
      id,
      cwd: project,
      executable: process.execPath,
      args: [
        "-e",
        `require('node:fs').writeFileSync(${JSON.stringify(started)},String(process.pid));setInterval(() => {},1000)`,
      ],
      timeoutMs: 30_000,
    })
    .catch(() => {});
  await expect.poll(() => existsSync(started)).toBe(true);
  const pid = Number(readFileSync(started, "utf8"));
  peer.socket.close();
  await peer.ended;
  await pending;
  await expect
    .poll(() => {
      try {
        process.kill(pid, 0);
        return true;
      } catch {
        return false;
      }
    })
    .toBe(false);
  const next = await connect((await native({ action: "channel" })) as DesktopChannel);
  await next.ready;
  expect(await next.local("tools.cancel", { id })).toEqual({ cancelled: false });
});

it.skipIf(process.platform === "win32")(
  "preserves an accepted durable Agent task across renderer replacement and native release",
  async () => {
    const { descriptor, project, host, native } = await fixture(true);
    const root = (await native({ action: "pick", path: project })) as { id: string };
    const peer = await connect(descriptor.channel);
    await peer.ready;
    await peer.local("agents.configure", { rootId: root.id, providers: ["codex"] });
    const accountId = "device:local-workspace:v1";
    const device = (await peer.local("agents.local.device", { accountId })) as { id: string };
    const input = {
      id: crypto.randomUUID(),
      deviceId: device.id,
      projectId: root.id,
      provider: "codex",
      mode: "run",
      prompt: "Synthetic gateway task",
    };
    expect(
      await peer.local("agents.local.execute", {
        accountId,
        id: input.id,
        request: { method: "tasks.create", input },
      }),
    ).toMatchObject({ ok: true, value: { status: "running" } });
    await expect.poll(() => existsSync(join(project, "delivered"))).toBe(true);
    peer.socket.close();
    await peer.ended;
    const replacement = await connect((await native({ action: "channel" })) as DesktopChannel);
    await replacement.ready;
    expect(await replacement.local("agents.local.list", { accountId })).toMatchObject([
      { id: input.id, status: "running" },
    ]);
    await native({ action: "release" });
    await replacement.ended;
    writeFileSync(join(project, "complete"), "");
    await expect
      .poll(async () => await host.runtime.request("agents.local.list", { accountId }))
      .toMatchObject([{ id: input.id, status: "succeeded" }]);
  },
);

it("does not create a replacement vault key when another origin still has encrypted sessions", async () => {
  const { host } = await fixture();
  const { sessionRecordStore } =
    await import("../../../../../src/runtime/daemon/desktop/sessions.ts");
  const records = sessionRecordStore(host.runtime.state.db, "https://saved.example.test");
  records.write(Buffer.alloc(40, 3));
  const response = await daemonFetch(host.endpoint, "/desktop", {
    action: "prepare",
    apiUrl: "https://fresh.example.test",
  });
  expect(await response.json()).toMatchObject({
    result: { createKey: false, profileDirectory: host.runtime.state.directory },
  });
  expect(records.read()?.encrypted).toEqual(Buffer.alloc(40, 3));
});
