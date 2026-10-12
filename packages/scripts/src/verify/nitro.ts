import { cp, mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { isAbsolute, join, relative, resolve } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";

import type { RepositoryProcessDependencies } from "../runtime/process-dependencies.js";

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

interface NitroMetadata {
  preset: string;
  serverEntry: string;
}

interface NitroRuntimeVerificationOptions {
  captureOutput?: boolean;
  allocatePort?: () => Promise<number>;
  readMetadata?: (path: string) => Promise<string>;
  stageOutput?: (sourceDirectory: string) => Promise<NitroRuntimeStage>;
  targets?: readonly NitroRuntimeTarget[];
}

interface NitroRuntimeStage {
  cleanup(): Promise<void>;
  directory: string;
}

const defaultTargets: readonly NitroRuntimeTarget[] = [
  {
    directory: "apps/web",
    name: "Web",
    probes: [{ expectedText: "Voidmix", pathname: "/" }, { pathname: "/health" }],
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

function parseMetadata(raw: string, target: NitroRuntimeTarget): NitroMetadata {
  const metadata: unknown = JSON.parse(raw);
  if (!metadata || typeof metadata !== "object") {
    throw new Error(`${target.name} Nitro metadata must be an object.`);
  }

  const { preset, serverEntry } = metadata as Record<string, unknown>;
  if (preset !== "node-server") {
    throw new Error(`${target.name} Nitro output uses ${String(preset)} instead of node-server.`);
  }
  if (typeof serverEntry !== "string" || serverEntry.length === 0) {
    throw new Error(`${target.name} Nitro metadata is missing serverEntry.`);
  }
  return { preset, serverEntry };
}

function resolveServerEntry(outputDirectory: string, serverEntry: string): string {
  const entry = resolve(outputDirectory, serverEntry);
  const relativeEntry = relative(outputDirectory, entry);
  if (relativeEntry.startsWith("..") || isAbsolute(relativeEntry)) {
    throw new Error(`Nitro serverEntry points outside its output directory: ${serverEntry}`);
  }
  return entry;
}

function createRuntimeEnvironment(processEnv: NodeJS.ProcessEnv, port: number): NodeJS.ProcessEnv {
  const environment = { ...processEnv };
  delete environment.DATABASE_URL;
  return {
    ...environment,
    DATABASE_URL: "postgres://voidmix:verify@example.invalid:5432/voidmix",
    S3_BUCKET: "voidmix-runtime-probe",
    CLOUD_SEARCH_ENABLED: "false",
    CLOUD_COMPUTER_ENABLED: "false",
    REDIS_URL: "",
    SENTRY_DSN: "",
    ALLOWED_ORIGINS: "http://localhost:3000",
    AUTH_SECRET: "verify-only-secret-that-is-long-enough-for-better-auth",
    AUTH_URL: "http://127.0.0.1:" + port,
    RESEND_API_KEY: "verify-resend-key",
    MAIL_FROM: "verify@voidmix.local",
    MAIL_FROM_NAME: "Voidmix Verify",
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

async function stageNitroOutput(sourceDirectory: string): Promise<NitroRuntimeStage> {
  const stagingRoot = await mkdtemp(join(tmpdir(), "voidmix-nitro-runtime-"));
  const directory = join(stagingRoot, ".output");

  try {
    await cp(sourceDirectory, directory, { recursive: true, verbatimSymlinks: true });
  } catch (error) {
    await rm(stagingRoot, { force: true, recursive: true });
    throw error;
  }

  return {
    directory,
    cleanup: () => rm(stagingRoot, { force: true, recursive: true }),
  };
}

export async function verifyNitroRuntimes(
  dependencies: RepositoryProcessDependencies,
  options: NitroRuntimeVerificationOptions = {},
): Promise<void> {
  const allocatePort = options.allocatePort ?? allocateLocalPort;
  const readMetadata = options.readMetadata ?? ((path) => readFile(path, "utf8"));
  const stageOutput = options.stageOutput ?? stageNitroOutput;

  for (const target of options.targets ?? defaultTargets) {
    const sourceDirectory = join(dependencies.repositoryRoot, target.directory, ".output");
    const metadata = parseMetadata(await readMetadata(join(sourceDirectory, "nitro.json")), target);
    resolveServerEntry(sourceDirectory, metadata.serverEntry);
    const stage = await stageOutput(sourceDirectory);

    try {
      const serverEntry = resolveServerEntry(stage.directory, metadata.serverEntry);
      const port = await allocatePort();

      dependencies.log("info", "verify.runtime.started", { service: target.name });
      await dependencies.runCommand(
        [
          "node",
          "--input-type=module",
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
        },
      );
      dependencies.log("info", "verify.runtime.completed", { service: target.name });
    } finally {
      await stage.cleanup();
    }
  }
}
