#!/usr/bin/env bun

import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { checkDevelopmentEnvironment } from "../packages/config/src/environment.ts";

/** Public diagnostic outcomes; skipped checks are never presented as verified. */
export type DoctorStatus = "ok" | "warning" | "error" | "skipped";

/** A fixed diagnostic result with no configured values or raw exceptions. */
export interface DoctorCheck {
  id: string;
  status: DoctorStatus;
  code: string;
  message: string;
  fix?: string;
  fields?: readonly string[];
}

/** Versioned report used by text/JSON clients and automation. */
export interface DoctorReport {
  schemaVersion: 1;
  status: DoctorStatus;
  checks: readonly DoctorCheck[];
}

/** Explicit repository and environment inputs; active probes are opt-in. */
export interface DoctorOptions {
  root: string;
  environment?: Record<string, string | undefined>;
  database?: boolean;
  probe?: string;
}

interface RuntimeConfiguration {
  AUTH_ENABLED?: boolean;
  DATABASE_PATH?: string;
}

const ownRoot = fileURLToPath(new URL("../", import.meta.url));
const internalFlag = "--raypx-doctor-web";
const timeoutMs = 5000;

function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function commandVersion(
  command: string,
  args: string[],
  environment?: DoctorOptions["environment"],
): string {
  try {
    const result = execFileSync(command, args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: timeoutMs,
      ...(environment ? { env: environment } : {}),
    }).trim();
    return result.match(/(?:^v|^git version )?(\d+\.\d+\.\d+)/)?.[1] ?? "unavailable";
  } catch {
    return "unavailable";
  }
}

function isFile(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

function manifestReady(path: string): boolean {
  try {
    const value: unknown = JSON.parse(readFileSync(path, "utf8"));
    return typeof value === "object" && value !== null && !Array.isArray(value);
  } catch {
    return false;
  }
}

function migrationAssetsReady(root: string): boolean {
  try {
    const journal = record(
      JSON.parse(
        readFileSync(join(root, "packages/db/migrations/meta/_journal.json"), "utf8"),
      ) as unknown,
    );
    return (
      Array.isArray(journal.entries) &&
      journal.entries.every((entry: unknown) => {
        const tag = record(entry).tag;
        return (
          typeof tag === "string" &&
          /^\d+_[A-Za-z0-9_-]+$/.test(tag) &&
          isFile(join(root, "packages/db/migrations", `${tag}.sql`))
        );
      })
    );
  } catch {
    return false;
  }
}

function gitValue(root: string, key: string): string | undefined {
  try {
    return execFileSync("git", ["config", "--local", "--get", key], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: timeoutMs,
    }).trim();
  } catch {
    return undefined;
  }
}

function dependenciesInstalled(root: string): boolean {
  // Bun's isolated linker gives the runtime package its own declared dependency.
  return (
    isFile(join(root, "packages/env/node_modules/zod/package.json")) &&
    existsSync(join(root, "node_modules/.bin/vp"))
  );
}

function origin(input: string): string | undefined {
  try {
    const url = new URL(input);
    return ["http:", "https:"].includes(url.protocol) &&
      !url.username &&
      !url.password &&
      url.pathname === "/" &&
      !url.search &&
      !url.hash
      ? url.origin
      : undefined;
  } catch {
    return undefined;
  }
}

async function bounded<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  signal.throwIfAborted();
  let abort: (() => void) | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_, reject) => {
        abort = () => reject(new Error("Diagnostic deadline exceeded"));
        signal.addEventListener("abort", abort, { once: true });
      }),
    ]);
  } finally {
    if (abort) signal.removeEventListener("abort", abort);
  }
}

async function responseBody(response: Response, signal: AbortSignal): Promise<unknown> {
  if (!response.body) throw new Error("Missing body");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      signal.throwIfAborted();
      const result = await bounded(reader.read(), signal);
      if (result.done) break;
      size += result.value.byteLength;
      if (size > 64 * 1024) throw new Error("Probe body too large");
      chunks.push(result.value);
    }
  } finally {
    // Cancellation is advisory; an uncooperative response must not extend the deadline.
    void reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
}

async function probeService(root: string, target: string): Promise<DoctorCheck> {
  const signal = AbortSignal.timeout(timeoutMs);
  try {
    const { healthResponseSchema, readinessResponseSchema } = (await import(
      pathToFileURL(join(root, "packages/contracts/src/health.ts")).href
    )) as {
      healthResponseSchema: { parse(input: unknown): { status: "ok"; service: "raypx-api" } };
      readinessResponseSchema: {
        parse(input: unknown): {
          status: "ok" | "unavailable";
          service: "raypx-api";
          checks: Record<string, "ok" | "failed">;
        };
      };
    };
    let degraded = false;
    for (const route of ["/api/health", "/api/ready"]) {
      const response = await bounded(
        fetch(`${target}${route}`, {
          signal,
          redirect: "error",
          headers: { accept: "application/json" },
        }),
        signal,
      );
      const input = await responseBody(response, signal);
      const body =
        route === "/api/ready"
          ? readinessResponseSchema.parse(input)
          : healthResponseSchema.parse(input);
      if (response.status !== 200 || body.status !== "ok") throw new Error("Probe unavailable");
      if (route === "/api/ready") {
        degraded = Object.values(readinessResponseSchema.parse(input).checks).some(
          (value) => value === "failed",
        );
      }
    }
    return {
      id: "service",
      status: degraded ? "warning" : "ok",
      code: degraded ? "SERVICE_DEGRADED" : "SERVICE_READY",
      message: degraded
        ? "The service is ready, with a failed optional dependency check."
        : "Liveness and readiness probes passed.",
    };
  } catch {
    return {
      id: "service",
      status: "error",
      code: signal.aborted ? "PROBE_TIMEOUT" : "PROBE_FAILED",
      message: "Service probes failed or did not respond within five seconds.",
      fix: "Start the application and inspect its local runtime logs.",
    };
  }
}

function databaseCheck(
  root: string,
  path: string,
  environment: DoctorOptions["environment"],
): DoctorCheck {
  const result = spawnSync(
    "bun",
    [
      "--no-install",
      "--no-env-file",
      fileURLToPath(new URL("./doctor-database.ts", import.meta.url)),
    ],
    {
      cwd: join(root, "apps/web"),
      encoding: "utf8",
      env: {
        PATH: environment?.PATH ?? process.env.PATH,
        RAYPX_DOCTOR_ROOT: root,
        DATABASE_PATH: path,
      },
      timeout: timeoutMs,
      maxBuffer: 4096,
    },
  );
  let code = "DATABASE_CHECK_FAILED";
  try {
    const parsed = record(JSON.parse(result.stdout) as unknown);
    const codes = [
      "DATABASE_READY",
      "DATABASE_MISSING",
      "DATABASE_SCHEMA_MISSING",
      "DATABASE_MIGRATIONS_PENDING",
      "DATABASE_CHECK_FAILED",
    ];
    if (typeof parsed.code === "string" && codes.includes(parsed.code)) code = parsed.code;
  } catch {
    // Child errors, paths, and driver messages never become report output.
  }
  return code === "DATABASE_READY" && result.status === 0
    ? {
        id: "database",
        status: "ok",
        code,
        message: "Existing database schema and migrations are ready.",
      }
    : {
        id: "database",
        status: "error",
        code,
        message: "The existing database could not be verified as ready.",
        fix: "Check DATABASE_PATH and run bun run db:migrate before enabling authentication.",
      };
}

/** Runs local diagnostics without installing, building, migrating, or starting the application. */
export async function runDoctor(options: DoctorOptions): Promise<DoctorReport> {
  const root = resolve(options.root);
  const environment = options.environment ?? process.env;
  const checks: DoctorCheck[] = [];
  const toolErrors = checkDevelopmentEnvironment(root, {
    nodeVersion: commandVersion("node", ["--version"], environment),
    bunVersion: commandVersion("bun", ["--version"], environment),
  });
  checks.push(
    toolErrors.length === 0
      ? {
          id: "toolchain",
          status: "ok",
          code: "TOOLCHAIN_READY",
          message: "Node, Bun, and version declarations agree.",
        }
      : {
          id: "toolchain",
          status: "error",
          code: "TOOLCHAIN_MISMATCH",
          message: "Tool versions or repository version declarations do not agree.",
          fix: "Use .node-version and .bun-version, then run bun run check:env.",
        },
  );
  const git = commandVersion("git", ["--version"], environment).split(".").map(Number);
  const gitSupported = (git[0] ?? 0) > 2 || ((git[0] ?? 0) === 2 && (git[1] ?? 0) >= 32);
  checks.push(
    gitSupported
      ? {
          id: "git",
          status: "ok",
          code: "GIT_READY",
          message: "Git supports the staged hook requirements.",
        }
      : {
          id: "git",
          status: "error",
          code: "GIT_UNSUPPORTED",
          message: "Git 2.32 or later is required for staged checks.",
        },
  );
  const manifestFiles = ["package.json", "apps/web/package.json", "packages/env/package.json"];
  checks.push(
    isFile(join(root, "bun.lock")) && manifestFiles.every((file) => manifestReady(join(root, file)))
      ? {
          id: "workspace",
          status: "ok",
          code: "WORKSPACE_READY",
          message: "Required workspace manifests and lockfile exist.",
        }
      : {
          id: "workspace",
          status: "error",
          code: "WORKSPACE_INCOMPLETE",
          message: "Required workspace manifests or lockfile are missing.",
          fix: "Use a complete checkout of the template.",
        },
  );
  const installed = dependenciesInstalled(root);
  checks.push(
    installed
      ? {
          id: "dependencies",
          status: "ok",
          code: "DEPENDENCIES_READY",
          message: "Runtime validation and Vite+ dependencies are available.",
        }
      : {
          id: "dependencies",
          status: "warning",
          code: "DEPENDENCIES_NOT_INSTALLED",
          message: "Installed dependencies are not available yet.",
          fix: "Run bun install --frozen-lockfile.",
        },
  );
  const disabled = gitValue(root, "vp.hooks.disabled") === "true";
  const hookPath = gitValue(root, "core.hooksPath");
  const hooksReady =
    hookPath !== undefined &&
    resolve(root, hookPath) === resolve(root, ".vite-hooks/_") &&
    isFile(join(root, ".vite-hooks/_/pre-commit")) &&
    isFile(join(root, ".vite-hooks/pre-commit"));
  checks.push(
    hooksReady && !disabled
      ? {
          id: "hooks",
          status: "ok",
          code: "HOOKS_READY",
          message: "The Vite+ pre-commit dispatcher is enabled.",
        }
      : {
          id: "hooks",
          status: "warning",
          code: disabled ? "HOOKS_DISABLED" : "HOOKS_NOT_CONFIGURED",
          message: disabled
            ? "Git hooks are explicitly disabled in this clone."
            : "The Vite+ hook dispatcher is not configured.",
          fix: "Run bun scripts/install-hooks.ts when you want to enable hooks.",
        },
  );
  if (!isFile(join(root, "apps/web/.env")))
    checks.push({
      id: "env-file",
      status: "warning",
      code: "ENV_FILE_ABSENT",
      message:
        "No application .env file exists; injected environment variables may still be valid.",
      fix: "Run bun run setup for local configuration, or inject variables directly.",
    });
  let configuration: RuntimeConfiguration | undefined;
  if (!installed) {
    checks.push({
      id: "runtime-env",
      status: "skipped",
      code: "ENV_VALIDATION_SKIPPED",
      message: "Runtime validation requires installed dependencies.",
    });
  } else {
    try {
      const module = (await import(
        pathToFileURL(join(root, "packages/env/src/server.ts")).href
      )) as {
        parseServerEnv(input: Record<string, unknown>): RuntimeConfiguration;
      };
      configuration = module.parseServerEnv(environment);
      checks.push({
        id: "runtime-env",
        status: "ok",
        code: "ENV_VALID",
        message: "Application configuration is valid; configured values are not displayed.",
      });
    } catch (error) {
      const issues = record(error).issues;
      const fields = Array.isArray(issues)
        ? issues
            .map((issue: unknown) => record(issue).field)
            .filter(
              (field: unknown): field is string =>
                typeof field === "string" && /^[A-Z][A-Z0-9_]{0,63}$/.test(field),
            )
        : [];
      checks.push({
        id: "runtime-env",
        status: "error",
        code: "ENV_INVALID",
        message: "Application configuration could not be validated.",
        ...(fields.length ? { fields } : {}),
        fix: "Review supported fields in ENV.md and run bun run check:runtime-env.",
      });
    }
  }
  checks.push(
    migrationAssetsReady(root)
      ? {
          id: "migration-assets",
          status: "ok",
          code: "MIGRATION_ASSETS_PRESENT",
          message: "The migration journal and referenced SQL assets are present.",
        }
      : {
          id: "migration-assets",
          status: "error",
          code: "MIGRATION_ASSETS_MISSING",
          message: "The migration journal or referenced SQL assets are missing or invalid.",
        },
  );
  if (options.database && configuration) {
    const path = configuration.DATABASE_PATH ?? "./data/raypx.db";
    checks.push(
      path === ":memory:"
        ? {
            id: "database",
            status: "skipped",
            code: "DATABASE_IN_MEMORY",
            message:
              "An in-memory database cannot be inspected from a separate diagnostic process.",
          }
        : databaseCheck(root, path, environment),
    );
  } else {
    checks.push({
      id: "database",
      status: "skipped",
      code: "DATABASE_NOT_PROBED",
      message: configuration?.AUTH_ENABLED
        ? "Authentication is configured; its database was not opened by this local check."
        : "No database probe was requested.",
      fix: "Use bun run doctor --database to verify an existing database without migrating it.",
    });
  }
  checks.push(
    options.probe && installed
      ? await probeService(
          root,
          origin(options.probe) ??
            (() => {
              throw new Error("Invalid probe origin");
            })(),
        )
      : options.probe
        ? {
            id: "service",
            status: "skipped",
            code: "PROBE_VALIDATION_UNAVAILABLE",
            message: "Network probes require installed response contract dependencies.",
          }
        : {
            id: "service",
            status: "skipped",
            code: "SERVICE_NOT_PROBED",
            message: "No network probe was requested.",
          },
  );
  const status = checks.some((check) => check.status === "error")
    ? "error"
    : checks.some((check) => check.status === "warning")
      ? "warning"
      : "ok";
  return { schemaVersion: 1, status, checks };
}

/** Maps a completed diagnostic report to its stable process exit code. */
export function doctorExitCode(report: DoctorReport): 0 | 1 {
  return report.status === "error" ? 1 : 0;
}

function parseArguments(args: readonly string[]): {
  json: boolean;
  database: boolean;
  probe?: string;
} {
  let json = false;
  let database = false;
  let probe: string | undefined;
  for (let index = 0; index < args.length; index++) {
    const argument = args[index];
    if (argument === internalFlag) continue;
    if (argument === "--json") json = true;
    else if (argument === "--database") database = true;
    else if (argument === "--probe" && args[index + 1] !== undefined) {
      probe = origin(args[++index] ?? "");
      if (!probe) throw new Error("Invalid probe origin");
    } else throw new Error("Unsupported diagnostic argument");
  }
  return { json, database, ...(probe ? { probe } : {}) };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const json = args.includes("--json");
  try {
    const options = parseArguments(args);
    if (!args.includes(internalFlag)) {
      const child = spawnSync(
        process.execPath,
        ["--no-install", fileURLToPath(import.meta.url), internalFlag, ...args],
        {
          cwd: join(ownRoot, "apps/web"),
          stdio: "inherit",
          env: process.env,
        },
      );
      process.exitCode = child.status ?? 2;
      return;
    }
    const report = await runDoctor({ root: ownRoot, ...options });
    if (options.json) console.log(JSON.stringify(report));
    else
      for (const check of report.checks)
        console.log(
          `${check.status.toUpperCase()} ${check.id}: ${check.message}${check.fields?.length ? ` Fields: ${check.fields.join(", ")}.` : ""}${check.fix ? ` ${check.fix}` : ""}`,
        );
    process.exitCode = doctorExitCode(report);
  } catch {
    const report: DoctorReport = {
      schemaVersion: 1,
      status: "error",
      checks: [
        {
          id: "doctor",
          status: "error",
          code: "DOCTOR_USAGE_OR_INTERNAL_ERROR",
          message:
            "Doctor could not run. Use --json, --database, or --probe with an HTTP(S) origin.",
        },
      ],
    };
    if (json) console.log(JSON.stringify(report));
    else console.error(report.checks[0]?.message);
    process.exitCode = 2;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
