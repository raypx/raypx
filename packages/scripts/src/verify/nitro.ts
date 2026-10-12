import { readFile } from "node:fs/promises";
import { createServer } from "node:net";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import type { RepositoryProcessDependencies } from "../runtime/process-dependencies.js";
import {
  parseArtifactMetadata,
  resolveArtifactEntry,
  stageRuntimeArtifact,
  type RuntimeArtifactStage,
} from "./artifact.js";

export interface NitroRuntimeTarget {
  directory: string;
  name: string;
  probes: readonly NitroRuntimeProbe[];
}

export interface NitroRuntimeProbe {
  body?: string;
  expectedStatus?: number;
  expectedText?: string;
  method?: "GET" | "POST";
  pathname: string;
}

interface NitroRuntimeVerificationOptions {
  captureOutput?: boolean;
  allocatePort?: () => Promise<number>;
  readMetadata?: (path: string) => Promise<string>;
  stageOutput?: (sourceDirectory: string) => Promise<RuntimeArtifactStage>;
  targets?: readonly NitroRuntimeTarget[];
  timeoutMs?: number;
}

const defaultTargets: readonly NitroRuntimeTarget[] = [
  {
    directory: "apps/web",
    name: "Web",
    probes: [{ expectedText: "Raypx", pathname: "/" }, { pathname: "/health" }],
  },
  {
    directory: "apps/api",
    name: "API",
    probes: [
      { pathname: "/health" },
      {
        pathname: "/internal/execution/bootstrap",
        method: "POST",
        body: JSON.stringify({ json: {} }),
        expectedStatus: 401,
      },
    ],
  },
];

const nitroProbe = [
  "const [entryUrl, name, rawProbes] = process.argv.slice(1);",
  "const probes = JSON.parse(rawProbes);",
  'const host = process.env.NITRO_HOST ?? "127.0.0.1";',
  "const port = process.env.NITRO_PORT ?? process.env.PORT;",
  "try {",
  "  await import(entryUrl);",
  "  for (const probe of probes) {",
  "    const url = new URL(probe.pathname, 'http://' + host + ':' + port);",
  "    const deadline = Date.now() + 10_000;",
  "    let lastFailure = 'server did not become ready';",
  "    let completed = false;",
  "    while (Date.now() < deadline) {",
  "      try {",
  "        const response = await fetch(url, { method: probe.method ?? 'GET', ...(probe.body ? { body: probe.body, headers: { 'Content-Type': 'application/json' } } : {}), signal: AbortSignal.timeout(1_000) });",
  "        const body = await response.text();",
  "        if (response.status !== (probe.expectedStatus ?? 200)) {",
  "          lastFailure = 'received HTTP ' + response.status;",
  "        } else if (probe.expectedText && !body.includes(probe.expectedText)) {",
  "          lastFailure = 'response did not contain expected text';",
  "        } else {",
  "          completed = true;",
  "          break;",
  "        }",
  "      } catch (error) {",
  "        lastFailure = error instanceof Error ? error.message : String(error);",
  "      }",
  "      await new Promise((resolve) => setTimeout(resolve, 100));",
  "    }",
  "    if (!completed) throw new Error(probe.pathname + ': ' + lastFailure);",
  "  }",
  "  process.exit(0);",
  "} catch (error) {",
  "  const message = error instanceof Error ? error.message : String(error);",
  '  console.error("Nitro runtime check failed for " + name + ": " + message);',
  "  process.exit(1);",
  "}",
].join("\n");

function createRuntimeEnvironment(processEnv: NodeJS.ProcessEnv, port: number): NodeJS.ProcessEnv {
  const environment = { ...processEnv };
  delete environment.DATABASE_URL;
  return {
    ...environment,
    DATABASE_URL: "postgres://raypx:verify@example.invalid:5432/raypx",
    S3_BUCKET: "raypx-runtime-probe",
    CLOUD_SEARCH_ENABLED: "false",
    CLOUD_COMPUTER_ENABLED: "false",
    REDIS_URL: "",
    SENTRY_DSN: "",
    ALLOWED_ORIGINS: "http://localhost:3000",
    AUTH_SECRET: "verify-only-secret-that-is-long-enough-for-better-auth",
    AUTH_URL: "http://127.0.0.1:" + port,
    RESEND_API_KEY: "verify-resend-key",
    MAIL_FROM: "verify@raypx.local",
    MAIL_FROM_NAME: "Raypx Verify",
    LOG_LEVEL: "error",
    LOG_PRETTY: "false",
    NITRO_HOST: "127.0.0.1",
    NITRO_PORT: String(port),
    NODE_ENV: "production",
    PORT: String(port),
  };
}

export async function allocateLocalPort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolvePromise, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolvePromise);
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    await new Promise<void>((resolvePromise) => server.close(() => resolvePromise()));
    throw new Error("Could not allocate a local port for Nitro runtime verification.");
  }

  await new Promise<void>((resolvePromise, reject) => {
    server.close((error) => (error ? reject(error) : resolvePromise()));
  });
  return address.port;
}

export async function verifyNitroRuntimes(
  dependencies: RepositoryProcessDependencies,
  options: NitroRuntimeVerificationOptions = {},
): Promise<void> {
  const allocatePort = options.allocatePort ?? allocateLocalPort;
  const readMetadata = options.readMetadata ?? ((path) => readFile(path, "utf8"));
  const stageOutput = options.stageOutput ?? stageRuntimeArtifact;

  for (const target of options.targets ?? defaultTargets) {
    const sourceDirectory = join(dependencies.repositoryRoot, target.directory, ".output");
    const metadata = parseArtifactMetadata(
      await readMetadata(join(sourceDirectory, "nitro.json")),
      target,
    );
    resolveArtifactEntry(sourceDirectory, metadata.serverEntry);
    const stage = await stageOutput(sourceDirectory);

    try {
      const serverEntry = resolveArtifactEntry(stage.directory, metadata.serverEntry);
      const port = await allocatePort();

      dependencies.log("info", "verify.runtime.started", { service: target.name });
      await dependencies.runCommand(
        [
          "bun",
          "--no-env-file",
          "--no-install",
          "--eval",
          nitroProbe,
          pathToFileURL(serverEntry).href,
          target.name,
          JSON.stringify(target.probes),
        ],
        {
          captureOutput: options.captureOutput ?? false,
          cwd: stage.directory,
          env: createRuntimeEnvironment(dependencies.processEnv, port),
          timeoutMs: options.timeoutMs ?? 30_000,
        },
      );
      dependencies.log("info", "verify.runtime.completed", { service: target.name });
    } finally {
      await stage.cleanup();
    }
  }
}
