import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Evidence, type ValidationProcess } from "./evidence.js";
import {
  sandboxBaseDigest,
  sandboxEnvironment,
  sandboxPlan,
  type SandboxPlan,
} from "./sandbox-plan.js";
import {
  sandboxEscapeProbe,
  sandboxForkProbe,
  sandboxMemoryProbe,
  sandboxDiskProbe,
  sandboxUnlinkedDiskProbe,
  sandboxCrossNetworkProbe,
  assertSandboxContainer,
  assertSandboxEgress,
  sandboxEgressControl,
  sandboxEgressCounters,
  sandboxEgressProbe,
  sandboxIsolationProbe,
  type SandboxContainer,
  type SandboxEgressResult,
} from "./sandbox-probes.js";
import { readBunPin } from "./toolchain.js";
import { acceptSandboxNetwork } from "./sandbox-network.js";

/** All effects are injected so failure and resource ownership can be checked without an Engine. */
export interface SandboxRuntime {
  platform: string;
  rootUser: boolean;
  hasDocker(): boolean;
  capture(args: string[]): Promise<string>;
  command(label: string, args: string[], env?: NodeJS.ProcessEnv): Promise<void>;
  start(args: string[], env: NodeJS.ProcessEnv): ValidationProcess;
  step<T>(label: string, operation: () => Promise<T>): Promise<T>;
  request(url: string, token: string, operation: string, body?: object): Promise<unknown>;
  temporary(): Promise<string>;
  removeTemporary(path: string): Promise<void>;
  port(): Promise<number>;
  pause(): Promise<void>;
  check(): void;
  report(message: string): void;
}

function lines(value: string) {
  return value.trim().split(/\s+/).filter(Boolean);
}

/** Teardown only follows the run's exact supervisor label, checking it again before removal. */
export async function cleanupSandbox(
  plan: SandboxPlan,
  docker: (args: string[]) => Promise<string>,
) {
  const failures: string[] = [];
  async function attempt(label: string, operation: () => Promise<void>) {
    try {
      await operation();
    } catch {
      failures.push(label);
    }
  }
  const filter = `label=raypx.supervisor=${plan.network}`;
  await attempt("containers", async () => {
    const ids = lines(await docker(["ps", "--all", "--quiet", "--filter", filter]));
    for (const id of ids)
      await attempt("container", async () => {
        const [value] = JSON.parse(
          await docker(["container", "inspect", id]),
        ) as SandboxContainer[];
        if (value?.Config.Labels["raypx.supervisor"] !== plan.network)
          throw new Error("Unowned container refused");
        // Also remove anonymous image volumes; named volumes follow exact labels below.
        await docker(["container", "rm", "--force", "--volumes", id]);
      });
  });
  await attempt("volumes", async () => {
    for (const name of lines(await docker(["volume", "ls", "--quiet", "--filter", filter])))
      await attempt("volume", async () => {
        const [value] = JSON.parse(await docker(["volume", "inspect", name])) as {
          Labels: Record<string, string>;
        }[];
        if (value?.Labels["raypx.supervisor"] !== plan.network)
          throw new Error("Unowned volume refused");
        await docker(["volume", "rm", name]);
      });
  });
  await attempt("network", async () => {
    const ids = lines(await docker(["network", "ls", "--quiet", "--filter", filter]));
    for (const id of ids) {
      const [value] = JSON.parse(await docker(["network", "inspect", id])) as {
        Name: string;
        Labels: Record<string, string>;
      }[];
      if (value?.Name !== plan.network || value.Labels["raypx.supervisor"] !== plan.network)
        throw new Error("Unowned network refused");
      await docker(["network", "rm", id]);
    }
  });
  await attempt("image", async () => {
    const ids = lines(
      await docker(["image", "ls", "--quiet", "--filter", `label=raypx.validation=${plan.id}`]),
    );
    for (const id of new Set(ids)) {
      const [value] = JSON.parse(await docker(["image", "inspect", id])) as {
        Config: { Labels: Record<string, string> };
      }[];
      if (value?.Config.Labels["raypx.validation"] !== plan.id)
        throw new Error("Unowned image refused");
      await docker(["image", "rm", "--no-prune", id]);
    }
  });
  if (failures.length) throw new Error(`Sandbox cleanup failed: ${failures.join(", ")}`);
}

export async function executeSandbox(
  root: string,
  plan: SandboxPlan,
  runtime: SandboxRuntime,
): Promise<{
  runtime: string;
  image: string;
  graphicalImage: string;
  imageBytes: { default: number; graphical: number };
  graphical: string;
  bases: Record<string, string>;
  egress: string;
  engine: { os: string; version: string; architecture: string; api: string };
}> {
  const dockerArgs = ["docker", "--host", `unix://${plan.socket}`];
  const docker = (args: string[]) => runtime.capture([...dockerArgs, ...args]);
  // Check availability before creating state, building images or starting any service.
  const engine = await runtime.step("docker-preflight", async () => {
    if (!runtime.hasDocker())
      throw new Error("Missing Docker CLI; install Docker and start its Engine");
    let server: { Os: string; Version: string; Arch: string; ApiVersion: string };
    try {
      server = JSON.parse(
        await docker(["version", "--format", "{{json .Server}}"]),
      ) as typeof server;
    } catch {
      throw new Error(
        "Docker Engine unreachable; start it or set --engine-socket to its Unix socket",
      );
    }
    if (server.Os !== "linux") throw new Error("Sandbox acceptance requires a Linux Docker Engine");
    const api = server.ApiVersion.split(".").map(Number);
    if (api[0] !== 1 || !Number.isInteger(api[1]) || api[1]! < 47)
      throw new Error("Sandbox acceptance requires Docker Engine API v1.47 or later");
    return {
      os: server.Os,
      version: server.Version,
      architecture: server.Arch,
      api: server.ApiVersion,
    };
  });
  const env = sandboxEnvironment(process.env);
  const imagePlatform = `${engine.os}/${engine.architecture}`;
  const token = `${crypto.randomUUID()}${crypto.randomUUID()}`;
  const bases: Record<string, string> = {};
  let directory: string | undefined;
  let supervisor: ValidationProcess | undefined;
  let firewall: string[] | undefined;
  let image = "";
  const imageBytes = { default: 0, graphical: 0 };
  let graphical = "not run";
  let graphicalImage = "";
  let egress = "not run (requires --with-egress and Linux root or passwordless sudo)";
  const cleanupErrors: unknown[] = [];
  let failed = false;
  let primaryFailure: unknown;
  let outcome:
    | {
        runtime: string;
        image: string;
        graphicalImage: string;
        imageBytes: typeof imageBytes;
        graphical: string;
        bases: Record<string, string>;
        egress: string;
        engine: typeof engine;
      }
    | undefined;
  try {
    directory = await runtime.temporary();
    for (const [key, tag] of Object.entries(plan.bases)) {
      await runtime.command(
        `${key}-base-pull`,
        [...dockerArgs, "pull", "--platform", imagePlatform, tag],
        env,
      );
      bases[key] = await runtime.step(`${key}-base-digest`, async () => {
        const references = await docker([
          "image",
          "inspect",
          "--format",
          "{{json .RepoDigests}}",
          tag,
        ]);
        return sandboxBaseDigest(tag, JSON.parse(references) as string[]);
      });
    }
    await runtime.command(
      "computer-build",
      [
        ...dockerArgs,
        "build",
        "--platform",
        imagePlatform,
        "--file",
        "infra/sandbox/Computer.Dockerfile",
        "--build-arg",
        `BUN_IMAGE_DIGEST=${bases.bun}`,
        "--build-arg",
        `COMPUTER_BASE_DIGEST=${bases.computer}`,
        "--build-arg",
        `RAYPX_VALIDATION_ID=${plan.id}`,
        "--tag",
        plan.image,
        ".",
      ],
      env,
    );
    imageBytes.default = await runtime.step("default-image-bytes", async () => {
      const value = Number(await docker(["image", "inspect", "--format", "{{.Size}}", plan.image]));
      if (!Number.isSafeInteger(value) || value <= 0) throw new Error("Invalid default image size");
      return value;
    });
    const graphicalTag = `${plan.image}-graphical`;
    await runtime.command(
      "graphical-build",
      [
        ...dockerArgs,
        "build",
        "--platform",
        imagePlatform,
        "--file",
        "infra/sandbox/Computer.Dockerfile",
        "--target",
        "graphical",
        "--build-arg",
        `BUN_IMAGE_DIGEST=${bases.bun}`,
        "--build-arg",
        `COMPUTER_BASE_DIGEST=${bases.computer}`,
        "--build-arg",
        `RAYPX_VALIDATION_ID=${plan.id}`,
        "--tag",
        graphicalTag,
        ".",
      ],
      env,
    );
    imageBytes.graphical = await runtime.step("graphical-image-bytes", async () => {
      const value = Number(
        await docker(["image", "inspect", "--format", "{{.Size}}", graphicalTag]),
      );
      if (!Number.isSafeInteger(value) || value <= imageBytes.default)
        throw new Error("Invalid graphical image size");
      return value;
    });
    image = await runtime.step("computer-image-id", async () => {
      const value = (await docker(["image", "inspect", "--format", "{{.Id}}", plan.image])).trim();
      if (!/^sha256:[a-f0-9]{64}$/.test(value)) throw new Error("Invalid built image ID");
      return value;
    });
    graphicalImage = await runtime.step("graphical-image-id", async () => {
      const value = (
        await docker(["image", "inspect", "--format", "{{.Id}}", graphicalTag])
      ).trim();
      if (!/^sha256:[a-f0-9]{64}$/.test(value)) throw new Error("Invalid graphical image ID");
      return value;
    });
    const port = await runtime.port();
    const url = `http://127.0.0.1:${port}`;
    const supervisorEnv: NodeJS.ProcessEnv = {
      ...env,
      SANDBOX_LISTEN_ADDRESS: "127.0.0.1",
      SANDBOX_PORT: String(port),
      SANDBOX_SUPERVISOR_TOKEN: token,
      SANDBOX_ENGINE_SOCKET: plan.socket,
      SANDBOX_STATE_DIRECTORY: directory,
      SANDBOX_COMPUTER_IMAGE: image,
      SANDBOX_GRAPHICAL: "false",
      SANDBOX_NAMESPACE: plan.namespace,
      SANDBOX_RUNTIME: plan.runtime,
      SANDBOX_HOME_BYTES: "33554432",
      SANDBOX_REAP_MS: "1000",
      SANDBOX_MEMORY_BYTES: String(plan.memory),
      SANDBOX_NANO_CPUS: "1000000000",
      SANDBOX_PIDS_LIMIT: String(plan.pids),
      SANDBOX_RESTRICTED_EGRESS: "false",
      SANDBOX_HOST_RULES_APPLIED: "false",
      SANDBOX_DNS_RESOLVER: plan.dnsResolver,
    };
    async function ready(settings: NodeJS.ProcessEnv, endpoint = url) {
      supervisor = runtime.start(
        [process.execPath, "--no-env-file", join(root, "infra/sandbox/src/main.ts")],
        settings,
      );
      const deadline = Date.now() + 30_000;
      for (let attempt = 0; attempt < 150 && Date.now() < deadline; attempt++) {
        runtime.check();
        if (!supervisor.alive()) throw new Error("Sandbox supervisor exited before readiness");
        try {
          const description = (await runtime.request(endpoint, token, "description")) as {
            screen?: boolean;
          };
          return description;
        } catch {
          await runtime.pause();
        }
      }
      throw new Error("Sandbox supervisor readiness timed out");
    }
    await runtime.step("supervisor-ready", () => ready(supervisorEnv));
    await runtime.command(
      "provider-conformance",
      [
        process.execPath,
        "--no-env-file",
        "run",
        "--cwd",
        "packages/providers",
        "test",
        "--",
        "tests/computer/conformance.test.ts",
        "--testTimeout=120000",
        "--hookTimeout=30000",
      ],
      {
        ...env,
        RAYPX_TEST_DOCKER: "1",
        SANDBOX_SUPERVISOR_URL: url,
        SANDBOX_SUPERVISOR_TOKEN: token,
      },
    );
    const id = crypto.randomUUID();
    const call = (operation: string, generation = 1, body = {}) =>
      runtime.request(url, token, `computers/${id}/${operation}`, { generation, ...body });
    let probeGeneration = 1;
    async function probe(
      script: string,
      argv: string[] = [],
      target = id,
      generation = probeGeneration,
    ) {
      const result = (await runtime.request(url, token, `computers/${target}/exec`, {
        generation,
        executionId: crypto.randomUUID(),
        command: {
          executable: "python3",
          argv: ["-I", "-c", script, ...argv],
          cwd: ".",
          environment: {},
          outputBudget: 8192,
        },
      })) as { status: number; stdout: string };
      if (result.status !== 0) throw new Error(`Computer probe exited (${result.status})`);
      return result.stdout;
    }
    const container = async () => {
      const ids = lines(
        await docker([
          "ps",
          "--quiet",
          "--filter",
          `label=raypx.supervisor=${plan.network}`,
          "--filter",
          `label=raypx.computer=${id}`,
          "--filter",
          "label=raypx.role=computer",
        ]),
      );
      if (ids.length !== 1) throw new Error("Expected one owned probe computer");
      const [value] = JSON.parse(
        await docker(["container", "inspect", ids[0]!]),
      ) as SandboxContainer[];
      if (!value || value.Config.Labels["raypx.computer"] !== id)
        throw new Error("Unowned probe computer refused");
      return value;
    };
    await runtime.step("computer-provision", async () => {
      await call("create");
    });
    const first = await runtime.step("isolation", async () => {
      const value = await container();
      assertSandboxContainer(value, plan);
      const [network] = JSON.parse(await docker(["network", "inspect", plan.network])) as {
        Driver: string;
        Options: Record<string, string>;
        Labels: Record<string, string>;
      }[];
      if (
        network?.Driver !== "bridge" ||
        network.Options["com.docker.network.bridge.name"] !== plan.bridge ||
        network.Labels["raypx.supervisor"] !== plan.network
      )
        throw new Error("Sandbox private bridge assertions failed");
      const result = JSON.parse(await probe(sandboxIsolationProbe)) as {
        memory: number;
        pids: number;
        uid: number;
        capEff: number;
        noNewPrivileges: boolean;
      };
      if (
        result.memory !== plan.memory ||
        result.pids !== plan.pids ||
        result.uid !== 1000 ||
        result.capEff !== 0 ||
        !result.noNewPrivileges
      )
        throw new Error("Sandbox in-container isolation assertions failed");
      return value;
    });
    await runtime.step("home-replacement", async () => {
      const bytes = Buffer.from(`persist-${plan.id}`).toString("base64");
      await call("files/write", 1, { path: "acceptance", bytes });
      await call("snapshot");
      await call("create", 2);
      const replacement = await container();
      assertSandboxContainer(replacement, plan);
      if (replacement.Id === first.Id) throw new Error("Home probe did not replace the container");
      const result = (await call("files/read", 2, { path: "acceptance", maxBytes: 256 })) as {
        bytes: string;
      };
      if (result.bytes !== bytes) throw new Error("Home did not persist across replacement");
    });
    probeGeneration = 2;
    await runtime.step("protected-input", async () => {
      const value = `private-${crypto.randomUUID()}-输入`;
      const result = (await call("exec", probeGeneration, {
        executionId: crypto.randomUUID(),
        command: {
          executable: "python3",
          argv: [
            "-I",
            "-c",
            "import hashlib,json,os,sys; print(json.dumps({'stdin':hashlib.sha256(sys.stdin.buffer.read()).hexdigest(),'environment':hashlib.sha256(os.environ['RAYPX_PRIVATE_INPUT'].encode()).hexdigest(),'cleared':not any(n.startswith('rpx-input-') for n in os.listdir('/run/raypx'))}))",
          ],
          cwd: ".",
          environment: { RAYPX_PRIVATE_INPUT: value },
          stdin: value,
          outputBudget: 1024,
        },
      })) as { status: number; stdout: string };
      const proof = JSON.parse(result.stdout) as {
        stdin: string;
        environment: string;
        cleared: boolean;
      };
      const digest = createHash("sha256").update(value).digest("hex");
      if (
        result.status !== 0 ||
        proof.stdin !== digest ||
        proof.environment !== digest ||
        !proof.cleared
      )
        throw new Error("Private command input delivery failed");
      const clean = JSON.parse(
        await probe(
          "import json,os,sys; print(json.dumps({'clean':'RAYPX_PRIVATE_INPUT' not in os.environ and sys.stdin.read()==''}))",
        ),
      ) as { clean: boolean };
      if (!clean.clean) throw new Error("Private command input leaked to the next command");
    });
    await runtime.step("attachment-inbox", async () => {
      const path = `inbox/${crypto.randomUUID()}/${crypto.randomUUID()}`;
      // One maximum-size attachment uses the same bounded Computer write/read port
      // as fenced backend delivery. Supplied names never become path components.
      const bytes = Buffer.alloc(1024 * 1024, 97).toString("base64");
      await call("files/write", probeGeneration, { path, bytes });
      const delivered = (await call("files/read", probeGeneration, {
        path,
        maxBytes: 1024 * 1024,
      })) as { bytes: string };
      if (delivered.bytes !== bytes) throw new Error("Computer inbox delivery failed");
    });
    if (plan.withEgress && plan.engineHostCommand) {
      if (
        (await runtime.capture([...plan.engineHostCommand, "uname", "-s"])) !== "Linux" ||
        (await runtime.capture([...plan.engineHostCommand, "id", "-u"])) !== "0"
      )
        throw new Error("Egress commands require root on the Linux Engine host");
      // The operator's explicit argv prefix executes against the Engine host.
      // That host must have the checkout mounted at the same absolute path.
      firewall = [...plan.engineHostCommand, "sh"];
    } else if (plan.withEgress && runtime.platform === "linux") {
      if (runtime.rootUser) firewall = ["sh"];
      else if (
        await runtime.capture(["sudo", "-n", "true"]).then(
          () => true,
          () => false,
        )
      )
        firewall = ["sudo", "-n", "sh"];
    }
    if (firewall) {
      await runtime.command(
        "network-peer-credentials",
        [
          ...(firewall.length > 1 ? firewall.slice(0, -1) : ["env"]),
          "python3",
          "-I",
          join(root, "packages/dev-cli/src/validation/sandbox-network-ipc.py"),
          join(root, "infra/sandbox/host-network.py"),
        ],
        env,
      );
      await runtime.command(
        "egress-apply",
        [
          ...firewall,
          join(root, "infra/sandbox/egress.sh"),
          "--bridge",
          plan.bridge,
          "--resolver",
          plan.dnsResolver,
          "--apply",
        ],
        env,
      );
      await runtime.step("network-supervisor-ready", async () => {
        await supervisor?.stop();
        Object.assign(supervisorEnv, {
          SANDBOX_NETWORK_LIMITS: "true",
          SANDBOX_NETWORK_HOST_COMMAND: JSON.stringify(
            firewall!.length > 1 ? firewall!.slice(0, -1) : ["env"],
          ),
          SANDBOX_NETWORK_HELPER: join(root, "infra/sandbox/host-network.py"),
          SANDBOX_NETWORK_STATE_DIRECTORY: `/tmp/raypx-network-${plan.id}`,
          SANDBOX_NETWORK_BYTES_PER_SECOND: "65536",
          SANDBOX_NETWORK_BURST_BYTES: "131072",
          SANDBOX_NETWORK_TRANSFER_BYTES: "524288",
          SANDBOX_NETWORK_SPACE_DAILY_BYTES: "786432",
          SANDBOX_NETWORK_CHUNK_BYTES: "65536",
          SANDBOX_NETWORK_CONNECTIONS: "8",
          SANDBOX_NETWORK_POLL_MS: "1000",
        });
        await ready(supervisorEnv);
        probeGeneration += 1;
        await call("create", probeGeneration);
      });
      egress = await runtime.step("egress-probe", async () => {
        const value = await container();
        const gateway = value.NetworkSettings.Networks[plan.network]?.Gateway;
        if (!gateway) throw new Error("Sandbox bridge gateway missing");
        if (value.HostConfig.Dns?.length !== 1 || value.HostConfig.Dns[0] !== plan.dnsResolver)
          throw new Error("Sandbox DNS upstream differs from the egress policy");
        const controlContainer = await docker([
          "run",
          "--detach",
          "--network",
          "host",
          "--read-only",
          "--cap-drop",
          "ALL",
          "--security-opt",
          "no-new-privileges:true",
          "--user",
          "1000:1000",
          "--memory",
          String(plan.memory),
          "--pids-limit",
          String(plan.pids),
          "--label",
          `raypx.supervisor=${plan.network}`,
          "--label",
          "raypx.role=egress-control",
          "--log-driver",
          "json-file",
          "--log-opt",
          "max-size=1m",
          "--log-opt",
          "max-file=1",
          image,
          "python3",
          "-c",
          sandboxEgressControl,
          plan.dnsResolver,
        ]);
        let host: { port: number; checks: Record<string, string> } | undefined;
        const deadline = Date.now() + 15_000;
        while (Date.now() < deadline) {
          runtime.check();
          const output = await docker(["logs", controlContainer]);
          if (output) {
            host = JSON.parse(output) as NonNullable<typeof host>;
            break;
          }
          await runtime.pause();
        }
        if (!host || !Number.isInteger(host.port) || host.port < 1024 || host.port > 65535)
          throw new Error("Sandbox Engine-host canary did not become ready");
        const control = host.checks;
        const counters = async () => {
          const output: string[] = [];
          for (const [binary, chain] of [
            ["iptables", `RPX_E_${plan.bridge.slice(3)}`],
            ["iptables", "INPUT"],
            ["ip6tables", "FORWARD"],
          ])
            output.push(
              await runtime.capture([
                ...firewall!.slice(0, -1),
                binary!,
                "-w",
                "-L",
                chain!,
                "-n",
                "-v",
                "-x",
              ]),
            );
          return sandboxEgressCounters(output.join("\n"), plan.bridge);
        };
        const before = await counters();
        const result = JSON.parse(
          await probe(sandboxEgressProbe, [gateway, plan.dnsResolver, String(host.port)]),
        ) as SandboxEgressResult;
        const after = await counters();
        runtime.report(`egress-evidence: ${JSON.stringify({ control, result, before, after })}`);
        return assertSandboxEgress(
          result,
          control,
          before,
          after,
          plan.runtime === "runsc" ? plan.dnsResolver : "127.0.0.11",
        );
      });
      runtime.report(`egress-probe: ${egress}`);
      await acceptSandboxNetwork(
        plan,
        runtime,
        docker,
        firewall.length > 1 ? firewall.slice(0, -1) : ["env"],
        image,
        url,
        token,
      );
    } else runtime.report(`egress-probe: ${egress}`);
    await runtime.step("privilege-and-kernel-escape", async () => {
      const result = JSON.parse(await probe(sandboxEscapeProbe)) as Record<string, boolean>;
      if (
        ["setuid", "mount", "unshare", "proc-sys", "raw-socket"].some((key) => result[key] !== true)
      )
        throw new Error("Escape probe incomplete");
      await probe(`
import os, site
path = site.getusersitepackages()
os.makedirs(path, exist_ok=True)
open(path + '/usercustomize.py', 'w').write("open('/home/computer/.rpx-startup-hook', 'w').write('loaded')")
`);
      await call("files/list", probeGeneration, { path: "", limit: 10 });
      await probe(`
import os, site
assert not os.path.exists('/home/computer/.rpx-startup-hook'), 'tenant startup hook ran in trusted helper'
os.unlink(site.getusersitepackages() + '/usercustomize.py')
`);
    });
    await runtime.step("fork-exhaustion", async () => {
      const value = await container();
      try {
        const result = JSON.parse(await probe(sandboxForkProbe, [String(plan.pids)])) as {
          forkLimited: boolean;
        };
        if (!result.forkLimited) throw new Error("PID exhaustion probe failed");
      } catch (error) {
        if (value) {
          const state = JSON.parse(
            await docker(["inspect", "--format", "{{json .State}}", value.Id]),
          ) as { Running: boolean; OOMKilled: boolean; ExitCode: number };
          runtime.report(
            `fork-evidence: ${JSON.stringify({ running: state.Running, oomKilled: state.OOMKilled, exit: state.ExitCode })}`,
          );
        }
        throw error;
      }
    });
    await runtime.step("memory-exhaustion", async () => {
      const value = await container();
      try {
        const result = JSON.parse(await probe(sandboxMemoryProbe, [String(plan.memory)])) as {
          memoryLimited: boolean;
        };
        if (!result.memoryLimited) throw new Error("Memory exhaustion probe failed");
      } catch {
        const state = JSON.parse(
          await docker(["inspect", "--format", "{{json .State}}", value.Id]),
        ) as { Running: boolean; OOMKilled: boolean };
        runtime.report(
          `memory-evidence: ${JSON.stringify({ running: state.Running, oomKilled: state.OOMKilled })}`,
        );
        if (!state.OOMKilled) throw new Error("Memory exhaustion was not contained by the cgroup");
        runtime.report(
          "memory-evidence: cgroup OOM containment verified; replacing from committed home",
        );
        probeGeneration += 1;
        await call("create", probeGeneration);
      }
    });
    await runtime.step("cross-sandbox-network", async () => {
      const peerId = crypto.randomUUID();
      await runtime.request(url, token, `computers/${peerId}/create`, {
        generation: 1,
        spaceId: crypto.randomUUID(),
      });
      const [peer] = lines(
        await docker([
          "ps",
          "--quiet",
          "--filter",
          `label=raypx.supervisor=${plan.network}`,
          "--filter",
          `label=raypx.computer=${peerId}`,
          "--filter",
          "label=raypx.role=computer",
        ]),
      );
      if (!peer) throw new Error("Owned peer missing");
      const [inspection] = JSON.parse(
        await docker(["container", "inspect", peer]),
      ) as (SandboxContainer & {
        NetworkSettings: { Networks: Record<string, { IPAddress: string }> };
      })[];
      if (inspection?.Config.Labels["raypx.supervisor"] !== plan.network)
        throw new Error("Unowned peer refused");
      const address = inspection.NetworkSettings.Networks[plan.network]?.IPAddress;
      if (!address) throw new Error("Peer address missing");
      const peerProcess = probe(
        "import socket,time; s=socket.socket(); s.bind(('0.0.0.0',18080)); s.listen(); time.sleep(30)",
        [],
        peerId,
        1,
      ).catch(() => {});
      // Prove the canary is listening inside its own sandbox before testing the boundary.
      let listening = false;
      for (let attempt = 0; attempt < 30 && !listening; attempt++) {
        listening = await probe(
          "import socket; s=socket.create_connection(('127.0.0.1',18080),1); s.close()",
          [],
          peerId,
          1,
        ).then(
          () => true,
          () => false,
        );
        if (!listening) await runtime.pause();
      }
      if (!listening) throw new Error("Peer canary unavailable");
      const result = JSON.parse(await probe(sandboxCrossNetworkProbe, [address, "18080"])) as {
        crossSandboxBlocked: boolean;
      };
      if (!result.crossSandboxBlocked) throw new Error("Cross-sandbox boundary failed");
      await runtime.request(url, token, `computers/${peerId}/destroy`, { generation: 1 });
      await peerProcess;
    });
    await runtime.step("disk-exhaustion-stop", async () => {
      const value = await container();
      await probe(sandboxDiskProbe).catch(() => {});
      let stopped = false;
      for (let attempt = 0; attempt < 100 && !stopped; attempt++) {
        const state = (await call("get", probeGeneration)) as { state: string };
        stopped = state.state === "stopped";
        if (!stopped) await runtime.pause();
      }
      if (!stopped) throw new Error("Disk overrun did not stop compute");
      const state = JSON.parse(
        await docker(["inspect", "--format", "{{json .State}}", value.Id]),
      ) as { Running: boolean };
      if (state.Running) throw new Error("Disk overrun left Engine compute running");
    });
    await runtime.step("unlinked-disk-exhaustion-stop", async () => {
      probeGeneration += 1;
      await call("create", probeGeneration);
      const value = await container();
      const writing = probe(sandboxUnlinkedDiskProbe).catch(() => {});
      let stopped = false;
      for (let attempt = 0; attempt < 100 && !stopped; attempt++) {
        const state = (await call("get", probeGeneration)) as { state: string };
        stopped = state.state === "stopped";
        if (!stopped) await runtime.pause();
      }
      if (!stopped) throw new Error("Open unlinked writes escaped storage containment");
      const state = JSON.parse(
        await docker(["inspect", "--format", "{{json .State}}", value.Id]),
      ) as { Running: boolean };
      if (state.Running) throw new Error("Open unlinked writes left compute running");
      await writing;
    });
    await supervisor?.stop();
    await runtime.command(
      "lifecycle-acceptance",
      [
        process.execPath,
        "--no-env-file",
        join(root, "packages/dev-cli/src/validation/sandbox-lifecycle.ts"),
      ],
      { ...supervisorEnv, SANDBOX_VALIDATION_ROOT: root },
    );
    // Lifecycle recovery deliberately reaps the earlier phase's owned resources.
    // Never reuse that phase's stale volume references: Engine mounts can otherwise
    // auto-create unlabeled empty volumes while metering a stopped record.
    await runtime.step("graphical-state-reset", async () => {
      await runtime.removeTemporary(directory!);
      directory = await runtime.temporary();
      supervisorEnv.SANDBOX_STATE_DIRECTORY = directory;
    });
    // Optional Screen acceptance has its own result. Headless safety acceptance
    // must not claim graphical support or hide its unavailable runtime/image.
    await supervisor?.stop();
    const graphicalPort = await runtime.port();
    const graphicalUrl = `http://127.0.0.1:${graphicalPort}`;
    try {
      const description = await runtime.step("graphical-supervisor-ready", () =>
        ready(
          {
            ...supervisorEnv,
            SANDBOX_PORT: String(graphicalPort),
            SANDBOX_COMPUTER_IMAGE: graphicalImage,
            SANDBOX_GRAPHICAL: "true",
          },
          graphicalUrl,
        ),
      );
      if (!description.screen)
        graphical =
          "unavailable: GRAPHICAL_RUNTIME_UNAVAILABLE (startup image/runtime screen probe failed; capability disabled)";
      else {
        await runtime.command(
          "graphical-conformance",
          [
            process.execPath,
            "--no-env-file",
            "run",
            "--cwd",
            "packages/providers",
            "test",
            "--",
            "tests/computer/conformance.test.ts",
            "--testNamePattern=gates graphical",
            "--testTimeout=120000",
            "--hookTimeout=30000",
          ],
          {
            ...env,
            RAYPX_TEST_DOCKER: "1",
            SANDBOX_SUPERVISOR_URL: graphicalUrl,
            SANDBOX_SUPERVISOR_TOKEN: token,
          },
        );
        graphical =
          "passed: session start, bounded 1024x768 PNG, input changes pixels, stream closes on stop (graphical conformance)";
      }
    } catch {
      runtime.check();
      graphical =
        "unavailable: GRAPHICAL_RUNTIME_UNAVAILABLE (optional graphical conformance failed; see graphical-conformance or supervisor log)";
    }
    runtime.report(`graphical: ${graphical}`);
    outcome = {
      runtime: plan.runtime,
      image,
      graphicalImage,
      imageBytes,
      graphical,
      bases,
      egress,
      engine,
    };
  } catch (error) {
    failed = true;
    primaryFailure = error;
  } finally {
    // Stop request production first; always attempt every remaining cleanup even if one fails.
    for (const [label, action] of [
      [
        "supervisor-stop",
        async () => {
          await supervisor?.stop();
        },
      ],
      [
        "engine-cleanup",
        async () => {
          // A daemon-side create can complete after its supervisor connection was killed.
          // Re-scan the exact run label after settling, retrying transient remove failures.
          let failure: unknown;
          for (let attempt = 0; attempt < 3; attempt++) {
            try {
              await cleanupSandbox(plan, docker);
              failure = undefined;
            } catch (error) {
              failure = error;
            }
            if (attempt < 2) await runtime.pause();
          }
          if (failure) throw failure;
        },
      ],
      [
        "network-remove",
        async () => {
          if (firewall) {
            const prefix = firewall.length > 1 ? firewall.slice(0, -1) : ["env"];
            await runtime.capture([
              ...prefix,
              "python3",
              "-I",
              join(root, "infra/sandbox/host-network.py"),
              "request",
              `/tmp/raypx-network-${plan.id}`,
              Buffer.from(
                JSON.stringify({
                  operation: "clear",
                  namespace: plan.namespace,
                  bridge: plan.bridge,
                }),
              ).toString("base64"),
            ]);
          }
        },
      ],
      [
        "egress-remove",
        async () => {
          if (firewall)
            await runtime.capture([
              ...firewall,
              join(root, "infra/sandbox/egress.sh"),
              "--bridge",
              plan.bridge,
              "--resolver",
              plan.dnsResolver,
              "--remove",
            ]);
        },
      ],
      [
        "state-remove",
        async () => {
          if (directory) await runtime.removeTemporary(directory);
        },
      ],
    ] as const) {
      try {
        await runtime.step(label, action);
      } catch (error) {
        cleanupErrors.push(error);
      }
    }
  }
  if (cleanupErrors.length)
    throw new AggregateError(
      failed ? [primaryFailure, ...cleanupErrors] : cleanupErrors,
      "Sandbox cleanup failed; inspect step evidence",
    );
  if (failed) throw primaryFailure;
  if (!outcome) throw new Error("Sandbox acceptance did not complete");
  return outcome;
}

async function capture(args: string[]) {
  const child = Bun.spawn(args, { stdout: "pipe", stderr: "ignore", env: process.env });
  const timer = setTimeout(() => child.kill("SIGKILL"), 30_000);
  try {
    const [code, output] = await Promise.all([child.exited, new Response(child.stdout).text()]);
    if (code)
      throw new Error(
        `Sandbox ${args[0] === "docker" ? "Docker" : "host"} operation failed (${code})`,
      );
    return output.trim();
  } finally {
    clearTimeout(timer);
  }
}

export async function runSandboxValidation(root: string, args: string[]) {
  const plan = sandboxPlan(
    args,
    process.env,
    crypto.randomUUID().replaceAll("-", ""),
    readBunPin(root),
  );
  const evidence = new Evidence(root, `sandbox-hosting/${plan.runtime}`);
  await evidence.run(async () => {
    let result: Awaited<ReturnType<typeof executeSandbox>> | undefined;
    try {
      result = await executeSandbox(root, plan, {
        platform: process.platform,
        rootUser: process.getuid?.() === 0,
        hasDocker: () => Boolean(Bun.which("docker")),
        capture,
        command: (label, argv, env) => evidence.command(label, argv, env),
        start: (argv, env) => evidence.start("supervisor", argv, env),
        step: (label, operation) => evidence.measure(label, operation),
        async request(url, token, operation, body) {
          const response = await fetch(`${url}/${operation}`, {
            method: body ? "POST" : "GET",
            headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
            ...(body ? { body: JSON.stringify(body) } : {}),
            signal: AbortSignal.timeout(operation === "description" ? 1000 : 30_000),
          });
          if (!response.ok) {
            const reason = (await response.json().catch(() => ({}))) as { code?: string };
            const code =
              reason.code && /^[A-Z_]{1,64}$/.test(reason.code) ? `: ${reason.code}` : "";
            throw new Error(
              `Supervisor ${operation.split("/").at(-1)} failed (${response.status})${code}`,
            );
          }
          if (operation.endsWith("/exec")) {
            const reader = response.body!.getReader();
            const chunks: Uint8Array[] = [];
            let size = 0;
            try {
              while (true) {
                const item = await reader.read();
                if (item.done) break;
                size += item.value.byteLength;
                if (size > 65536) throw new Error("Probe response exceeded its budget");
                chunks.push(item.value);
              }
            } finally {
              await reader.cancel().catch(() => {});
            }
            const stdout: Buffer[] = [];
            let status: number | undefined;
            for (const line of Buffer.concat(chunks).toString("utf8").split("\n").filter(Boolean)) {
              const event = JSON.parse(line) as { kind: string; bytes?: string; status?: number };
              if (event.kind === "stdout" && event.bytes)
                stdout.push(Buffer.from(event.bytes, "base64"));
              if (event.kind === "exit") status = event.status;
            }
            if (status === undefined) throw new Error("Computer probe ended without an exit");
            return { status, stdout: Buffer.concat(stdout).toString("utf8") };
          }
          return response.json();
        },
        temporary: () => mkdtemp(join(tmpdir(), "raypx-sandbox-")),
        removeTemporary: (path) => rm(path, { recursive: true, force: true }),
        async port() {
          const server = Bun.serve({
            hostname: "127.0.0.1",
            port: 0,
            fetch: () => new Response(null),
          });
          const port = server.port!;
          await server.stop(true);
          return port;
        },
        pause: () => Bun.sleep(200),
        check: () => evidence.check(),
        report: console.log,
      });
    } finally {
      await writeFile(
        join(evidence.directory, "results.json"),
        JSON.stringify(
          {
            run: plan.id,
            platform: `${process.platform}/${process.arch}`,
            passed: Boolean(result),
            ...(result ?? { egress: "not completed" }),
          },
          null,
          2,
        ),
        { mode: 0o600 },
      );
    }
  });
}
