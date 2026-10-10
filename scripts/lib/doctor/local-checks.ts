import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { checkDevelopmentEnvironment } from "../../../packages/config/src/environment.ts";
import type { DoctorCheck, DoctorOptions } from "./report.ts";

/** Configuration fields needed to decide whether an optional database probe can run. */
export interface RuntimeConfiguration {
  AUTH_ENABLED?: boolean;
  DATABASE_PATH?: string;
}

interface RuntimeEnvironmentResult {
  check: DoctorCheck;
  configuration?: RuntimeConfiguration;
}

/** Local outcomes and validated configuration; checking them never opens a database or network. */
export interface LocalEnvironmentResult {
  checks: DoctorCheck[];
  installed: boolean;
  configuration?: RuntimeConfiguration;
}

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
    if (command === "node" || command === "bun") return result.replace(/^v/, "");
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

function checkToolchain(root: string, environment: DoctorOptions["environment"]): DoctorCheck {
  const toolErrors = checkDevelopmentEnvironment(root, {
    nodeVersion: commandVersion("node", ["--version"], environment),
    bunVersion: commandVersion("bun", ["--version"], environment),
  });
  return toolErrors.length === 0
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
        fix: "Use a stable Node.js release satisfying devEngines.runtime (.node-version is recommended) and the Bun version in .bun-version, then run bun run check:env.",
      };
}

function checkGit(environment: DoctorOptions["environment"]): DoctorCheck {
  const git = commandVersion("git", ["--version"], environment).split(".").map(Number);
  const gitSupported = (git[0] ?? 0) > 2 || ((git[0] ?? 0) === 2 && (git[1] ?? 0) >= 32);
  return gitSupported
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
      };
}

function checkWorkspace(root: string): DoctorCheck {
  const manifestFiles = ["package.json", "apps/web/package.json", "packages/env/package.json"];
  return isFile(join(root, "bun.lock")) &&
    manifestFiles.every((file) => manifestReady(join(root, file)))
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
      };
}

function checkDependencies(installed: boolean): DoctorCheck {
  return installed
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
      };
}

function checkHooks(root: string): DoctorCheck {
  const disabled = gitValue(root, "vp.hooks.disabled") === "true";
  const hookPath = gitValue(root, "core.hooksPath");
  const hooksReady =
    hookPath !== undefined &&
    resolve(root, hookPath) === resolve(root, ".vite-hooks/_") &&
    isFile(join(root, ".vite-hooks/_/pre-commit")) &&
    isFile(join(root, ".vite-hooks/pre-commit"));
  return hooksReady && !disabled
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
      };
}

function checkEnvironmentFile(root: string): DoctorCheck | undefined {
  if (isFile(join(root, "apps/web/.env"))) return undefined;
  return {
    id: "env-file",
    status: "warning",
    code: "ENV_FILE_ABSENT",
    message: "No application .env file exists; injected environment variables may still be valid.",
    fix: "Run bun run setup for local configuration, or inject variables directly.",
  };
}

function environmentErrorFields(error: unknown): string[] {
  const issues = record(error).issues;
  return Array.isArray(issues)
    ? issues
        .map((issue: unknown) => record(issue).field)
        .filter(
          (field: unknown): field is string =>
            typeof field === "string" && /^[A-Z][A-Z0-9_]{0,63}$/.test(field),
        )
    : [];
}

async function checkRuntimeEnvironment(
  root: string,
  environment: Record<string, string | undefined>,
  installed: boolean,
): Promise<RuntimeEnvironmentResult> {
  if (!installed)
    return {
      check: {
        id: "runtime-env",
        status: "skipped",
        code: "ENV_VALIDATION_SKIPPED",
        message: "Runtime validation requires installed dependencies.",
      },
    };
  try {
    const module = (await import(pathToFileURL(join(root, "packages/env/src/server.ts")).href)) as {
      parseServerEnv(input: Record<string, unknown>): RuntimeConfiguration;
    };
    const configuration = module.parseServerEnv(environment);
    return {
      configuration,
      check: {
        id: "runtime-env",
        status: "ok",
        code: "ENV_VALID",
        message: "Application configuration is valid; configured values are not displayed.",
      },
    };
  } catch (error) {
    const fields = environmentErrorFields(error);
    return {
      check: {
        id: "runtime-env",
        status: "error",
        code: "ENV_INVALID",
        message: "Application configuration could not be validated.",
        ...(fields.length ? { fields } : {}),
        fix: "Review supported fields in ENV.md and run bun run check:runtime-env.",
      },
    };
  }
}

function checkMigrationAssets(root: string): DoctorCheck {
  return migrationAssetsReady(root)
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
      };
}

/** Collects the source-first local checks in their stable report order. */
export async function checkLocalEnvironment(
  root: string,
  environment: Record<string, string | undefined>,
): Promise<LocalEnvironmentResult> {
  const checks = [checkToolchain(root, environment), checkGit(environment), checkWorkspace(root)];
  const installed = dependenciesInstalled(root);
  checks.push(checkDependencies(installed), checkHooks(root));
  const envFile = checkEnvironmentFile(root);
  if (envFile) checks.push(envFile);
  const runtime = await checkRuntimeEnvironment(root, environment, installed);
  checks.push(runtime.check, checkMigrationAssets(root));
  return {
    checks,
    installed,
    ...(runtime.configuration ? { configuration: runtime.configuration } : {}),
  };
}
