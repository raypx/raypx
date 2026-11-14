import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { sandboxBaseDigest, sandboxEnvironment, sandboxPlan } from "./sandbox-plan.js";
import {
  sandboxEscapeProbe,
  sandboxForkProbe,
  sandboxMemoryProbe,
  sandboxDiskProbe,
  sandboxCrossNetworkProbe,
  assertSandboxContainer,
  assertSandboxEgress,
  sandboxEgressControl,
  sandboxEgressCounters,
  sandboxEgressProbe,
  sandboxEgressRanges,
  sandboxIsolationProbe,
  type SandboxContainer,
  type SandboxEgressResult,
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
      Runtime: plan.runtime,
      NanoCpus: 1_000_000_000,
      PidMode: "",
      IpcMode: "private",
      CgroupnsMode: "private",
      LogConfig: { Type: "none" },
      Memory: plan.memory,
      MemorySwap: plan.memory,
      PidsLimit: plan.hostPids,
      ReadonlyRootfs: true,
      Privileged: false,
      NetworkMode: plan.network,
      CapDrop: ["ALL"],
      SecurityOpt: ["no-new-privileges:true"],
      Binds: null,
      Dns: [plan.dnsResolver],
    },
    Mounts: [
      { Type: "volume", Destination: "/home/computer" },
      { Type: "volume", Destination: "/run/raypx" },
    ],
    NetworkSettings: {
      Networks: { [plan.network]: { Gateway: "172.25.0.1", IPAddress: "172.25.0.2" } },
    },
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
      memory: 536870912,
      pids: 128,
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
    expect(sandboxPlan(["--dns-resolver", "9.9.9.9"], {}, id, "1.4.4").dnsResolver).toBe("9.9.9.9");
    for (const resolver of [
      "127.0.0.11",
      "10.0.0.1",
      "169.254.169.254",
      "224.0.0.1",
      "resolver.example.test",
    ])
      expect(() => sandboxPlan(["--dns-resolver", resolver], {}, id, "1.4.4")).toThrow(
        "public IPv4",
      );
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
  it("accepts an explicit Engine-host argv only with egress opt-in", () => {
    const args = ["--engine-host-command", '["vm-exec","--","sudo","-n"]'];
    expect(sandboxPlan([...args, "--with-egress"], {}, id, "1.4.4").engineHostCommand).toEqual([
      "vm-exec",
      "--",
      "sudo",
      "-n",
    ]);
    expect(() => sandboxPlan(args, {}, id, "1.4.4")).toThrow("requires --with-egress");
    for (const value of ["[]", '["ok",0]', '"shell text"', "bad JSON", '[""]'])
      expect(() =>
        sandboxPlan(["--with-egress", "--engine-host-command", value], {}, id, "1.4.4"),
      ).toThrow("JSON argument array");
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
  let inspectionComputer = "";
  let bytes = "";
  let screen = false;
  let counterReads = 0;
  const networkSpaces = new Map<string, string>();
  const spaceExhaustions = new Map<string, number>();
  const stoppedNetwork = new Map<string, string>();
  const runtime: SandboxRuntime = {
    platform: "linux",
    rootUser: true,
    hasDocker: () => true,
    async capture(argv) {
      calls.push(argv);
      if (argv.some((arg) => arg.includes("for port in (25,80)")))
        return JSON.stringify({ bytes: 262300, seconds: 0.01 });
      if (argv.includes("iptables")) {
        const packets = counterReads++ * 8;
        if (argv.includes("raw")) {
          if (argv.includes("-S")) return `-N RPX_R_${plan.bridge.slice(3)}_fixture`;
          return `${packets} 60 DROP udp -- * * 0.0.0.0/0 0.0.0.0/0 /* raypx-network:${plan.bridge}:datagrams */`;
        }
        if (argv.includes("INPUT"))
          return `${packets} 60 DROP all -- ${plan.bridge} * 0.0.0.0/0 0.0.0.0/0 /* raypx-sandbox-egress:${plan.bridge} */`;
        return [
          `${packets} 60 DROP tcp -- * * 0.0.0.0/0 0.0.0.0/0 /* raypx-sandbox-ports:${plan.bridge} */`,
          ...sandboxEgressRanges.map(
            (range) => `${packets} 60 DROP all -- * * 0.0.0.0/0 ${range} /* owned */`,
          ),
          ...["udp", "tcp"].map(
            (protocol) =>
              `${packets} 60 DROP ${protocol} -- * * 0.0.0.0/0 !1.1.1.1 ${protocol} dpt:53 /* raypx-sandbox-dns:${plan.bridge}:1.1.1.1 */`,
          ),
        ].join("\n");
      }
      if (argv[0] !== "docker") return "";
      expect(argv.slice(0, 3)).toEqual(["docker", "--host", `unix://${plan.socket}`]);
      const args = argv.slice(3);
      if (args[0] === "version")
        return JSON.stringify({ Os: "linux", Version: "29.5", Arch: "arm64", ApiVersion: "1.54" });
      if (args[0] === "image" && args[1] === "inspect" && args.includes("--format")) {
        if (args.includes("{{.Size}}"))
          return args.at(-1)!.endsWith("-graphical") ? "800000000" : "200000000";
        if (args.includes("{{.Id}}")) return `sha256:${"a".repeat(64)}`;
        const repository = args.at(-1)!.split(":")[0];
        return JSON.stringify([`${repository}@sha256:${"b".repeat(64)}`]);
      }
      if (args[0] === "ps") {
        inspectionComputer =
          args
            .find((arg) => arg.startsWith("label=raypx.computer="))
            ?.slice("label=raypx.computer=".length) ?? computer;
        return "owned-container";
      }
      if (args[0] === "inspect" && args.includes("{{json .State}}"))
        return JSON.stringify({ Running: false });
      if (args[0] === "exec" && args.includes(sandboxEscapeProbe))
        return JSON.stringify({
          setuid: true,
          mount: true,
          unshare: true,
          "proc-sys": true,
          "raw-socket": true,
        });
      if (args[0] === "exec" && args.includes(sandboxForkProbe))
        return JSON.stringify({ forkLimited: true });
      if (args[0] === "exec" && args.includes(sandboxMemoryProbe))
        return JSON.stringify({ memoryLimited: true });
      if (args[0] === "exec" && args.includes(sandboxCrossNetworkProbe))
        return JSON.stringify({ crossSandboxBlocked: true });
      if (args[0] === "exec" && args.includes(sandboxDiskProbe))
        return JSON.stringify({ written: 37748736 });
      if (args[0] === "container" && args[1] === "inspect")
        return JSON.stringify([inspection(inspectionComputer || computer, generation)]);
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
      if (args[0] === "exec" && args.includes(sandboxEgressProbe))
        return JSON.stringify(egressResult());
      if (args[0] === "run" && args.includes(sandboxEgressControl)) return "host-control";
      if (args[0] === "logs") return JSON.stringify({ port: 40123, checks: egressControl() });
      return "";
    },
    async command(label, argv) {
      calls.push([label, ...argv]);
      if (failure === label) throw new Error(`injected ${label}`);
    },
    start(argv, env) {
      calls.push(["start", ...argv]);
      screen = env.SANDBOX_GRAPHICAL === "true";
      expect(env.SANDBOX_STATE_DIRECTORY).toMatch(/^\/tmp\/owned-state(?:-fresh)?$/);
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
      if (operation === "description") return { screen };
      if (operation.endsWith("/create")) {
        const targetId = operation.split("/")[1]!;
        const space = (body as { spaceId?: string }).spaceId;
        if (space) {
          if ((spaceExhaustions.get(space) ?? 0) >= 2)
            throw new Error("SPACE_DAILY_TRANSFER_LIMIT");
          networkSpaces.set(targetId, space);
        }
        if (computer === "probe" || computer === operation.split("/")[1]) {
          computer = operation.split("/")[1]!;
          generation = (body as { generation: number }).generation;
        }
      }
      if (operation.endsWith("/get") && stoppedNetwork.has(operation.split("/")[1]!))
        return {
          state: "stopped",
          unavailableReason: stoppedNetwork.get(operation.split("/")[1]!),
        };
      if (operation.endsWith("/exec")) {
        const input = body as { generation: number; command: { argv: string[] } };
        const argv = input.command.argv;
        calls.push(["probe", `generation=${input.generation}`, ...argv]);
        let value: unknown = {};
        if (argv.some((arg) => arg.includes("GET /262144"))) value = { bytes: 262300, seconds: 3 };
        if (argv.some((arg) => arg.includes("GET /2097152"))) {
          const targetId = operation.split("/")[1]!;
          const space = networkSpaces.get(targetId)!;
          const used = spaceExhaustions.get(space) ?? 0;
          stoppedNetwork.set(
            targetId,
            used ? "SPACE_DAILY_TRANSFER_LIMIT" : "COMPUTER_TRANSFER_LIMIT",
          );
          spaceExhaustions.set(space, used + 1);
        }
        if (argv.some((arg) => arg.includes("3389"))) value = { blocked: true };
        if (argv.some((arg) => arg.includes("opened=[]"))) value = { opened: 8, blocked: 4 };
        if (argv.includes(sandboxIsolationProbe))
          value = {
            uid: 1000,
            capEff: 0,
            noNewPrivileges: true,
            memory: plan.memory,
            pids: plan.pids,
          };
        if (argv.includes(sandboxEgressProbe)) value = egressResult();
        if (argv.includes(sandboxEscapeProbe))
          value = {
            setuid: true,
            mount: true,
            unshare: true,
            "proc-sys": true,
            "raw-socket": true,
          };
        if (argv.includes(sandboxForkProbe)) value = { forkLimited: true };
        if (argv.includes(sandboxMemoryProbe)) value = { memoryLimited: true };
        if (argv.includes(sandboxCrossNetworkProbe)) value = { crossSandboxBlocked: true };
        if (argv.some((arg) => arg.includes("RAYPX_PRIVATE_INPUT"))) {
          const command = (body as { command: { stdin?: string } }).command;
          if (command.stdin) {
            const digest = createHash("sha256").update(command.stdin).digest("hex");
            value = { stdin: digest, environment: digest, cleared: true };
          } else value = { clean: true };
        }
        return { status: 0, stdout: JSON.stringify(value) };
      }
      if (operation.endsWith("/files/write")) bytes = (body as { bytes: string }).bytes;
      return { bytes, state: "stopped" };
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
    expect(result.imageBytes).toEqual({ default: 200000000, graphical: 800000000 });
    expect(result.graphical).toContain("stream closes on stop");
    expect(calls.find((call) => call[0] === "graphical-build")).toContain("graphical");
    expect(calls.findIndex((call) => call[0] === "stop")).toBeLessThan(
      calls.findIndex((call) => call.includes("--all")),
    );
    expect(calls.at(-1)).toEqual(["remove-state", "/tmp/owned-state"]);
    expect(calls.some((call) => call.includes("--apply"))).toBe(false);
    expect(JSON.stringify(result)).not.toContain("TOKEN");
  });
  it("discards stale headless volume references before graphical recovery can mount them", async () => {
    const { runtime, calls } = fakeRuntime();
    let allocation = 0;
    runtime.temporary = async () => (allocation++ ? "/tmp/owned-state-fresh" : "/tmp/owned-state");
    const start = runtime.start.bind(runtime);
    const directories: string[] = [];
    runtime.start = (argv, env) => {
      directories.push(env.SANDBOX_STATE_DIRECTORY!);
      return start(argv, env);
    };
    await executeSandbox("/repo", plan, runtime);
    expect(directories.at(-1)).toBe("/tmp/owned-state-fresh");
    const lifecycle = calls.findIndex((call) => call[0] === "lifecycle-acceptance");
    const discarded = calls.findIndex((call) => call[0] === "remove-state");
    expect(discarded).toBeGreaterThan(lifecycle);
    expect(calls.at(-1)).toEqual(["remove-state", "/tmp/owned-state-fresh"]);
  });
  it.each([
    "computer-build",
    "graphical-build",
    "provider-conformance",
    "isolation",
    "home-replacement",
    "lifecycle-acceptance",
    "fork-exhaustion",
  ])("tears down after %s failure", async (failure) => {
    const { runtime, calls, steps } = fakeRuntime(failure);
    await expect(executeSandbox("/repo", plan, runtime)).rejects.toThrow(`injected ${failure}`);
    expect(steps).toEqual(
      expect.arrayContaining(["supervisor-stop", "engine-cleanup", "state-remove"]),
    );
    expect(calls.at(-1)).toEqual(["remove-state", "/tmp/owned-state"]);
    expect(calls.some((call) => call.includes("prune"))).toBe(false);
  });
  it("removes firewall rules after an explicitly opted-in apply failure", async () => {
    const { runtime, calls } = fakeRuntime("egress-apply");
    await expect(executeSandbox("/repo", { ...plan, withEgress: true }, runtime)).rejects.toThrow(
      "injected egress-apply",
    );
    expect(calls.some((call) => call.includes("--apply"))).toBe(true);
    expect(calls.some((call) => call.includes("--remove"))).toBe(true);
  });
  it("checks HTTPS, host controls, private DROP counters and configured DNS inside the replacement computer", async () => {
    const { runtime, calls } = fakeRuntime();
    const result = await executeSandbox("/repo", { ...plan, withEgress: true }, runtime);
    expect(result.egress).toContain("public HTTPS passed");
    expect(result.egress).toContain("configured DNS passed");
    const probe = calls.find((call) => call.includes(sandboxEgressProbe))!;
    expect(probe).toContain("generation=3");
    expect(probe.slice(-3)).toEqual(["172.25.0.1", plan.dnsResolver, "40123"]);
    expect(calls.find((call) => call.includes(sandboxEgressControl))).toContain("host");
    expect(calls.find((call) => call[0] === "egress-apply")).toContain("--resolver");
    expect(calls.some((call) => call.includes("--remove"))).toBe(true);
  });
  it("records public reachability as unavailable rather than passed on an offline Engine", async () => {
    const { runtime } = fakeRuntime();
    const capture = runtime.capture.bind(runtime);
    runtime.capture = async (args) => {
      if (args.includes("logs"))
        return JSON.stringify({
          port: 40123,
          checks: { ...egressControl(), publicHttps: "network-unreachable" },
        });
      return capture(args);
    };
    const request = runtime.request.bind(runtime);
    runtime.request = async (url, token, operation, body) => {
      if ((body as { command?: { argv: string[] } })?.command?.argv.includes(sandboxEgressProbe)) {
        const result = egressResult();
        result.checks.publicHttps = "timeout";
        return { status: 0, stdout: JSON.stringify(result) };
      }
      return request(url, token, operation, body);
    };
    const result = await executeSandbox("/repo", { ...plan, withEgress: true }, runtime);
    expect(result.egress).toContain("public HTTPS unavailable");
    expect(result.egress).not.toContain("public HTTPS passed");
  });
  it("tears down rather than passing when the Engine-host HTTPS control succeeds but the computer cannot reach it", async () => {
    const { runtime, calls } = fakeRuntime();
    const capture = runtime.capture.bind(runtime);
    runtime.capture = async (args) => {
      return capture(args);
    };
    const request = runtime.request.bind(runtime);
    runtime.request = async (url, token, operation, body) => {
      if ((body as { command?: { argv: string[] } })?.command?.argv.includes(sandboxEgressProbe)) {
        const result = egressResult();
        result.checks.publicHttps = "timeout";
        return { status: 0, stdout: JSON.stringify(result) };
      }
      return request(url, token, operation, body);
    };
    await expect(executeSandbox("/repo", { ...plan, withEgress: true }, runtime)).rejects.toThrow(
      "allowed network probe failed",
    );
    expect(calls.some((call) => call.includes("--remove"))).toBe(true);
  });
  it("reports egress not run on unsupported hosts even with opt-in", async () => {
    const { runtime, calls } = fakeRuntime();
    runtime.platform = "darwin";
    const result = await executeSandbox("/repo", { ...plan, withEgress: true }, runtime);
    expect(result.egress).toContain("not run");
    expect(calls.some((call) => call.includes("--apply") || call.includes("sudo"))).toBe(false);
  });
  it("applies, reads and removes VM firewall rules only through the explicit host command", async () => {
    const { runtime, calls } = fakeRuntime();
    runtime.platform = "darwin";
    const capture = runtime.capture.bind(runtime);
    runtime.capture = async (args) => {
      if (args[0] === "vm-exec" && args.includes("uname")) return "Linux";
      if (args[0] === "vm-exec" && args.includes("id")) return "0";
      return capture(args);
    };
    const result = await executeSandbox(
      "/repo",
      { ...plan, withEgress: true, engineHostCommand: ["vm-exec", "--"] },
      runtime,
    );
    expect(result.egress).toContain("restrictions passed");
    for (const call of calls.filter(
      (args) =>
        args.includes("--apply") ||
        args.includes("--remove") ||
        args.includes("iptables") ||
        args.includes("ip6tables"),
    ))
      expect(call).toContain("vm-exec");
    expect(calls.some((args) => args[0] === "sudo")).toBe(false);
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

function egressControl() {
  return {
    publicHttps: "connected",
    resolverUdp: "connected",
    resolverTcp: "connected",
    hostLoopback: "connected",
    publicIpv6: "network-unreachable",
  };
}

function egressResult(): SandboxEgressResult {
  return {
    nameservers: ["127.0.0.11"],
    checks: {
      ...egressControl(),
      fileResolverUdp: "connected",
      fileResolverTcp: "connected",
      hostLoopback: "connection-refused",
      gateway: "timeout",
      hostService: "timeout",
      metadata: "timeout",
      private10: "timeout",
      private172: "timeout",
      private192: "timeout",
      otherDnsUdp0: "timeout",
      otherDnsTcp0: "timeout",
      otherDnsUdp1: "timeout",
      otherDnsTcp1: "timeout",
    },
  };
}

describe("egress evidence", () => {
  const after = Object.fromEntries(
    [...sandboxEgressRanges, "dns:udp", "dns:tcp", "host:input"].map((range) => [range, 2]),
  );
  it("reads numeric TCP/UDP protocol counters from real Engine iptables output", () => {
    const output = [
      `2 114 DROP 17 -- * * 0.0.0.0/0 !1.1.1.1 udp dpt:53 /* raypx-sandbox-dns:${plan.bridge}:1.1.1.1 */`,
      `6 360 DROP 6 -- * * 0.0.0.0/0 !1.1.1.1 tcp dpt:53 /* raypx-sandbox-dns:${plan.bridge}:1.1.1.1 */`,
    ].join("\n");
    expect(sandboxEgressCounters(output, plan.bridge)).toEqual({ "dns:udp": 2, "dns:tcp": 6 });
  });
  it("reports unavailable IPv6 separately and requires a DROP counter when the host has IPv6", () => {
    expect(assertSandboxEgress(egressResult(), egressControl(), {}, after)).toContain(
      "IPv6 enforcement unavailable",
    );
    const result = egressResult();
    result.checks.publicIpv6 = "timeout";
    const control = { ...egressControl(), publicIpv6: "connected" };
    expect(() => assertSandboxEgress(result, control, {}, after)).toThrow("IPv6 probe");
    expect(assertSandboxEgress(result, control, {}, { ...after, "ipv6:forward": 1 })).toContain(
      "IPv6 enforcement passed",
    );
    result.checks.publicIpv6 = "connected";
    expect(() => assertSandboxEgress(result, control, {}, { ...after, "ipv6:forward": 1 })).toThrow(
      "IPv6 probe",
    );
    expect(() => assertSandboxEgress(result, egressControl(), {}, after)).toThrow("IPv6 control");
  });
  it.each(["publicHttps", "resolverUdp", "resolverTcp", "fileResolverUdp", "fileResolverTcp"])(
    "never turns a %s protocol or implementation error into unavailable",
    (name) => {
      const result = egressResult();
      for (const error of [
        "tls-error",
        "http-error",
        "invalid-response",
        "unexpected-error",
        "permission-denied",
      ]) {
        result.checks[name] = error;
        expect(() =>
          assertSandboxEgress(result, { ...egressControl(), [name]: "timeout" }, {}, after),
        ).toThrow("allowed network probe failed");
      }
    },
  );
  it.each([
    "gateway",
    "hostService",
    "metadata",
    "private10",
    "private172",
    "private192",
    "otherDnsUdp0",
    "otherDnsTcp0",
    "otherDnsUdp1",
    "otherDnsTcp1",
  ])("rejects a reachable or inconclusive forbidden destination: %s", (name) => {
    for (const status of [
      "connected",
      "connection-refused",
      "invalid-response",
      "unexpected-error",
    ]) {
      const result = egressResult();
      result.checks[name] = status;
      expect(() => assertSandboxEgress(result, egressControl(), {}, after)).toThrow(
        "forbidden destination",
      );
    }
  });
  it("accepts embedded DNS SERVFAIL as unavailable only with an independently unreachable upstream", () => {
    const result = egressResult();
    result.checks.publicHttps = "timeout";
    result.checks.resolverUdp = "timeout";
    result.checks.resolverTcp = "network-unreachable";
    result.checks.fileResolverUdp = "dns-server-failure";
    result.checks.fileResolverTcp = "dns-server-failure";
    const offline = {
      ...egressControl(),
      publicHttps: "network-unreachable",
      resolverUdp: "timeout",
      resolverTcp: "network-unreachable",
    };
    const report = assertSandboxEgress(result, offline, {}, after);
    expect(report).toContain("public HTTPS unavailable");
    expect(report).toContain("configured DNS unavailable");
    for (const [embedded, upstream] of [
      ["fileResolverUdp", "resolverUdp"],
      ["fileResolverTcp", "resolverTcp"],
    ] as const) {
      const selected = egressResult();
      selected.checks[embedded] = "dns-server-failure";
      expect(() => assertSandboxEgress(selected, egressControl(), {}, after)).toThrow(
        "allowed network probe failed",
      );
      selected.checks[embedded] = "invalid-response";
      expect(() =>
        assertSandboxEgress(selected, { ...egressControl(), [upstream]: "timeout" }, {}, after),
      ).toThrow("allowed network probe failed");
    }
    for (const upstream of ["resolverUdp", "resolverTcp"]) {
      const selected = egressResult();
      selected.checks[upstream] = "dns-server-failure";
      expect(() =>
        assertSandboxEgress(selected, { ...offline, [upstream]: "timeout" }, {}, after),
      ).toThrow("allowed network probe failed");
    }
  });
  it("requires actual packet drops, an accessible host loopback control and the configured embedded resolver", () => {
    expect(() => assertSandboxEgress(egressResult(), egressControl(), after, after)).toThrow(
      "DROP rule",
    );
    expect(() =>
      assertSandboxEgress(egressResult(), egressControl(), {}, { ...after, "dns:udp": 1 }),
    ).toThrow("udp DROP rule");
    expect(() =>
      assertSandboxEgress(egressResult(), egressControl(), {}, { ...after, "host:input": 1 }),
    ).toThrow("INPUT DROP rule");
    expect(() =>
      assertSandboxEgress(
        egressResult(),
        { ...egressControl(), hostLoopback: "connection-refused" },
        {},
        after,
      ),
    ).toThrow("control");
    expect(() =>
      assertSandboxEgress(
        { ...egressResult(), nameservers: ["8.8.8.8"] },
        egressControl(),
        {},
        after,
      ),
    ).toThrow("configured resolver file");
    expect(
      sandboxEgressCounters(
        "pkts bytes target prot opt in out source destination\n2 120 DROP all -- * * 0.0.0.0/0 10.0.0.0/8\n3 180 RETURN all -- * * 0.0.0.0/0 172.16.0.0/12",
        plan.bridge,
      ),
    ).toEqual({ "10.0.0.0/8": 2 });
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
it.each(["graphical-conformance", "graphical-supervisor-ready"])(
  "keeps optional %s failure explicitly unavailable after headless safety acceptance",
  async (failure) => {
    const f = fakeRuntime(failure);
    const result = await executeSandbox("/repo", plan, f.runtime);
    expect(result.graphical).toContain("unavailable: GRAPHICAL_RUNTIME_UNAVAILABLE");
    expect(f.steps).toContain("unlinked-disk-exhaustion-stop");
    expect(f.calls.at(-1)).toEqual(["remove-state", "/tmp/owned-state"]);
  },
);
