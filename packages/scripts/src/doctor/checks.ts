import { join } from "node:path";

export type DoctorStatus = "error" | "ok" | "warn";

export interface DoctorCheck {
  detail: string;
  name: string;
  status: DoctorStatus;
}

export interface DoctorReport {
  checks: DoctorCheck[];
  errors: number;
  warnings: number;
}

export interface DoctorDependencies {
  pathExists(path: string): Promise<boolean>;
  probe(command: readonly string[]): Promise<string>;
  readFile(path: string): Promise<string>;
  repositoryRoot: string;
  validateEnvironment(): void;
}

interface RepositoryManifest {
  devEngines?: {
    packageManager?: { name?: string; version?: string };
    runtime?: { name?: string; version?: string };
  };
  name?: string;
}

interface RepositoryCheck {
  check: DoctorCheck;
  manifest?: RepositoryManifest;
}

function errorDetail(error: unknown, fallback = "check failed"): string {
  if (error instanceof Error) return error.message;
  return fallback === "check failed" ? String(error) : fallback;
}

function normalizeVersion(value: string): string {
  return value.trim().replace(/^v/, "");
}

function validateRepositoryManifest(manifest: RepositoryManifest): void {
  const packageManager = manifest.devEngines?.packageManager;
  const runtime = manifest.devEngines?.runtime;
  if (
    manifest.name !== "voidmix" ||
    packageManager?.name !== "bun" ||
    !packageManager.version ||
    runtime?.name !== "node" ||
    !runtime.version
  ) {
    throw new Error("root package metadata is incomplete");
  }
}

async function checkRepository(dependencies: DoctorDependencies): Promise<RepositoryCheck> {
  try {
    const manifest = JSON.parse(
      await dependencies.readFile(join(dependencies.repositoryRoot, "package.json")),
    ) as RepositoryManifest;
    validateRepositoryManifest(manifest);
    return {
      manifest,
      check: { name: "repository", status: "ok", detail: "root metadata is valid" },
    };
  } catch (error) {
    return {
      check: { name: "repository", status: "error", detail: errorDetail(error) },
    };
  }
}

async function checkRepositoryPath(
  dependencies: DoctorDependencies,
  name: string,
  path: string,
): Promise<DoctorCheck> {
  const exists = await dependencies.pathExists(join(dependencies.repositoryRoot, path));
  return {
    name,
    status: exists ? "ok" : "error",
    detail: exists ? `${path} is present` : `${path} is missing`,
  };
}

async function checkRepositoryBins(dependencies: DoctorDependencies): Promise<DoctorCheck> {
  const bins = ["vmx", "vp", "vitest"] as const;
  const missingBins: string[] = [];
  for (const bin of bins) {
    const path = join(dependencies.repositoryRoot, "node_modules/.bin", bin);
    if (!(await dependencies.pathExists(path))) missingBins.push(bin);
  }
  return {
    name: "dependencies",
    status: missingBins.length === 0 ? "ok" : "error",
    detail:
      missingBins.length === 0
        ? "required repository binaries are installed"
        : `missing binaries: ${missingBins.join(", ")}`,
  };
}

async function checkRuntimeVersion(
  dependencies: DoctorDependencies,
  name: string,
  command: readonly string[],
  expected: string,
): Promise<DoctorCheck> {
  try {
    const actual = normalizeVersion(await dependencies.probe(command));
    return {
      name,
      status: actual === expected ? "ok" : "error",
      detail: actual === expected ? actual : `expected ${expected}, found ${actual}`,
    };
  } catch (error) {
    return { name, status: "error", detail: errorDetail(error) };
  }
}

function checkEnvironment(dependencies: DoctorDependencies): DoctorCheck {
  try {
    dependencies.validateEnvironment();
    return { name: "environment", status: "ok", detail: "configuration is valid" };
  } catch (error) {
    return {
      name: "environment",
      status: "error",
      detail: errorDetail(error, "configuration is invalid"),
    };
  }
}

async function checkOptionalTool(
  dependencies: DoctorDependencies,
  name: string,
  commands: readonly (readonly string[])[],
): Promise<DoctorCheck> {
  try {
    const versions = await Promise.all(commands.map((command) => dependencies.probe(command)));
    return { name, status: "ok", detail: versions.map((value) => value.trim()).join(", ") };
  } catch {
    return { name, status: "warn", detail: `${name} tooling is not available` };
  }
}

function createDoctorReport(checks: DoctorCheck[]): DoctorReport {
  return {
    checks,
    errors: checks.filter((check) => check.status === "error").length,
    warnings: checks.filter((check) => check.status === "warn").length,
  };
}

export async function runDoctor(dependencies: DoctorDependencies): Promise<DoctorReport> {
  const repository = await checkRepository(dependencies);
  const checks = [
    repository.check,
    await checkRepositoryPath(dependencies, "lockfile", "bun.lock"),
    await checkRepositoryPath(dependencies, "env example", ".env.example"),
    await checkRepositoryBins(dependencies),
  ];

  const expectedBun = repository.manifest?.devEngines?.packageManager?.version;
  const expectedNode = repository.manifest?.devEngines?.runtime?.version;
  if (expectedBun) {
    checks.push(await checkRuntimeVersion(dependencies, "Bun", ["bun", "--version"], expectedBun));
  }
  if (expectedNode) {
    checks.push(
      await checkRuntimeVersion(dependencies, "Node.js", ["node", "--version"], expectedNode),
    );
  }

  checks.push(
    checkEnvironment(dependencies),
    await checkOptionalTool(dependencies, "Rust", [
      ["rustc", "--version"],
      ["cargo", "--version"],
    ]),
    await checkOptionalTool(dependencies, "Docker", [["docker", "--version"]]),
  );
  return createDoctorReport(checks);
}
