import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export interface PackageManifest {
  name?: string;
  workspaces?: string[] | { packages?: string[] };
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  exports?: string | Record<string, unknown>;
}

export interface PackageEntry {
  directory: string;
  manifest: PackageManifest & { name: string };
}

function workspacePatterns(manifest: PackageManifest): string[] {
  const patterns = Array.isArray(manifest.workspaces)
    ? manifest.workspaces
    : manifest.workspaces?.packages;
  return Array.isArray(patterns)
    ? patterns.filter((pattern) => typeof pattern === "string" && pattern.length > 0)
    : [];
}

export function workspaceRoot(start: string): string {
  let directory = resolve(start);
  while (true) {
    const manifestPath = join(directory, "package.json");
    if (existsSync(manifestPath)) {
      const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as PackageManifest;
      if (workspacePatterns(manifest).length > 0) return directory;
    }
    const parent = dirname(directory);
    if (parent === directory) throw new Error(`No package.json workspaces found from ${start}`);
    directory = parent;
  }
}

export function configDirectory(importMetaUrl: string | URL): string {
  return dirname(fileURLToPath(importMetaUrl));
}

export function workspacePackages(root: string): Map<string, PackageEntry> {
  const packages = new Map<string, PackageEntry>();
  const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as PackageManifest;
  for (const pattern of workspacePatterns(manifest)) {
    const normalized = pattern.replace(/^\.\//, "");
    if (!/^[^*!]+\/\*$/.test(normalized) || normalized.split("/").includes("..")) {
      throw new Error(
        `Unsupported workspace pattern ${pattern}; expected a directory followed by /*`,
      );
    }
    const group = normalized.slice(0, -2);
    const directory = join(root, group);
    if (!existsSync(directory)) continue;
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const packageDirectory = join(directory, entry.name);
      const manifestPath = join(packageDirectory, "package.json");
      if (!existsSync(manifestPath)) continue;
      const packageManifest = JSON.parse(readFileSync(manifestPath, "utf8")) as PackageManifest;
      if (typeof packageManifest.name !== "string") continue;
      packages.set(packageManifest.name, {
        directory: packageDirectory,
        manifest: packageManifest as PackageManifest & { name: string },
      });
    }
  }
  return packages;
}

export function declaredDependencies(manifest: PackageManifest): Record<string, string> {
  return {
    ...manifest.dependencies,
    ...manifest.devDependencies,
    ...manifest.peerDependencies,
    ...manifest.optionalDependencies,
  };
}

export function exportEntries(manifest: PackageManifest): Array<[string, unknown]> {
  const exports = manifest.exports;
  if (typeof exports === "string") return [[".", exports]];
  if (!exports || typeof exports !== "object") return [];
  if (Object.keys(exports).some((key) => key.startsWith("."))) return Object.entries(exports);
  return [[".", exports]];
}

export function importTarget(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  for (const condition of ["import", "default", "browser", "node"]) {
    const target = importTarget(record[condition]);
    if (target) return target;
  }
  return undefined;
}
