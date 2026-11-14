import { mkdtemp, rm, writeFile } from "node:fs/promises";
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
        // --volumes removes anonymous helper volumes, never unrelated named volumes.
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
      await docker(["image", "rm", id]);
    }
  });
  if (failures.length) throw new Error(`Sandbox cleanup failed: ${failures.join(", ")}`);
}

export async function executeSandbox(
  root: string,
  plan: SandboxPlan,
  runtime: SandboxRuntime,
): Promise<{
  image: string;
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
  let egress = "not run (requires --with-egress and Linux root or passwordless sudo)";
  const cleanupErrors: unknown[] = [];
  let failed = false;
  let primaryFailure: unknown;
  let outcome:
    | {
        image: string;
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
        "--label",
        `raypx.validation=${plan.id}`,
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
        "--label",
        `raypx.validation=${plan.id}`,
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
      const value = (
        await docker(["image", "inspect", "--format", "{{.Id}}", graphicalTag])
      ).trim();
      if (!/^sha256:[a-f0-9]{64}$/.test(value)) throw new Error("Invalid built image ID");
      return value;
    });
    const port = await runtime.port();
    const url = `http://127.0.0.1:${port}`;
    const supervisorEnv = {
      ...env,
      SANDBOX_LISTEN_ADDRESS: "127.0.0.1",
      SANDBOX_PORT: String(port),
      SANDBOX_SUPERVISOR_TOKEN: token,
      SANDBOX_ENGINE_SOCKET: plan.socket,
      SANDBOX_STATE_DIRECTORY: directory,
      SANDBOX_COMPUTER_IMAGE: image,
      SANDBOX_GRAPHICAL: "true",
      SANDBOX_NAMESPACE: plan.namespace,
      SANDBOX_MEMORY_BYTES: String(plan.memory),
      SANDBOX_NANO_CPUS: "1000000000",
      SANDBOX_PIDS_LIMIT: String(plan.pids),
      SANDBOX_RESTRICTED_EGRESS: "false",
      SANDBOX_HOST_RULES_APPLIED: "false",
      SANDBOX_DNS_RESOLVER: plan.dnsResolver,
    };
    await runtime.step("supervisor-ready", async () => {
      supervisor = runtime.start(
        [process.execPath, "--no-env-file", join(root, "infra/sandbox/src/main.ts")],
        supervisorEnv,
      );
      const deadline = Date.now() + 30_000;
      for (let attempt = 0; attempt < 150 && Date.now() < deadline; attempt++) {
        runtime.check();
        if (!supervisor.alive()) throw new Error("Sandbox supervisor exited before readiness");
        try {
          await runtime.request(url, token, "description");
          return;
        } catch {
          await runtime.pause();
        }
      }
      throw new Error("Sandbox supervisor readiness timed out");
    });
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
    const container = async () => {
      const ids = lines(
        await docker([
          "ps",
          "--quiet",
          "--filter",
          `label=raypx.supervisor=${plan.network}`,
          "--filter",
          `label=raypx.computer=${id}`,
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
      const result = JSON.parse(
        await docker(["exec", value.Id, "python3", "-c", sandboxIsolationProbe]),
      ) as { memory: number; pids: number; uid: number; capEff: number; noNewPrivileges: boolean };
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
          await docker([
            "exec",
            value.Id,
            "python3",
            "-c",
            sandboxEgressProbe,
            gateway,
            plan.dnsResolver,
            String(host.port),
          ]),
        ) as SandboxEgressResult;
        const after = await counters();
        runtime.report(`egress-evidence: ${JSON.stringify({ control, result, before, after })}`);
        return assertSandboxEgress(result, control, before, after);
      });
      runtime.report(`egress-probe: ${egress}`);
    } else runtime.report(`egress-probe: ${egress}`);
    outcome = {
      image,
      imageBytes,
      graphical:
        "passed: session start, bounded 1024x768 PNG, input changes pixels, stream closes on stop (provider conformance)",
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
  const evidence = new Evidence(root, "sandbox");
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
          if (!response.ok)
            throw new Error(
              `Supervisor ${operation.split("/").at(-1)} failed (${response.status})`,
            );
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
