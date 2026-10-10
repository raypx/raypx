import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

interface Manifest {
  path: string;
  value: unknown;
}

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/** Check compatibility constraints which grouping update PRs alone cannot enforce. */
export function checkDependencyVersions(
  manifests: Manifest[],
  installedVitePlus: unknown,
): string[] {
  const issues: string[] = [];
  const root = record(manifests.find((manifest) => manifest.path === "package.json")?.value);
  const catalog = record(record(root.workspaces).catalog);
  const vitePlus = record(installedVitePlus);
  const bundled = record(vitePlus.dependencies);
  const expectedCore = bundled.vite;
  const equal = (label: string, actual: unknown, expected: unknown) => {
    if (typeof expected !== "string" || typeof actual !== "string" || actual !== expected)
      issues.push(`${label}: expected ${String(expected)}, found ${String(actual)}.`);
  };
  if (
    typeof expectedCore !== "string" ||
    !expectedCore.startsWith("npm:@voidzero-dev/vite-plus-core@")
  )
    issues.push("Installed Vite+ must declare its bundled @voidzero-dev/vite-plus-core alias.");
  equal("catalog.vite", catalog.vite, expectedCore);
  equal("overrides.vite@*", record(root.overrides)["vite@*"], expectedCore);
  equal(
    "installed vite-plus (run bun install after editing versions)",
    vitePlus.version,
    catalog["vite-plus"],
  );
  for (const name of ["vitest", "@vitest/coverage-v8", "@vitest/browser-playwright"])
    equal(`catalog.${name}`, catalog[name], bundled.vitest);

  const versions = new Map<string, string>();
  for (const manifest of manifests) {
    const value = record(manifest.value);
    for (const field of ["dependencies", "devDependencies", "optionalDependencies"]) {
      for (const [name, declaration] of Object.entries(record(value[field]))) {
        const label = `${manifest.path} ${field}.${name}`;
        const shared =
          name === "vite" ||
          name === "vite-plus" ||
          name === "vitest" ||
          name.startsWith("@vitest/") ||
          name === "playwright";
        if (shared && declaration !== "catalog:")
          issues.push(`${label}: use catalog: so every consumer upgrades together.`);
        const version = declaration === "catalog:" ? catalog[name] : declaration;
        if (declaration === "catalog:" && typeof version !== "string")
          issues.push(`${label}: missing root catalog entry.`);
        const family =
          name === "storybook" || name.startsWith("@storybook/")
            ? "Storybook"
            : name === "playwright" || name === "playwright-core" || name.startsWith("@playwright/")
              ? "Playwright"
              : undefined;
        if (!family) continue;
        if (typeof version !== "string" || !/^\d+\.\d+\.\d+$/.test(version)) {
          issues.push(`${label}: ${family} tooling must use an exact stable version.`);
          continue;
        }
        const expected = versions.get(family);
        if (expected) equal(label, version, expected);
        else versions.set(family, version);
      }
    }
  }
  return issues;
}

/** Inspect manifests, never install packages or contact a registry. */
export async function checkRepositoryDependencies(root: string): Promise<string[]> {
  const read = async (path: string): Promise<Manifest> => ({
    path,
    value: JSON.parse(await readFile(join(root, path), "utf8")) as unknown,
  });
  const manifests = [await read("package.json")];
  for (const directory of ["apps", "packages"]) {
    const entries = await readdir(join(root, directory), { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const path = `${directory}/${entry.name}/package.json`;
      try {
        manifests.push(await read(path));
      } catch (error) {
        if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
      }
    }
  }
  const installed = await read("node_modules/vite-plus/package.json");
  return checkDependencyVersions(manifests, installed.value);
}
