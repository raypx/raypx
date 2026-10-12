import {
  runRepositoryCommands,
  type RepositoryProcessDependencies,
} from "../runtime/process-dependencies.js";

export type DependencyMaintenanceDependencies = RepositoryProcessDependencies;

const tazeOptions = [
  "minor",
  "-r",
  "-l",
  // The runner and coverage package must match the versions bundled by Vite+.
  "--exclude",
  "vitest",
  "--exclude",
  "@vitest/coverage-v8",
  // RC build hashes do not sort by release date; update both from the rc5 tag.
  "--exclude",
  "drizzle-kit",
  "--exclude",
  "drizzle-orm",
  "--exclude",
  "bun",
  "--exclude",
  "node",
] as const;

export const runDependencyCheck = (dependencies: DependencyMaintenanceDependencies) =>
  runRepositoryCommands(dependencies, "deps.check", [
    ["taze", ...tazeOptions, "--fail-on-outdated"],
  ]);

export const runDependencyUpdate = (dependencies: DependencyMaintenanceDependencies) =>
  runRepositoryCommands(dependencies, "deps.update", [
    ["taze", ...tazeOptions, "-w"],
    ["bun", "install"],
  ]);

export function runDedupe(
  dependencies: DependencyMaintenanceDependencies,
  options: { check?: boolean } = {},
) {
  const check = options.check ?? false;
  return runRepositoryCommands(
    dependencies,
    "deps.dedupe",
    [["bun", "dedupe", ...(check ? ["--check"] : [])]],
    { check },
  );
}

export const runAudit = (dependencies: DependencyMaintenanceDependencies) =>
  runRepositoryCommands(dependencies, "deps.audit", [["bun", "audit"]]);
