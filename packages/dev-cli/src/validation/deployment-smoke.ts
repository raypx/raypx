import { chmod, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { deploymentServices } from "@raypx/tooling/build/deployment";
import { releaseMetadataFile } from "@raypx/tooling/build/release";
import { checkApi, checkWeb, checkDeploymentSession } from "../smoke/checks.js";
import { Evidence } from "./evidence.js";

export function deploymentSmokePlatform(args: string[]): string {
  if (!args.length) return "linux/amd64";
  if (
    args.length === 2 &&
    args[0] === "--platform" &&
    ["linux/amd64", "linux/arm64"].includes(args[1]!)
  )
    return args[1]!;
  throw new Error("Usage: raypx-dev deployment:smoke [--platform linux/amd64|linux/arm64]");
}

class DeploymentDockerError extends Error {
  constructor(operation: string, code: number) {
    super("Docker " + operation + " failed (" + code + ")");
  }
}

async function docker(args: string[], timeoutMs = 30_000): Promise<string> {
  const child = Bun.spawn(["docker", ...args], {
    env: process.env,
    stdout: "pipe",
    stderr: "pipe",
  });
  const timer = setTimeout(() => child.kill(), timeoutMs);
  try {
    const [code, output] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ]);
    if (code) throw new DeploymentDockerError(args[0]!, code);
    return output.trim();
  } finally {
    clearTimeout(timer);
  }
}

async function untilReady(evidence: Evidence, probe: () => Promise<boolean>) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    evidence.check();
    if (await probe().catch(() => false)) return;
    await Bun.sleep(200);
  }
  throw new Error("Deployment service readiness timed out");
}

/** Build and exercise owned local images only; no operator env files, databases or accounts. */
export async function smokeDeployment(root: string, args: string[]) {
  const platform = deploymentSmokePlatform(args);
  const id = crypto.randomUUID().replaceAll("-", "").slice(0, 12);
  const project = `raypx-deployment-${id}`,
    release = `${project}-smoke`;
  const evidence = new Evidence(root, "deployment");
  const fixtureBundle = join(evidence.directory, "deployment-fixture.mjs");
  const images = {
    composeMigrate: `raypx/api-migrate:${release}`,
    composeApi: `raypx/api:${release}`,
    composeWeb: `raypx/web:${release}`,
    railwayApi: `${project}/api:smoke`,
    railwayWeb: `${project}/web:smoke`,
    gateway: `${project}/gateway:smoke`,
  };
  const containers = new Set<string>();
  const network = project,
    ingress = `${project}-ingress`,
    builder = project;
  const origin = "https://deployment.example.invalid";
  const password = `${crypto.randomUUID()}-${crypto.randomUUID()}`;
  const dbName = `raypx_deployment_${id}_test`;
  const database = `postgres://deployment:${password}@${project}-db:5432/${dbName}`;
  const fixture = {
    origin,
    email: `deployment-${id}@example.invalid`,
    password: crypto.randomUUID(),
  };
  const outcomes: { profile: string; passed: boolean }[] = [];
  let ownedNetwork = false,
    ownedIngress = false,
    ownedBuilder = false;
  await evidence.run(async () => {
    const containerArgs = (
      name: string,
      image: string,
      environment: Record<string, string>,
      extra: string[] = [],
      command: string[] = [],
      containerNetwork = network,
    ) => {
      containers.add(name);
      return [
        "--platform",
        platform,
        "--name",
        name,
        "--label",
        `raypx.validation=${id}`,
        "--network",
        containerNetwork,
        ...Object.entries(environment).flatMap(([key, value]) => ["-e", `${key}=${value}`]),
        ...extra,
        image,
        ...command,
      ];
    };
    const start = async (...parameters: Parameters<typeof containerArgs>) => {
      evidence.check();
      await docker(["run", "--detach", ...containerArgs(...parameters)]);
    };
    const once = async (label: string, ...parameters: Parameters<typeof containerArgs>) => {
      await evidence.command(label, ["docker", "run", "--rm", ...containerArgs(...parameters)]);
      containers.delete(parameters[0]);
    };
    const stop = async (name: string) => {
      const exists = await docker(["container", "inspect", "--format", "{{.Id}}", name]).then(
        () => true,
        () => false,
      );
      if (exists) await docker(["rm", "-fv", name]);
      containers.delete(name);
    };
    const cleanup: string[] = [];
    let failed = false;
    let failure: unknown;
    let failureLabel = "";
    try {
      await evidence.command("fixture-bundle", [
        process.execPath,
        "--no-env-file",
        "run",
        "--cwd",
        "apps/api",
        "deployment:fixture:build",
        "--outfile",
        fixtureBundle,
      ]);
      await chmod(fixtureBundle, 0o644);
      await evidence.measure("docker-setup", async () => {
        await docker(["info", "--format", "{{.OSType}}"]);
        await docker([
          "network",
          "create",
          "--ipv6",
          "--internal",
          "--label",
          `raypx.validation=${id}`,
          network,
        ]);
        ownedNetwork = true;
        await docker(["network", "create", "--label", `raypx.validation=${id}`, ingress]);
        ownedIngress = true;
        await docker([
          "buildx",
          "create",
          "--name",
          builder,
          "--driver",
          "docker-container",
          "--driver-opt",
          "memory=3g",
          "--driver-opt",
          "memory-swap=4g",
          "--driver-opt",
          "cpu-quota=200000",
          "--driver-opt",
          "cpu-period=100000",
        ]);
        ownedBuilder = true;
      });
      await evidence.command("compose-build", ["sh", "deploy/build.sh"], {
        ...process.env,
        COMPOSE_PROJECT_NAME: project,
        APP_HOST: new URL(origin).hostname,
        RAYPX_RELEASE: "smoke",
        RAYPX_BUILD_BUILDER: builder,
        DOCKER_DEFAULT_PLATFORM: platform,
      });
      for (const [label, file, image] of [
        ["railway-api", "apps/api/Dockerfile", images.railwayApi],
        ["railway-web", "apps/web/Dockerfile", images.railwayWeb],
        ["gateway", "infra/railway/Dockerfile", images.gateway],
      ]) {
        await evidence.command(`${label}-build`, [
          "docker",
          "buildx",
          "build",
          "--builder",
          builder,
          "--platform",
          platform,
          "--load",
          "--progress",
          "plain",
          "--file",
          file!,
          "--build-arg",
          `VITE_APP_RELEASE=${release}`,
          "--build-arg",
          `VITE_API_URL=${origin}`,
          "--tag",
          image!,
          ".",
        ]);
      }
      // Resolve mutable test tags once; all test containers run their immutable image digest.
      const pinned = async (tag: string) => {
        await evidence.command(`${tag.startsWith("postgres") ? "postgres" : "redis"}-pull`, [
          "docker",
          "pull",
          "--platform",
          platform,
          tag,
        ]);
        return docker(["image", "inspect", "--format", "{{index .RepoDigests 0}}", tag]);
      };
      await start(
        `${project}-db`,
        await pinned("postgres:17-alpine"),
        {
          POSTGRES_USER: "deployment",
          POSTGRES_PASSWORD: password,
          POSTGRES_DB: dbName,
        },
        ["--tmpfs", "/var/lib/postgresql/data", "--memory", "512m"],
      );
      await untilReady(evidence, async () => {
        // The entrypoint's temporary init server only listens on a Unix socket.
        await docker([
          "exec",
          `${project}-db`,
          "pg_isready",
          "-h",
          "127.0.0.1",
          "-U",
          "deployment",
          "-d",
          dbName,
        ]);
        return true;
      });
      for (const profile of ["compose", "railway"] as const) {
        evidence.check();
        if (profile === "railway") {
          await start(
            `${project}-redis`,
            await pinned("valkey/valkey:8-alpine"),
            {},
            ["--memory", "256m"],
            ["valkey-server", "--save", "", "--appendonly", "no"],
          );
        }
        const migrate = profile === "compose" ? images.composeMigrate : images.railwayApi;
        await once(
          `${profile}-migrate`,
          `${project}-${profile}-migrate`,
          migrate,
          { DATABASE_URL: database },
          [],
          profile === "railway" ? ["bun", "run", "--cwd", "packages/database", "migrate"] : [],
        );
        if (profile === "compose")
          await once(
            "account-fixture",
            `${project}-fixture`,
            images.composeMigrate,
            {
              TEST_DATABASE_URL: database,
              RAYPX_DEPLOYMENT_FIXTURE: "1",
              FIXTURE_ORIGIN: origin,
              FIXTURE_EMAIL: fixture.email,
              FIXTURE_PASSWORD: fixture.password,
            },
            ["--mount", `type=bind,src=${fixtureBundle},dst=/deployment-fixture.mjs,readonly`],
            ["bun", "--no-env-file", "/deployment-fixture.mjs"],
          );
        const activeContainers = await evidence.measure(`${profile}-acceptance`, async () => {
          const api = `${project}-api`,
            web = `${project}-web`,
            gateway = `${project}-gateway`;
          await start(
            api,
            profile === "compose" ? images.composeApi : images.railwayApi,
            {
              NODE_ENV: "production",
              DATABASE_URL: database,
              AUTH_URL: origin,
              AUTH_SECRET: password,
              ALLOWED_ORIGINS: origin,
              JOBS_ENABLED: "false",
              HOST: profile === "railway" ? "::" : "0.0.0.0",
              SERVER_ROLE: "both",
              ...(profile === "railway" ? { REDIS_URL: `redis://${project}-redis:6379` } : {}),
            },
            ["--memory", "768m"],
          );
          await start(
            web,
            profile === "compose" ? images.composeWeb : images.railwayWeb,
            { HOST: profile === "railway" ? "::" : "0.0.0.0" },
            ["--memory", "512m"],
          );
          await start(
            gateway,
            images.gateway,
            {
              PORT: String(deploymentServices.gateway.port),
              API_UPSTREAM: `${api}:${deploymentServices.api.port}`,
              WEB_UPSTREAM: `${web}:${deploymentServices.web.port}`,
            },
            ["-p", `127.0.0.1::${deploymentServices.gateway.port}`, "--memory", "128m"],
            [],
            ingress,
          );
          await docker(["network", "connect", network, gateway]);
          const address = await docker(["port", gateway, `${deploymentServices.gateway.port}/tcp`]);
          if (!/^127\.0\.0\.1:\d+$/.test(address))
            throw new Error("Deployment probe must stay on loopback");
          const base = `http://${address}`;
          await untilReady(
            evidence,
            async () => (await fetch(`${base}/ready`, { signal: AbortSignal.timeout(3000) })).ok,
          );
          const ready = (await (await fetch(`${base}/ready`)).json()) as {
            checks: Record<string, string>;
          };
          if (
            ready.checks.database !== "ok" ||
            ready.checks.relay !== "ok" ||
            (profile === "railway" ? ready.checks.redis !== "ok" : "redis" in ready.checks)
          )
            throw new Error("Deployment dependency readiness failed");
          await checkWeb(base);
          await checkApi(base, { origin, gateway: true });
          await checkDeploymentSession(base, fixture);
          const metadata = (await (
            await fetch(`${base}/assets/${releaseMetadataFile}`)
          ).json()) as {
            release: string;
            surface: string;
          };
          if (metadata.release !== release || metadata.surface !== "web")
            throw new Error("Deployment assets have the wrong release metadata");
          outcomes.push({ profile, passed: true });
          console.log(
            `${profile}: migration, readiness, SSR, assets, login, cookie and Relay passed`,
          );
          return [gateway, web, api];
        });
        await evidence.measure(`${profile}-containers-stop`, async () => {
          for (const name of activeContainers) await stop(name);
        });
      }
    } catch (error) {
      failed = true;
      failure = error;
      failureLabel =
        error instanceof DeploymentDockerError ? error.message : "Deployment probe failed";
      for (const name of containers) {
        try {
          await evidence.command(`${name}-logs`, ["docker", "logs", "--tail", "80", name]);
        } catch {
          // Diagnostics are best-effort; cleanup and the original failure still take precedence.
        }
      }
    } finally {
      for (const name of containers) {
        try {
          await evidence.measure(`cleanup-${name}`, () => stop(name));
        } catch {
          cleanup.push("container");
        }
      }
      for (const [name, owned] of [
        [ingress, ownedIngress],
        [network, ownedNetwork],
      ] as const) {
        if (owned)
          try {
            await evidence.measure(`cleanup-network-${name}`, () =>
              docker(["network", "rm", name]),
            );
          } catch {
            cleanup.push("network");
          }
      }
      if (ownedBuilder) {
        try {
          await evidence.measure("cleanup-builder", () =>
            docker(["buildx", "rm", "--force", builder], 120_000),
          );
        } catch {
          cleanup.push("builder");
        }
      }
      for (const [label, image] of Object.entries(images)) {
        try {
          await evidence.measure(`cleanup-image-${label}`, async () => {
            const exists = await docker(["image", "inspect", "--format", "{{.Id}}", image]).then(
              () => true,
              () => false,
            );
            if (exists) await docker(["image", "rm", image]);
          });
        } catch {
          cleanup.push("image");
        }
      }
      await writeFile(
        join(evidence.directory, "results.json"),
        JSON.stringify(
          { platform, outcomes, cleanup, ...(failed ? { failure: failureLabel } : {}) },
          null,
          2,
        ),
      );
    }
    if (cleanup.length)
      throw new AggregateError(
        failed ? [failure] : [],
        (failed ? failureLabel + "; " : "") +
          "Deployment validation cleanup failed; see " +
          evidence.directory,
      );
    if (failed) throw failure;
  });
}
