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
