import { expect, test, vi } from "vite-plus/test";
import { runConsumers, type ConsumerOperations } from "../lib/consumer/run.ts";
import type { ConsumerFixture } from "../lib/consumer/fixture.ts";

function operations() {
  const calls: string[] = [];
  const cleanup = vi.fn<ConsumerFixture["cleanup"]>(async () => {
    calls.push("cleanup");
  });
  const fixtures = new Map<string, ConsumerFixture>();
  const checks: ConsumerOperations = {
    async createFixture(kind) {
      calls.push(`create:${kind}`);
      const fixture = { directory: kind, packages: new Map(), cleanup };
      fixtures.set(kind, fixture);
      return fixture;
    },
    async checkTypes(fixture) {
      calls.push(`types:${fixture.directory}`);
    },
    async checkRuntime(fixture, core) {
      calls.push(`runtime:${fixture.directory}:${String(core)}`);
    },
    async buildCoreBrowser(fixture) {
      calls.push(`core-browser:${fixture.directory}`);
    },
    async buildBrowser(fixture) {
      calls.push(`browser:${fixture.directory}`);
    },
  };
  return { calls, checks, cleanup, fixtures };
}

test("prepared consumers reuse every existing acceptance operation without running preparation", async () => {
  const deps = operations();
  await runConsumers("all", {}, deps.checks);
  expect(deps.calls).toEqual([
    "create:core",
    "types:core",
    "runtime:core:true",
    "core-browser:core",
    "cleanup",
    "create:server",
    "types:server",
    "runtime:server:false",
    "cleanup",
    "create:browser",
    "types:browser",
    "browser:browser",
    "cleanup",
  ]);
  expect(deps.cleanup).toHaveBeenCalledTimes(3);
});

test("consumer failure disposes its owned fixture and never starts the next fixture", async () => {
  const deps = operations();
  deps.checks.checkRuntime = async () => {
    throw new Error("runtime failed");
  };
  await expect(runConsumers("all", {}, deps.checks)).rejects.toThrow("runtime failed");
  expect([...deps.fixtures.keys()]).toEqual(["core"]);
  expect(deps.cleanup).toHaveBeenCalledOnce();
  expect(deps.calls).toEqual(["create:core", "types:core", "cleanup"]);
});

test("consumer cancellation after a check cleans up before preventing later operations", async () => {
  const deps = operations();
  const controller = new AbortController();
  deps.checks.checkTypes = async () => {
    controller.abort();
  };
  await expect(
    runConsumers("all", { signal: controller.signal }, deps.checks),
  ).rejects.toMatchObject({ name: "AbortError" });
  expect(deps.calls).toEqual(["create:core", "cleanup"]);
  expect(deps.cleanup).toHaveBeenCalledOnce();
  expect([...deps.fixtures.keys()]).toEqual(["core"]);
});

test("a pre-cancelled consumer creates no fixture", async () => {
  const deps = operations();
  await expect(
    runConsumers("server", { signal: AbortSignal.abort() }, deps.checks),
  ).rejects.toMatchObject({ name: "AbortError" });
  expect(deps.calls).toEqual([]);
});
