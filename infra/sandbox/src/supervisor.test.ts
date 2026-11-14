import * as runner from "vitest";
const { expect, it } = runner;
import { computerConformance } from "@raypx/providers/testing/computer";
import { createDockerComputerProvider } from "@raypx/providers/computer/docker";
import { createSupervisor } from "./supervisor.js";
import { sandboxConfig } from "./config.js";
import { Engine } from "./engine.js";
import { supervisorHandler } from "./http.js";
import { fakeEngine, memoryStore } from "../tests/fake-engine.js";
const token = "sandbox-dedicated-fixture-token-32-characters";
function fixture(overrides: Record<string, string> = {}) {
  const config = sandboxConfig({
    SANDBOX_SUPERVISOR_TOKEN: token,
    SANDBOX_COMPUTER_IMAGE: `fixture@sha256:${"a".repeat(64)}`,
    ...overrides,
  });
  const fake = fakeEngine();
  const store = memoryStore();
  const engine = new Engine(fake.request);
  const provider = createSupervisor(config, engine, store);
  const handler = supervisorHandler(provider, token);
  const client = createDockerComputerProvider({
    url: "http://127.0.0.1:4020",
    token,
    fetch: handler,
  });
  return { provider, client, config, fake, handler, store, engine };
}
computerConformance("HTTP provider / supervisor / fake Engine", () => fixture().client, runner);
computerConformance(
  "graphical HTTP provider / supervisor / fake Engine",
  () => fixture({ SANDBOX_GRAPHICAL: "true" }).client,
  runner,
);
it("keeps graphical framebuffer and input off every container network interface", async () => {
  const f = fixture({ SANDBOX_GRAPHICAL: "true" });
  const ref = { id: crypto.randomUUID(), generation: 1 };
  await f.client.provision(ref);
  await f.client.startScreen!(ref);
  const create = f.fake.calls.find((call) => call.path === "/containers/create")!.body;
  expect(create).not.toHaveProperty("ExposedPorts");
  expect(create).not.toHaveProperty("HostConfig.PortBindings");
  expect(await f.client.screen!(ref)).toMatchObject({ available: true, running: true });
  const controller = new AbortController();
  const stream = f.client.streamScreen!(ref, { signal: controller.signal })[Symbol.asyncIterator]();
  expect((await stream.next()).done).toBe(false);
  controller.abort();
  await stream.return?.();
  await f.client.stop(ref);
});
it("applies ceilings, a non-root user, only the owned home and a deterministic private bridge", async () => {
  const f = fixture();
  await f.provider.provision({ id: crypto.randomUUID(), generation: 1 });
  const create = f.fake.calls.find((c) => c.path === "/containers/create")!.body;
  expect(create).toMatchObject({
    User: "1000:1000",
    HostConfig: {
      Memory: 536870912,
      MemorySwap: 536870912,
      NanoCpus: 1000000000,
      PidsLimit: 128,
      NetworkMode: f.config.network,
      Dns: [f.config.dnsResolver],
      Privileged: false,
      ReadonlyRootfs: true,
      CapDrop: ["ALL"],
      Mounts: [
        { Type: "volume", Target: "/home/computer" },
        { Type: "volume", Target: "/run/raypx" },
      ],
      LogConfig: { Type: "none" },
    },
  });
  expect(JSON.stringify(create)).not.toMatch(/docker\.sock|NetworkMode":"host|Binds/);
  expect(f.fake.calls.find((c) => c.path === "/networks/create")?.body).toMatchObject({
    Options: { "com.docker.network.bridge.name": f.config.bridge },
  });
  expect((create as { HostConfig: { Mounts: unknown[] } }).HostConfig.Mounts).toHaveLength(2);
});
it("sets the configured DNS resolver as the only Engine upstream", async () => {
  const f = fixture({ SANDBOX_DNS_RESOLVER: "9.9.9.9" });
  await f.provider.provision({ id: crypto.randomUUID(), generation: 1 });
  expect(f.fake.calls.find((call) => call.path === "/containers/create")?.body).toMatchObject({
    HostConfig: { Dns: ["9.9.9.9"] },
  });
});
it("reports restricted egress only with both explicit assertions", async () => {
  for (const [enabled, applied, expected] of [
    ["true", "true", "restricted"],
    ["true", "false", "unrestricted"],
    ["false", "true", "unrestricted"],
  ]) {
    expect(
      (
        await fixture({
          SANDBOX_RESTRICTED_EGRESS: enabled!,
          SANDBOX_HOST_RULES_APPLIED: applied!,
        }).provider.describe()
      ).egress,
    ).toBe(expected);
  }
});
it("authenticates before parsing and returns safe errors", async () => {
  const f = fixture();
  expect((await f.handler(new Request("http://private/description"))).status).toBe(401);
  const response = await f.handler(
    new Request("http://private/computers/invalid/create", {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
      body: "private-invalid-body",
    }),
  );
  expect(await response.json()).toEqual({ code: "INVALID_INPUT" });
  expect(f.fake.calls).toHaveLength(0);
});
it("keeps a last good revision and working home after an Engine restore failure", async () => {
  const f = fixture();
  const ref = { id: crypto.randomUUID(), generation: 1 };
  await f.provider.provision(ref);
  await f.provider.write(ref, "good", "Z29vZA==");
  const good = await f.provider.snapshot(ref);
  const archive = await f.provider.exportHome(ref);
  f.fake.failRestore();
  await expect(f.provider.importHome(ref, archive)).rejects.toMatchObject({
    code: "RESTORE_FAILED",
  });
  expect(await f.provider.get(ref)).toMatchObject({
    homeRevision: good.revision,
    state: "running",
  });
  expect(await f.provider.read(ref, "good", 10)).toEqual({ bytes: "Z29vZA==" });
  // A new service instance over the durable store keeps the fence after replacement failure.
  await expect(f.provider.provision({ ...ref, generation: 2 })).rejects.toMatchObject({
    code: "RESTORE_FAILED",
  });
  const restarted = createSupervisor(f.config, f.engine, f.store);
  await expect(restarted.write(ref, "stale", "")).rejects.toMatchObject({
    code: "STALE_GENERATION",
  });
  expect((await restarted.get({ ...ref, generation: 2 })).homeRevision).toBe(good.revision);
});

function hostingFixture(overrides: Record<string, string> = {}) {
  const f = fixture(overrides);
  let time = 1;
  let result = { bytes: 4096, entries: 1, complete: true };
  let unavailable = false;
  const evidence: object[] = [];
  const provider = createSupervisor(f.config, f.engine, f.store, {
    now: () => time,
    usage: async () => {
      if (unavailable) throw new Error("private-meter-error");
      return result;
    },
    report: (value) => evidence.push(value),
  });
  return {
    ...f,
    provider,
    evidence,
    time: (value: number) => {
      time = value;
    },
    usage: (value: typeof result) => {
      result = value;
    },
    unavailable: () => {
      unavailable = true;
    },
  };
}
it("meters inbox bytes and generated parents before acknowledging delivery", async () => {
  const f = hostingFixture();
  const ref = { id: crypto.randomUUID(), generation: 1 };
  await f.provider.provision(ref, { spaceId: "attachments-space" });
  const path = `inbox/${crypto.randomUUID()}/${crypto.randomUUID()}`;
  f.usage({ bytes: 1024 * 1024, entries: 4, complete: true });
  await f.provider.write(ref, path, Buffer.from("attachment-fixture").toString("base64"));
  expect(await f.store.read(ref.id)).toMatchObject({
    state: "running",
    homeBytes: 1024 * 1024,
    homeEntries: 4,
  });
  expect(await f.provider.read(ref, path, 128)).toEqual({
    bytes: Buffer.from("attachment-fixture").toString("base64"),
  });
});
it.each(["bytes", "entries", "writes"] as const)(
  "stops before acknowledging inbox delivery over its %s budget",
  async (limit) => {
    const f = hostingFixture();
    const ref = { id: crypto.randomUUID(), generation: 1 };
    await f.provider.provision(ref, { spaceId: "attachments-space" });
    if (limit === "bytes") f.usage({ bytes: f.config.homeBytes + 1, entries: 4, complete: true });
    if (limit === "entries")
      f.usage({ bytes: 4096, entries: f.config.homeEntries + 1, complete: true });
    if (limit === "writes") f.fake.setWrittenBytes(f.config.homeBytes + 1);
    await expect(
      f.provider.write(ref, `inbox/${crypto.randomUUID()}/${crypto.randomUUID()}`, "eA=="),
    ).rejects.toMatchObject({ code: "HOME_STORAGE_LIMIT" });
    expect(await f.store.read(ref.id)).toMatchObject({ state: "stopped", stopReason: "storage" });
  },
);
it("serializes per-Space admission and refuses relabeling a retained computer", async () => {
  const f = hostingFixture({ SANDBOX_SPACE_RUNNING: "1" });
  const spaceId = "quota-space";
  const results = await Promise.allSettled(
    [1, 2].map(() => f.provider.provision({ id: crypto.randomUUID(), generation: 1 }, { spaceId })),
  );
  expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
  expect(results.find((result) => result.status === "rejected")).toMatchObject({
    reason: { code: "SPACE_RUNNING_LIMIT" },
  });
  const [row] = await f.store.all();
  await expect(
    f.provider.provision(
      { id: row!.id, generation: row!.generation },
      { spaceId: "another-space" },
    ),
  ).rejects.toMatchObject({ code: "INVALID_INPUT" });
});
it("counts stopped homes against storage and caps deployment running computers", async () => {
  const f = hostingFixture({
    SANDBOX_DEPLOYMENT_RUNNING: "1",
    SANDBOX_SPACE_STORAGE_BYTES: "335544320",
  });
  const a = { id: crypto.randomUUID(), generation: 1 };
  const b = { id: crypto.randomUUID(), generation: 1 };
  await f.provider.provision(a, { spaceId: "space-a" });
  await expect(f.provider.provision(b, { spaceId: "space-b" })).rejects.toMatchObject({
    code: "DEPLOYMENT_RUNNING_LIMIT",
  });
  await f.provider.stop(a);
  await expect(f.provider.provision(b, { spaceId: "space-a" })).rejects.toMatchObject({
    code: "SPACE_STORAGE_LIMIT",
  });
  await f.provider.provision(b, { spaceId: "space-b" });
});
it("stops idle compute after a restart and does not let reads extend its lifetime", async () => {
  const f = hostingFixture({ SANDBOX_IDLE_MS: "1000", SANDBOX_MAX_LIFETIME_MS: "2000" });
  const ref = { id: crypto.randomUUID(), generation: 1 };
  await f.provider.provision(ref);
  f.time(1002);
  await f.provider.get(ref);
  await f.provider.maintain();
  expect(await f.store.read(ref.id)).toMatchObject({ state: "stopped", stopReason: "idle" });
  await f.provider.provision(ref);
  f.time(3003);
  await expect(f.provider.list(ref, ".", 1)).rejects.toMatchObject({ code: "NOT_RUNNING" });
  expect(await f.store.read(ref.id)).toMatchObject({ state: "stopped", stopReason: "lifetime" });
});
it("contains disk overruns and measurement failures, with content-free per-Space evidence", async () => {
  for (const failure of ["storage", "measurement"] as const) {
    const f = hostingFixture();
    const ref = { id: crypto.randomUUID(), generation: 1 };
    await f.provider.provision(ref, { spaceId: "accounted-space" });
    if (failure === "storage")
      f.usage({ bytes: f.config.homeBytes + 1, entries: 2, complete: false });
    else f.unavailable();
    await f.provider.maintain();
    expect(await f.store.read(ref.id)).toMatchObject({ state: "stopped", stopReason: failure });
    expect(f.evidence).toContainEqual(
      expect.objectContaining({
        event: "sandbox.stop",
        spaceId: "accounted-space",
        reason: failure,
      }),
    );
    expect(JSON.stringify(f.evidence)).not.toContain("private-meter-error");
    const stop = f.fake.calls.findIndex((call) => call.path.includes("/stop?t=0"));
    expect(stop).toBeGreaterThan(-1);
  }
});
it("reaps only owned resources left outside the durable inventory after a crash", async () => {
  const f = hostingFixture();
  const ref = { id: crypto.randomUUID(), generation: 1 };
  await f.provider.provision(ref);
  const row = (await f.store.read(ref.id))!;
  await f.store.write({
    ...row,
    container: null,
    volume: null,
    inputVolume: null,
    state: "stopped",
  });
  await f.provider.maintain();
  expect(f.fake.calls).toContainEqual(
    expect.objectContaining({
      method: "DELETE",
      path: `/containers/${row.container}?force=true&v=true`,
    }),
  );
  expect(f.evidence).toContainEqual({ event: "sandbox.orphan", kind: "container" });
});
it("disables unsupported graphical runtimes at startup with an additive availability reason", async () => {
  const f = fixture({ SANDBOX_GRAPHICAL: "true", SANDBOX_RUNTIME: "runsc" });
  f.fake.failScreen();
  await f.provider.initialize();
  expect(await f.client.describe()).toMatchObject({
    screen: false,
    screenUnavailableReason: "GRAPHICAL_RUNTIME_UNAVAILABLE",
  });
  const ref = { id: crypto.randomUUID(), generation: 1 };
  await f.client.provision(ref);
  expect(await f.client.screen!(ref)).toMatchObject({
    available: false,
    reason: "GRAPHICAL_RUNTIME_UNAVAILABLE",
  });
  await expect(f.client.startScreen!(ref)).rejects.toMatchObject({ code: "SCREEN_UNAVAILABLE" });
});
it("contains cumulative writes even when unlinked files leave directory usage small", async () => {
  const f = hostingFixture();
  const ref = { id: crypto.randomUUID(), generation: 1 };
  await f.provider.provision(ref);
  f.fake.setWrittenBytes(f.config.homeBytes + 1);
  await f.provider.maintain();
  expect(await f.store.read(ref.id)).toMatchObject({
    state: "stopped",
    stopReason: "storage",
    homeBytes: 4096,
    writeBytes: f.config.homeBytes + 1,
  });
});
it("contains retained and paused compute before admitting callers after restart", async () => {
  const f = hostingFixture();
  const ref = { id: crypto.randomUUID(), generation: 1 };
  await f.provider.provision(ref);
  const row = (await f.store.read(ref.id))!;
  await f.engine.response(`/containers/${row.container}/pause`, "POST");
  const restarted = createSupervisor(f.config, f.engine, f.store, { report() {} });
  await restarted.initialize();
  expect(await f.store.read(ref.id)).toMatchObject({ state: "stopped", stopReason: "engine" });
  expect(f.fake.calls).toContainEqual(
    expect.objectContaining({ path: `/containers/${row.container}/unpause`, method: "POST" }),
  );
});
it("does not reap a validation control sharing the namespace's cleanup label", async () => {
  const f = hostingFixture();
  const control = await f.engine.json<{ Id: string }>("/containers/create", "POST", {
    Labels: { "raypx.supervisor": f.config.network, "raypx.role": "egress-control" },
  });
  await f.provider.maintain();
  expect(f.fake.calls).not.toContainEqual(
    expect.objectContaining({
      path: `/containers/${control.Id}?force=true&v=true`,
      method: "DELETE",
    }),
  );
});
it("serializes cancellation helpers with paused storage measurement", async () => {
  const f = fixture();
  let block = false;
  let release!: () => void;
  let measuring!: () => void;
  const entered = new Promise<void>((resolve) => {
    measuring = resolve;
  });
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const provider = createSupervisor(f.config, f.engine, f.store, {
    usage: async () => {
      if (block) {
        measuring();
        await gate;
      }
      return { bytes: 4096, entries: 1, complete: true };
    },
    report() {},
  });
  const ref = { id: crypto.randomUUID(), generation: 1 };
  await provider.provision(ref);
  const process = await provider.execute(ref, {
    executable: "sleep",
    argv: ["60"],
    cwd: ".",
    environment: {},
    outputBudget: 16,
  });
  const events: unknown[] = [];
  const drain = (async () => {
    for await (const event of process.events) events.push(event);
  })();
  block = true;
  const maintenance = provider.maintain();
  await entered;
  let cancelled = false;
  const cancellation = process.cancel().then(() => {
    cancelled = true;
  });
  await new Promise((resolve) => setTimeout(resolve, 1));
  expect(cancelled).toBe(false);
  release();
  await maintenance;
  await cancellation;
  await drain;
  expect(events.at(-1)).toMatchObject({ kind: "exit", cancelled: true });
});
it("refuses admission after uncertain cleanup until orphan reconciliation succeeds", async () => {
  const f = hostingFixture();
  const ref = { id: crypto.randomUUID(), generation: 1 };
  await f.provider.provision(ref);
  const archive = await f.provider.exportHome(ref);
  f.fake.failRestore();
  f.fake.failRemovals(true);
  await expect(f.provider.importHome(ref, archive)).rejects.toMatchObject({
    code: "RESTORE_FAILED",
  });
  const next = { id: crypto.randomUUID(), generation: 1 };
  await expect(f.provider.provision(next)).rejects.toMatchObject({ code: "CAPACITY_UNAVAILABLE" });
  f.fake.failRemovals(false);
  await f.provider.maintain();
  await expect(f.provider.provision(next)).resolves.toMatchObject({ state: "running" });
});
it("uses only an owned read-only resolver subpath for gVisor", async () => {
  const f = fixture({ SANDBOX_RUNTIME: "runsc", SANDBOX_DNS_RESOLVER: "9.9.9.9" });
  await f.provider.provision({ id: crypto.randomUUID(), generation: 1 });
  const create = f.fake.calls.find(
    (call) =>
      call.path === "/containers/create" &&
      (call.body as { Labels: Record<string, string> }).Labels["raypx.role"] === "computer",
  )!.body;
  expect(create).toMatchObject({
    HostConfig: {
      Runtime: "runsc",
      Mounts: [
        { Type: "volume", Target: "/home/computer" },
        { Type: "volume", Target: "/run/raypx" },
        {
          Type: "volume",
          Target: "/etc/resolv.conf",
          ReadOnly: true,
          VolumeOptions: { NoCopy: true, Subpath: "resolv.conf" },
        },
      ],
    },
  });
  expect(JSON.stringify(create)).not.toContain('"Type":"bind"');
});
it("reports member screen-start failures as unavailable without poisoning another generation", async () => {
  const f = fixture({ SANDBOX_GRAPHICAL: "true" });
  const ref = { id: crypto.randomUUID(), generation: 1 };
  await f.client.provision(ref);
  f.fake.failScreen();
  await expect(f.client.startScreen!(ref)).rejects.toMatchObject({ code: "SCREEN_UNAVAILABLE" });
  expect(await f.client.screen!(ref)).toMatchObject({
    available: false,
    reason: "GRAPHICAL_RUNTIME_UNAVAILABLE",
  });
  await f.client.provision({ ...ref, generation: 2 });
  expect(await f.client.screen!({ ...ref, generation: 2 })).toMatchObject({ available: true });
});
