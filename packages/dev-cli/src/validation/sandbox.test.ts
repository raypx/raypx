import { describe, expect, it } from "vitest";
import { sandboxBaseDigest, sandboxEnvironment, sandboxPlan } from "./sandbox-plan.js";
import {
  assertSandboxContainer,
  sandboxIsolationProbe,
  type SandboxContainer,
} from "./sandbox-probes.js";
import { cleanupSandbox, executeSandbox, type SandboxRuntime } from "./sandbox.js";

const id = "0123456789abcdef0123456789abcdef";
const plan = sandboxPlan([], {}, id, "1.4.4");

function inspection(computer = "probe", generation = 1): SandboxContainer {
  return {
    Id: `owned-container-${generation}`,
    Config: {
      User: "1000:1000",
      Labels: { "raypx.supervisor": plan.network, "raypx.computer": computer },
    },
    HostConfig: {
      Memory: plan.memory,
      MemorySwap: plan.memory,
      PidsLimit: plan.pids,
      ReadonlyRootfs: true,
      Privileged: false,
      NetworkMode: plan.network,
      CapDrop: ["ALL"],
      SecurityOpt: ["no-new-privileges:true"],
      Binds: null,
    },
    Mounts: [
      { Type: "volume", Destination: "/home/computer" },
      { Type: "volume", Destination: "/run/raypx" },
    ],
    NetworkSettings: { Networks: { [plan.network]: { Gateway: "172.25.0.1" } } },
  };
}

describe("sandbox planning", () => {
  it("selects the requested base repository rather than the first cached digest alias", () => {
    const digest = "a".repeat(64);
    expect(
      sandboxBaseDigest("python:3.13-slim-bookworm", [
        `mirror/python@sha256:${"b".repeat(64)}`,
        `docker.io/library/python@sha256:${digest}`,
      ]),
    ).toBe(digest);
    expect(() => sandboxBaseDigest("oven/bun:1.4.4", [`mirror/bun@sha256:${digest}`])).toThrow(
      "Requested base",
    );
  });
  it("uses one unique namespace for every Engine selector and derives the supervisor bridge", () => {
    expect(plan).toMatchObject({
      socket: "/var/run/docker.sock",
      memory: 268435456,
      pids: 64,
      withEgress: false,
    });
    expect(plan.namespace).toContain(id);
    expect(plan.network).toBe(`${plan.namespace}-computers`);
    expect(plan.bridge).toMatch(/^rpx[a-f0-9]{10}$/);
    expect(sandboxPlan([], {}, "a".repeat(32), "1.4.4").network).not.toBe(plan.network);
    expect(() => sandboxPlan([], {}, "bad", "1.4.4")).toThrow("run ID");
  });
  it("resolves Unix DOCKER_HOST, ignores TCP contexts and allows explicit rootless or Colima sockets", () => {
    expect(sandboxPlan([], { DOCKER_HOST: "unix:///tmp/rootless.sock" }, id, "1.4.4").socket).toBe(
      "/tmp/rootless.sock",
    );
    expect(sandboxPlan([], { DOCKER_HOST: "tcp://operator:2375" }, id, "1.4.4").socket).toBe(
      "/var/run/docker.sock",
    );
    expect(
      sandboxPlan(
        ["--engine-socket", "/Users/test/.colima/default/docker.sock", "--with-egress"],
        { DOCKER_HOST: "unix:///other" },
        id,
        "1.4.4",
      ),
    ).toMatchObject({ socket: "/Users/test/.colima/default/docker.sock", withEgress: true });
    expect(() => sandboxPlan(["--engine-socket", "relative"], {}, id, "1.4.4")).toThrow("absolute");
    expect(() => sandboxPlan(["--unknown"], {}, id, "1.4.4")).toThrow("unknown");
  });
  it("drops inherited operator sandbox settings without changing the source", () => {
    const source = {
      SANDBOX_SUPERVISOR_TOKEN: "operator",
      SANDBOX_NAMESPACE: "production",
      SANDBOX_STATE_DIRECTORY: "/data",
      NODE_ENV: "test",
      RAYPX_TEST_DOCKER: "1",
      PATH: "/bin",
    };
    expect(sandboxEnvironment(source)).toEqual({ PATH: "/bin" });
    expect(source.SANDBOX_NAMESPACE).toBe("production");
  });
  it("rejects weakened isolation settings and bind mounts", () => {
    for (const mutate of [
      (value: SandboxContainer) => {
        value.Config.User = "0";
      },
      (value: SandboxContainer) => {
        value.HostConfig.NetworkMode = "host";
      },
      (value: SandboxContainer) => {
        value.HostConfig.Memory = 0;
      },
      (value: SandboxContainer) => {
        value.HostConfig.PidsLimit = -1;
      },
      (value: SandboxContainer) => {
        value.HostConfig.ReadonlyRootfs = false;
      },
      (value: SandboxContainer) => {
        value.HostConfig.SecurityOpt = [];
      },
      (value: SandboxContainer) => {
        value.HostConfig.CapDrop = [];
      },
      (value: SandboxContainer) => {
        value.Mounts.push({ Type: "bind", Destination: "/docker.sock" });
      },
    ]) {
      const value = inspection();
      mutate(value);
      expect(() => assertSandboxContainer(value, plan)).toThrow("isolation");
    }
    expect(() => assertSandboxContainer(inspection(), plan)).not.toThrow();
  });
});

function fakeRuntime(failure?: string) {
  const calls: string[][] = [];
  const steps: string[] = [];
  let computer = "probe";
  let generation = 1;
  let bytes = "";
  const runtime: SandboxRuntime = {
    platform: "linux",
    rootUser: true,
    hasDocker: () => true,
    async capture(argv) {
      calls.push(argv);
      if (argv[0] !== "docker") return "";
      expect(argv.slice(0, 3)).toEqual(["docker", "--host", `unix://${plan.socket}`]);
      const args = argv.slice(3);
      if (args[0] === "version")
        return JSON.stringify({ Os: "linux", Version: "29.5", Arch: "arm64", ApiVersion: "1.54" });
      if (args[0] === "image" && args[1] === "inspect" && args.includes("--format")) {
        if (args.includes("{{.Id}}")) return `sha256:${"a".repeat(64)}`;
        const repository = args.at(-1)!.split(":")[0];
        return JSON.stringify([`${repository}@sha256:${"b".repeat(64)}`]);
      }
      if (args[0] === "ps") return "owned-container";
      if (args[0] === "container" && args[1] === "inspect")
        return JSON.stringify([inspection(computer, generation)]);
      if (args[0] === "network" && args[1] === "inspect")
        return JSON.stringify([
          {
            Name: plan.network,
            Driver: "bridge",
            Options: { "com.docker.network.bridge.name": plan.bridge },
            Labels: { "raypx.supervisor": plan.network },
          },
        ]);
      if (args[0] === "volume" && args[1] === "inspect")
        return JSON.stringify([{ Labels: { "raypx.supervisor": plan.network } }]);
      if (args[1] === "ls") return `owned-${args[0]}`;
      if (args[0] === "image" && args[1] === "inspect")
        return JSON.stringify([{ Config: { Labels: { "raypx.validation": plan.id } } }]);
      if (args[0] === "exec" && args.includes(sandboxIsolationProbe))
        return JSON.stringify({
          uid: 1000,
          capEff: 0,
          noNewPrivileges: true,
          memory: plan.memory,
          pids: plan.pids,
        });
      return "";
    },
    async command(label, argv) {
      calls.push([label, ...argv]);
      if (failure === label) throw new Error(`injected ${label}`);
    },
    start(argv, env) {
      calls.push(["start", ...argv]);
      expect(env.SANDBOX_STATE_DIRECTORY).toBe("/tmp/owned-state");
      expect(env.SANDBOX_NAMESPACE).toBe(plan.namespace);
      expect(env.SANDBOX_SUPERVISOR_TOKEN?.length).toBeGreaterThanOrEqual(32);
      return {
        alive: () => true,
        exited: Promise.resolve(0),
        async stop() {
          calls.push(["stop"]);
        },
      };
    },
    async step(label, operation) {
      steps.push(label);
      if (failure === label) throw new Error(`injected ${label}`);
      return operation();
    },
    async request(_url, _token, operation, body) {
      calls.push(["request", operation]);
      if (operation.endsWith("/create")) {
        computer = operation.split("/")[1]!;
        generation = (body as { generation: number }).generation;
      }
      if (operation.endsWith("/files/write")) bytes = (body as { bytes: string }).bytes;
      return { bytes };
    },
    async temporary() {
      calls.push(["temporary"]);
      return "/tmp/owned-state";
    },
    async removeTemporary(path) {
      calls.push(["remove-state", path]);
    },
    async port() {
      return 40123;
    },
    async pause() {},
    check() {},
    report(message) {
      calls.push(["report", message]);
    },
  };
  return { runtime, calls, steps };
}

describe("owned sandbox execution", () => {
  it("fails missing or unreachable Docker before creating state or starting services", async () => {
    const { runtime, calls } = fakeRuntime();
    runtime.hasDocker = () => false;
    await expect(executeSandbox("/repo", plan, runtime)).rejects.toThrow("Missing Docker");
    expect(calls).toEqual([]);
    runtime.hasDocker = () => true;
    runtime.capture = async () => {
      throw new Error("connection refused");
    };
    await expect(executeSandbox("/repo", plan, runtime)).rejects.toThrow("Engine unreachable");
    expect(calls).toEqual([]);
  });
  it("builds pinned bases, runs live conformance and replacement probes, then stops before scoped cleanup", async () => {
    const { runtime, calls, steps } = fakeRuntime();
    const result = await executeSandbox("/repo", plan, runtime);
    expect(result).toMatchObject({
      image: `sha256:${"a".repeat(64)}`,
      egress: expect.stringContaining("not run"),
    });
    const build = calls.find((call) => call[0] === "computer-build")!;
    expect(build).toContain(`BUN_IMAGE_DIGEST=${"b".repeat(64)}`);
    expect(build).toContain(`COMPUTER_BASE_DIGEST=${"b".repeat(64)}`);
    expect(calls.find((call) => call[0] === "provider-conformance")).toContain(
      "tests/computer/conformance.test.ts",
    );
    expect(steps).toContain("home-replacement");
    expect(calls.findIndex((call) => call[0] === "stop")).toBeLessThan(
      calls.findIndex((call) => call.includes("--all")),
    );
    expect(calls.at(-1)).toEqual(["remove-state", "/tmp/owned-state"]);
    expect(calls.some((call) => call.includes("--apply"))).toBe(false);
    expect(JSON.stringify(result)).not.toContain("TOKEN");
  });
  it.each(["computer-build", "provider-conformance", "isolation", "home-replacement"])(
    "tears down after %s failure",
    async (failure) => {
      const { runtime, calls, steps } = fakeRuntime(failure);
      await expect(executeSandbox("/repo", plan, runtime)).rejects.toThrow(`injected ${failure}`);
      expect(steps).toEqual(
        expect.arrayContaining(["supervisor-stop", "engine-cleanup", "state-remove"]),
      );
      expect(calls.at(-1)).toEqual(["remove-state", "/tmp/owned-state"]);
      expect(calls.some((call) => call.includes("prune"))).toBe(false);
    },
  );
  it("removes firewall rules after an explicitly opted-in apply failure", async () => {
    const { runtime, calls } = fakeRuntime("egress-apply");
    await expect(executeSandbox("/repo", { ...plan, withEgress: true }, runtime)).rejects.toThrow(
      "injected egress-apply",
    );
    expect(calls.some((call) => call.includes("--apply"))).toBe(true);
    expect(calls.some((call) => call.includes("--remove"))).toBe(true);
  });
  it("reports egress not run on unsupported hosts even with opt-in", async () => {
    const { runtime, calls } = fakeRuntime();
    runtime.platform = "darwin";
    const result = await executeSandbox("/repo", { ...plan, withEgress: true }, runtime);
    expect(result.egress).toContain("not run");
    expect(calls.some((call) => call.includes("--apply") || call.includes("sudo"))).toBe(false);
  });
  it("requires passwordless sudo for an unprivileged Linux opt-in", async () => {
    const { runtime, calls } = fakeRuntime();
    runtime.rootUser = false;
    const capture = runtime.capture.bind(runtime);
    runtime.capture = async (args) => {
      if (args[0] === "sudo") throw new Error("password required");
      return capture(args);
    };
    expect(
      (await executeSandbox("/repo", { ...plan, withEgress: true }, runtime)).egress,
    ).toContain("not run");
    expect(calls.some((call) => call.includes("--apply"))).toBe(false);
  });
  it("removes opted-in firewall rules and state even when probing or Engine teardown fails", async () => {
    const { runtime, calls } = fakeRuntime("egress-probe");
    const capture = runtime.capture.bind(runtime);
    runtime.capture = async (args) => {
      if (args.includes("volume") && args.includes("rm")) throw new Error("Engine remove failure");
      return capture(args);
    };
    await expect(executeSandbox("/repo", { ...plan, withEgress: true }, runtime)).rejects.toThrow(
      "cleanup failed",
    );
    expect(calls.some((call) => call.includes("--remove"))).toBe(true);
    expect(calls.at(-1)).toEqual(["remove-state", "/tmp/owned-state"]);
  });
});

it.each(["volume", "network", "image"])(
  "refuses to remove a %s with a foreign ownership label",
  async (kind) => {
    const { runtime, calls } = fakeRuntime();
    const capture = runtime.capture.bind(runtime);
    runtime.capture = async (args) => {
      if (args.includes(kind) && args.includes("inspect")) {
        calls.push(args);
        return JSON.stringify([{ Name: plan.network, Labels: {}, Config: { Labels: {} } }]);
      }
      return capture(args);
    };
    await expect(
      cleanupSandbox(plan, (args) =>
        runtime.capture(["docker", "--host", `unix://${plan.socket}`, ...args]),
      ),
    ).rejects.toThrow("cleanup failed");
    expect(calls.some((call) => call.includes(kind) && call.includes("rm"))).toBe(false);
  },
);

it("rechecks resource labels and continues teardown after an unowned resource or cleanup failure", async () => {
  const { runtime, calls } = fakeRuntime();
  const original = runtime.capture.bind(runtime);
  runtime.capture = async (args) => {
    if (args.includes("container") && args.includes("inspect")) {
      calls.push(args);
      const value = inspection();
      value.Config.Labels["raypx.supervisor"] = "operator-network";
      return JSON.stringify([value]);
    }
    return original(args);
  };
  await expect(
    cleanupSandbox(plan, (args) =>
      runtime.capture(["docker", "--host", `unix://${plan.socket}`, ...args]),
    ),
  ).rejects.toThrow("cleanup failed");
  expect(calls.some((call) => call.includes("container") && call.includes("rm"))).toBe(false);
  expect(calls.some((call) => call.includes("volume") && call.includes("rm"))).toBe(true);
  expect(calls.some((call) => call.includes("network") && call.includes("rm"))).toBe(true);
  for (const call of calls.filter((args) => args.includes("--filter")))
    expect(call.some((arg) => arg.includes(plan.network) || arg.includes(plan.id))).toBe(true);
});
