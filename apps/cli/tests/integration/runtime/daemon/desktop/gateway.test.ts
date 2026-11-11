import { afterEach, expect, it, vi } from "vite-plus/test";
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
import { startDaemon } from "../../../../helpers/enrolled.js";
import { connectDesktop, desktopGateway, pageOrigin } from "../../../../helpers/desktop-channel.js";
import { startDaemon as startUnenrolledDaemon } from "../../../../../src/runtime/daemon/server.js";
import { daemonFetch } from "../../../../../src/runtime/daemon/endpoint.js";
import { localFetch } from "../../../../../src/runtime/local-http.js";
import { readTerminalEndpoint, terminalFetch } from "../../../../../src/runtime/terminal/host.js";
import type { ObservedProjection } from "@raypx/contracts/terminal";

import { AwakeClock } from "../../../../../src/runtime/daemon/awake-clock.js";
import { HerdrTerminalHost } from "../../../../../src/runtime/process/herdr.js";

const cleanups: (() => unknown)[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  try {
    for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
  } finally {
    vi.useRealTimers();
  }
});

async function fixture(agent = false, enrolled = true, initial: Record<string, unknown> = {}) {
  const dataDir = mkdtempSync(join(tmpdir(), "raypx-desktop-gateway-"));
  cleanups.push(() => rmSync(dataDir, { recursive: true, force: true }));
  const project = join(dataDir, "project"),
    bin = join(dataDir, "bin");
  mkdirSync(project);
  mkdirSync(bin);
  if (agent) {
    cpSync(join(import.meta.dirname, "../../../../fixtures/agents"), bin, { recursive: true });
    writeFileSync(join(bin, "codex"), `#!${process.execPath}\nimport "./codex-interactive.js";`, {
      mode: 0o700,
    });
  }
  const start = enrolled ? startDaemon : startUnenrolledDaemon;
  const host = await start({
    dataDir,
    ...(agent ? { agentExecutables: { codex: join(bin, "codex") } } : {}),
  });
  cleanups.push(() => host.close());
  const gateway = desktopGateway(host.endpoint);
  const descriptor = await gateway.bootstrap(initial);
  return {
    dataDir,
    project,
    host,
    descriptor,
    bootstrap: gateway.bootstrap,
    native: (action: Record<string, unknown>) => gateway.native(descriptor, action),
  };
}

const connect = connectDesktop.bind(undefined, cleanups);

async function withFakeTimeouts(run: () => Promise<void>) {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  try {
    await run();
  } finally {
    vi.useRealTimers();
  }
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
  expect(await native({ action: "quit_tasks" })).toEqual({ count: 0 });
  for (const method of ["quit_tasks", "stop_quit_tasks"])
    await expect(peer.request(method, {})).rejects.toMatchObject({ code: "METHOD_NOT_PERMITTED" });
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
  await withFakeTimeouts(async () => {
    const anonymous = new WebSocket(descriptor.channel.url, { headers: { origin: pageOrigin } });
    cleanups.push(() => anonymous.close());
    const anonymousOpened = new Promise<void>((resolve) =>
      anonymous.addEventListener("open", () => resolve(), { once: true }),
    );
    const anonymousClosed = new Promise<void>((resolve) =>
      anonymous.addEventListener("close", () => resolve(), { once: true }),
    );
    const stalled = await connect(descriptor.channel, { ack: false });
    await Promise.all([anonymousOpened, stalled.ready]);

    await vi.advanceTimersByTimeAsync(4_999);
    expect(anonymous.readyState).toBe(WebSocket.OPEN);
    await vi.advanceTimersByTimeAsync(1);
    await anonymousClosed;

    await vi.advanceTimersByTimeAsync(4_999);
    expect(stalled.socket.readyState).toBe(WebSocket.OPEN);
    await vi.advanceTimersByTimeAsync(1);
    await stalled.ended;
    expect(stalled.packets.filter((packet) => packet.type === "event")).toHaveLength(1);
  });
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
      ownerId: "d".repeat(64),
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

it("preserves accepted tools on disconnect and reconnects to the same daemon", async () => {
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
    .toBe(true);
  const next = await connect((await native({ action: "channel" })) as DesktopChannel);
  await next.ready;
  expect(await next.local("tools.cancel", { id })).toEqual({ cancelled: true });
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
    await import("../../../../../src/runtime/daemon/desktop/sessions.js");
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

function alive(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

it("keeps the active channel on a failed session reset and reboots cleanly after a successful reset", async () => {
  const f = await fixture();
  const { sql } = await import("drizzle-orm");
  const { sessionRecordStore } =
    await import("../../../../../src/runtime/daemon/desktop/sessions.js");
  const records = sessionRecordStore(f.host.runtime.state.db, "https://saved.example.test");
  records.write(Buffer.alloc(28, 3));
  await f.native({ action: "pick", path: f.project });
  const peer = await connect(f.descriptor.channel);
  await peer.ready;
  const roots = await peer.local("roots.list");
  f.host.runtime.state.db.run(
    sql`CREATE TRIGGER reject_reset BEFORE DELETE ON desktop_sessions BEGIN SELECT RAISE(ABORT, 'synthetic failure'); END`,
  );
  const reset = () =>
    daemonFetch(f.host.endpoint, "/desktop", {
      action: "reset_sessions",
      key: Buffer.alloc(32, 8).toString("base64"),
    });
  expect(await (await reset()).json()).toHaveProperty("error");
  expect(records.read()).toBeDefined();
  expect(await peer.local("roots.list")).toEqual(roots);
  f.host.runtime.state.db.run(sql`DROP TRIGGER reject_reset`);
  expect(await (await reset()).json()).toMatchObject({ result: { reset: true } });
  await peer.ended;
  expect(records.hasRows()).toBe(false);
  const next = await f.bootstrap({ key: Buffer.alloc(32, 8).toString("base64") });
  const recovered = await connect(next.channel);
  await recovered.ready;
  expect(await recovered.local("roots.list")).toEqual(roots);
});

async function verifyForeignExecutionIsolation(
  channel: DesktopChannel,
  host: Awaited<ReturnType<typeof fixture>>["host"],
  id: string,
) {
  const other = await connect(channel);
  await other.ready;
  expect(await other.request("execution_list", {})).toEqual([]);
  await expect(other.local("tools.cancel", { id })).rejects.toThrow("EXECUTION_NOT_FOUND");
  await expect(other.request("execution_result", { id })).rejects.toThrow("EXECUTION_NOT_FOUND");
  host.emit({ version: 1, event: "terminal.output", data: { id, data: "eA==" } });
  await other.local("roots.list");
  expect(other.packets.some((packet) => packet.event?.data.id === id)).toBe(false);
}

async function verifyRestoredTerminal(
  peer: Awaited<ReturnType<typeof connect>>,
  id: string,
  controlled: string,
) {
  expect(await peer.request("terminal_restore", { id })).toEqual({ accepted: true });
  await peer.local("terminal.input", {
    id,
    data: Buffer.from("after-reconnect\n").toString("base64"),
  });
  await expect.poll(() => existsSync(controlled)).toBe(true);
}

for (const kind of ["tool", "terminal"] as const) {
  it
    .skipIf(
      kind === "terminal" && (!process.env.RAYPX_HERDR_BINARY || !process.env.RAYPX_CLI_BINARY),
    )
    .each([
      "disconnect",
      "overflow",
      "ack_timeout",
      "expiry",
      "bootstrap",
      "origin",
      "owner",
    ] as const)(
    `retains accepted ${kind}s through %s, fences their scope and releases them explicitly`,
    async (failure) => {
      if (failure === "expiry") vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
      const f = await fixture();
      if (kind === "terminal") {
        const terminalHost = new HerdrTerminalHost(
          process.env.RAYPX_HERDR_BINARY!,
          f.host.emit,
          () => process.env,
          [process.env.RAYPX_CLI_BINARY!],
        );
        cleanups.push(() => terminalHost.close());
        const cancel = f.host.runtime.processes.cancel.bind(f.host.runtime.processes);
        vi.spyOn(f.host.runtime.processes, "terminal").mockImplementation((input, cols, rows, id) =>
          terminalHost.open(input as Parameters<HerdrTerminalHost["open"]>[0], cols, rows, id),
        );
        vi.spyOn(f.host.runtime.processes, "restore").mockImplementation((id) =>
          terminalHost.restore(id),
        );
        vi.spyOn(f.host.runtime.processes, "input").mockImplementation((id, data) =>
          terminalHost.input(id, data),
        );
        vi.spyOn(f.host.runtime.processes, "cancel").mockImplementation((id) =>
          terminalHost.has(id) ? terminalHost.cancel(id) : cancel(id),
        );
      }
      const options = { ack: true };
      const peer = await connect(f.descriptor.channel, options);
      await peer.ready;
      let id = crypto.randomUUID() as string;
      const started = join(f.project, "scope-started"),
        controlled = join(f.project, "scope-controlled");
      const command = {
        cwd: f.project,
        executable: process.execPath,
        args: [
          "-e",
          `const fs=require('node:fs');fs.writeFileSync(${JSON.stringify(started)},String(process.pid));process.stdin.on('data',()=>fs.writeFileSync(${JSON.stringify(controlled)},'controlled'));setInterval(()=>{},1000)`,
        ],
        timeoutMs: 60_000,
      };
      let waiting: Promise<unknown>;
      if (kind === "terminal") {
        const result = (await peer.local("terminal.open", { ...command, cols: 80, rows: 24 })) as {
          id: string;
        };
        id = result.id;
        waiting = Promise.resolve();
      } else {
        waiting = peer.local("tools.run", { ...command, id }).catch(() => {});
      }
      await expect.poll(() => existsSync(started)).toBe(true);
      const pid = Number(readFileSync(started, "utf8"));
      if (failure === "disconnect") peer.socket.close();
      if (failure === "overflow") {
        options.ack = false;
        for (let index = 0; index < 1025; index++)
          f.host.emit({ version: 1, event: "agent.changed", data: {} });
      }
      if (failure === "ack_timeout") {
        const event = { version: 1, event: "agent.changed", data: {} } as const;
        const received = new Promise<void>((resolve) => {
          function onMessage() {
            if (peer.packets.at(-1)?.event?.event !== event.event) return;
            peer.socket.removeEventListener("message", onMessage);
            resolve();
          }
          peer.socket.addEventListener("message", onMessage);
        });
        f.host.emit(event);
        await received;
        // A request sent after the event arrives also waits for the preceding ACK.
        await peer.local("roots.list");
        await withFakeTimeouts(async () => {
          options.ack = false;
          f.host.emit(event);
          await vi.advanceTimersByTimeAsync(10_000);
          await peer.ended;
        });
      }
      const clock =
        failure === "expiry"
          ? vi.spyOn(AwakeClock.prototype, "now").mockReturnValue(Number.MAX_SAFE_INTEGER)
          : undefined;
      if (clock) await vi.advanceTimersByTimeAsync(5_000);
      if (failure === "bootstrap") await f.bootstrap();
      if (failure === "origin" || failure === "owner") {
        const foreign = await f.bootstrap(
          failure === "origin"
            ? { apiUrl: "https://other.example.test" }
            : { ownerId: "e".repeat(64) },
        );
        await verifyForeignExecutionIsolation(foreign.channel, f.host, id);
      }
      await peer.ended;
      await waiting;
      clock?.mockRestore();
      expect(alive(pid)).toBe(true);
      const replacement = await f.bootstrap();
      const next = await connect(replacement.channel);
      await next.ready;
      expect(await next.request("execution_list", {})).toContainEqual({
        id,
        kind,
        cwd: f.project,
        status: "running",
      });
      if (kind === "terminal") await verifyRestoredTerminal(next, id, controlled);
      const response = await daemonFetch(f.host.endpoint, "/desktop", {
        action: "release",
        ownerId: "d".repeat(64),
      });
      expect(await response.json()).toMatchObject({ result: { released: true } });
      await expect.poll(() => alive(pid)).toBe(false);
    },
  );
}

it("keeps the working binding after runtime preparation fails and serializes replacements", async () => {
  const f = await fixture();
  const peer = await connect(f.descriptor.channel);
  await peer.ready;
  const request = f.host.runtime.request.bind(f.host.runtime);
  const spy = vi
    .spyOn(f.host.runtime, "request")
    .mockImplementation(async (method, params, signal) => {
      if (method === "runtime.info") throw new Error("synthetic runtime preparation failure");
      return request(method, params, signal);
    });
  const failed = await daemonFetch(f.host.endpoint, "/desktop", {
    action: "bootstrap",
    protocol: 1,
    ownerId: "d".repeat(64),
    apiUrl: "https://api.example.test",
    pageOrigin,
  });
  expect(await failed.json()).toHaveProperty("error");
  expect(await peer.local("roots.list")).toEqual([]);
  expect(await f.native({ action: "notifications" })).toHaveProperty("bindingId");
  spy.mockRestore();
  const [first, last] = await Promise.all([f.bootstrap(), f.bootstrap()]);
  const stale = await localFetch(first.nativeAddress, "/desktop/native", {
    method: "POST",
    headers: { authorization: `Bearer ${first.nativeCapability}` },
    body: JSON.stringify({ action: "notifications" }),
  });
  expect(stale.status).toBe(403);
  const current = await connect(last.channel);
  await current.ready;
  expect(await current.local("roots.list")).toEqual([]);
});

it("repairs a corrupt selection without blocking local work or restoring cloud authority", async () => {
  const f = await fixture();
  writeFileSync(join(f.host.runtime.state.directory, "host-session.json"), "{corrupt");
  const next = await f.bootstrap();
  const peer = await connect(next.channel);
  await peer.ready;
  expect(await peer.local("roots.list")).toEqual([]);
  expect(
    JSON.parse(readFileSync(join(f.host.runtime.state.directory, "host-session.json"), "utf8")),
  ).toEqual({ accountId: null, apiUrl: "https://api.example.test" });
});

it("selects more than eight historical servers without restarting the daemon", async () => {
  const f = await fixture();
  for (let index = 0; index < 12; index++) {
    const descriptor = await f.bootstrap({ apiUrl: `https://server-${index}.example.test` });
    const peer = await connect(descriptor.channel);
    await peer.ready;
    expect(await peer.local("roots.list")).toEqual([]);
  }
});

it("recovers a cached memory session when a later bootstrap supplies the key", async () => {
  const api = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: () =>
      new Response("null", {
        headers: {
          "set-cookie": "better-auth.session_token=memory-login; HttpOnly; Path=/; Max-Age=3600",
        },
      }),
  });
  cleanups.push(() => api.stop(true));
  const apiUrl = `http://127.0.0.1:${api.port}`;
  const f = await fixture(false, true, { apiUrl, key: undefined });
  const peer = await connect(f.descriptor.channel);
  await peer.ready;
  await peer.request("api_fetch", { path: "/api/auth/get-session", method: "GET", headers: {} });
  const { sessionRecordStore, encryptedSessionStore } =
    await import("../../../../../src/runtime/daemon/desktop/sessions.js");
  const records = sessionRecordStore(f.host.runtime.state.db, apiUrl);
  expect(records.read()).toBeUndefined();
  await f.bootstrap({ apiUrl });
  const store = encryptedSessionStore(
    records,
    f.host.runtime.state.directory,
    apiUrl,
    Buffer.alloc(32, 4),
  );
  expect(new TextDecoder().decode(store.load())).toContain("memory-login");
});

it("encodes event content once and accounts for UTF-8 and envelope bytes", async () => {
  const f = await fixture();
  const peer = await connect(f.descriptor.channel);
  await peer.ready;
  let calls = 0;
  const value = {
    toJSON() {
      calls++;
      return '中文"\\';
    },
  };
  f.host.emit({ version: 1, event: "agent.changed", data: { value } });
  await expect
    .poll(() => peer.packets.some((packet) => packet.event?.data.value === '中文"\\'))
    .toBe(true);
  expect(calls).toBe(1);
  f.host.emit({
    version: 1,
    event: "agent.changed",
    data: { text: "中".repeat(Math.ceil((8 * 1024 * 1024) / 3)) },
  });
  await peer.ended;
});
