import { chmod, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { apiIngress, deploymentServices } from "@raypx/tooling/build/deployment";
import { releaseMetadataFile } from "@raypx/tooling/build/release";
import { checkApi, checkWeb, checkDeploymentSession } from "../smoke/checks.js";
import { Evidence } from "./evidence.js";

export function assertDeploymentReadiness(
  profile: "compose" | "railway",
  checks: Record<string, string>,
) {
  const required = profile === "railway" ? ["database", "redis", "relay"] : ["database"];
  if (
    required.some((name) => checks[name] !== "ok") ||
    (profile === "compose" && ("redis" in checks || "relay" in checks))
  )
    throw new Error("Deployment dependency readiness failed");
}

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
  if (args.includes("--local-production")) {
    const { smokeLocalProduction } = await import("./deployment-production.js");
    return smokeLocalProduction(
      root,
      args.filter((arg) => arg !== "--local-production"),
    );
  }
  if (args.includes("--public-url")) {
    const { values } = parseArgs({
      args,
      strict: true,
      options: {
        "public-url": { type: "string" },
        "api-public-url": { type: "string" },
      },
    });
    if (!values["public-url"]) throw new Error("--public-url requires an exact public origin");
    return smokePublicDeployment(values["public-url"], values["api-public-url"]);
  }
  const platform = deploymentSmokePlatform(args);
  const id = crypto.randomUUID().replaceAll("-", "").slice(0, 12);
  const project = `raypx-deployment-${id}`,
    release = `${project}-smoke`;
  const evidence = new Evidence(root, "deployment");
  const buildOutput = process.env.GITHUB_ACTIONS === "true" ? "inherit" : "log";
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
  const runtimePassword = crypto.randomUUID().replaceAll("-", "");
  const runtimeDatabase = `postgres://raypx_runtime:${runtimePassword}@${project}-db:5432/${dbName}`;
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
      await evidence.command(
        "compose-build",
        ["sh", "deploy/build.sh"],
        {
          ...process.env,
          COMPOSE_PROJECT_NAME: project,
          APP_HOST: new URL(origin).hostname,
          RAYPX_RELEASE: "smoke",
          RAYPX_BUILD_BUILDER: builder,
          RAYPX_BUILD_INSTALL_CACHE_MOUNTS: "0",
          DOCKER_DEFAULT_PLATFORM: platform,
          BUILDKIT_PROGRESS: "plain",
        },
        buildOutput,
      );
      const releaseArg = `VITE_APP_RELEASE=${release}`;
      for (const [label, file, image, buildArgs] of [
        ["railway-api", "apps/api/Dockerfile", images.railwayApi, ["--build-arg", releaseArg]],
        ["railway-web", "apps/web/Dockerfile", images.railwayWeb, ["--build-arg", releaseArg]],
        ["gateway", "infra/railway/Dockerfile", images.gateway, []],
      ] as const) {
        await evidence.command(
          `${label}-build`,
          [
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
            file,
            ...buildArgs,
            "--tag",
            image,
            ".",
          ],
          process.env,
          buildOutput,
        );
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
          {
            DATABASE_URL: database,
            DB_MIGRATE_RUNTIME_USER: "raypx_runtime",
            DB_MIGRATE_RUNTIME_PASSWORD: runtimePassword,
          },
          [],
          profile === "railway" ? ["bun", "run", "--cwd", "apps/api", "db:migrate"] : [],
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
              DATABASE_URL: runtimeDatabase,
              DATABASE_MIGRATE_ON_START: "false",
              PUBLIC_URL: origin,
              AUTH_SECRET: password,
              APP_KEY: `${crypto.randomUUID()}-${crypto.randomUUID()}`,
              JOBS_ENABLED: "false",
              HOST: profile === "railway" ? "::" : "0.0.0.0",
              SERVER_ROLE: "all",
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
          assertDeploymentReadiness(profile, ready.checks);
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

function smokeOrigin(value: string) {
  if (!/^https?:\/\/[^/?#\\\s@*]+$/.test(value))
    throw new Error(
      "Deployment smoke requires an exact HTTP(S) origin without credentials or a path",
    );
  return new URL(value).origin;
}

/** A real HTTP/1.1 WebSocket handshake; rejected upgrades keep their HTTP headers. */
export function deploymentUpgrade(url: string, headers: Record<string, string> = {}) {
  return new Promise<{ status: number; headers: Headers }>((resolve, reject) => {
    const request = (url.startsWith("https:") ? httpsRequest : httpRequest)(url, {
      method: "GET",
      agent: false,
      headers: {
        connection: "Upgrade",
        upgrade: "websocket",
        "sec-websocket-version": "13",
        "sec-websocket-key": Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString(
          "base64",
        ),
        ...headers,
      },
    });
    const finish = (status: number | undefined, raw: import("node:http").IncomingHttpHeaders) => {
      const result = new Headers();
      for (const [name, value] of Object.entries(raw))
        if (value !== undefined) result.set(name, Array.isArray(value) ? value.join(", ") : value);
      resolve({ status: status ?? 0, headers: result });
    };
    request.on("response", (response) => {
      finish(response.statusCode, response.headers);
      response.resume();
    });
    request.on("upgrade", (response, socket) => {
      finish(response.statusCode, response.headers);
      socket.destroy();
    });
    request.on("error", reject);
    request.setTimeout(5_000, () => request.destroy(new Error("WebSocket probe timed out")));
    request.end();
  });
}

/** Credential-free probes for an already deployed public ingress. No provisioning or writes. */
export async function smokePublicDeployment(
  publicUrl: string,
  apiPublicUrl?: string,
  report: (message: string) => void = console.log,
) {
  const web = smokeOrigin(publicUrl),
    api = smokeOrigin(apiPublicUrl || publicUrl);
  const failures: string[] = [];
  async function check(name: string, probe: () => Promise<void>) {
    try {
      await probe();
      report(`PASS ${name}`);
    } catch (error) {
      const detail =
        error instanceof Error ? error.message.replace(/[\r\n]+/g, " ") : "request failed";
      const message = `FAIL ${name}: ${detail}`;
      failures.push(message);
      report(message);
    }
  }
  const read = (url: string) =>
    fetch(url, { redirect: "manual", signal: AbortSignal.timeout(5_000) });
  function identity(response: { headers: Headers }, service: "api" | "web") {
    if (response.headers.get("x-raypx-service") !== service)
      throw new Error(`missing x-raypx-service: ${service}; check ingress forwarding`);
  }
  function status(actual: number, expected: number) {
    if (actual !== expected) throw new Error(`expected HTTP ${expected}, received ${actual}`);
  }
  await check("web-root", async () => {
    const response = await read(web + "/");
    identity(response, "web");
    status(response.status, 200);
    const body = await response.text();
    const bootstrap = /window\.__RAYPX_PUBLIC_CONFIG__=(\{[^<]*?\})(?:;|<)/.exec(body)?.[1];
    if (!bootstrap) throw new Error("missing Web runtime public configuration");
    const configured = (JSON.parse(bootstrap) as { API_PUBLIC_URL?: string }).API_PUBLIC_URL;
    if ((configured || web) !== api)
      throw new Error(
        "Web API_PUBLIC_URL disagrees with --api-public-url; configure the same API_PUBLIC_URL on both services",
      );
  });
  for (const prefix of apiIngress.prefixes) {
    await check(`api-ingress:${prefix}`, async () => {
      const path =
        prefix === "/page-content/"
          ? `${prefix}public/deployment-smoke-missing`
          : `${prefix}deployment-smoke-missing`;
      const response = await read(api + path);
      identity(response, "api");
      if (response.status >= 500) throw new Error(`API returned HTTP ${response.status}`);
      await response.body?.cancel();
    });
  }
  for (const path of apiIngress.paths) {
    await check(`api-ingress:${path}`, async () => {
      const response = await read(api + path);
      identity(response, "api");
      if (path === "/health" || path === "/ready") status(response.status, 200);
      else if (response.status >= 500) throw new Error(`API returned HTTP ${response.status}`);
      await response.body?.cancel();
    });
  }
  await check("events-public-origin", async () => {
    const response = await deploymentUpgrade(api + "/events", { origin: web });
    identity(response, "api");
    status(response.status, 401);
  });
  await check("events-foreign-origin", async () => {
    const response = await deploymentUpgrade(api + "/events", {
      origin: "https://deployment-smoke-foreign.invalid",
    });
    identity(response, "api");
    status(response.status, 403);
  });
  await check("page-embedding", async () => {
    const response = await read(api + "/page-content/public/deployment-smoke-missing");
    identity(response, "api");
    status(response.status, 404);
    const policy = response.headers.get("content-security-policy") ?? "";
    const ancestors = /(?:^|;)\s*frame-ancestors\s+([^;]+)/i.exec(policy)?.[1]?.split(/\s+/);
    if (!ancestors?.includes(web))
      throw new Error("Page frame-ancestors does not include the public Web origin");
    if (response.headers.has("x-frame-options"))
      throw new Error("Page response has a conflicting X-Frame-Options header");
    await response.body?.cancel();
  });
  await check("device-connect", async () => {
    const response = await deploymentUpgrade(api + "/device/connect");
    identity(response, "api");
    status(response.status, 401);
  });
  await check("device-cookie-stripping", async () => {
    const response = await deploymentUpgrade(api + "/device/connect", {
      cookie: "raypx-smoke=synthetic",
    });
    identity(response, "api");
    status(response.status, 401);
  });
  if (failures.length) throw new Error(`Deployment smoke failed (${failures.length} checks)`);
}
