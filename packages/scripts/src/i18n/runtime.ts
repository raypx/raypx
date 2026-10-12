import { readFile } from "node:fs/promises";
import { join } from "node:path";

import type { CatalogInput, I18nReport, SourceInput, SupportedLocale } from "./checks.js";
import { runI18nChecks } from "./checks.js";
import { walkFiles } from "../runtime/files.js";
import { repositoryRoot } from "../runtime/repository.js";

const sourceRoots = ["apps/web/src", "apps/desktop/src", "packages/mail/src"] as const;

const catalogSpecs = [
  ["web", "apps/web/messages", "web"],
  ["desktop", "apps/desktop/messages", "desktop"],
  ["mail", "packages/mail/messages", "mail"],
] as const satisfies readonly [string, string, CatalogInput["surface"]][];

const skippedDirectories = new Set([
  ".git",
  ".output",
  ".vite",
  ".vite-plus",
  "coverage",
  "dist",
  "node_modules",
  "target",
  "test-results",
]);

export interface I18nDependencies {
  listCatalogs(): Promise<CatalogInput[]>;
  listSources(): Promise<SourceInput[]>;
  repositoryRoot: string;
}

async function fileContent(root: string, location: string): Promise<string> {
  try {
    return await readFile(join(root, location), "utf8");
  } catch {
    return "";
  }
}

async function listSources(root: string): Promise<SourceInput[]> {
  const locations: string[] = [];
  for (const sourceRoot of sourceRoots) {
    await walkFiles(
      root,
      sourceRoot,
      (name) =>
        /\.tsx?$/u.test(name) && !/(?:\.test|\.spec)\.tsx?$|^routeTree\.gen\.ts$/u.test(name),
      locations,
      skippedDirectories,
    );
  }
  locations.sort();
  return Promise.all(
    locations.map(async (location) => ({ location, content: await fileContent(root, location) })),
  );
}

async function listCatalogs(root: string): Promise<CatalogInput[]> {
  const catalogs: CatalogInput[] = [];
  for (const [, directory, surface] of catalogSpecs) {
    for (const locale of ["en", "zh"] as const satisfies readonly SupportedLocale[]) {
      const location = `${directory}/${locale}.json`;
      catalogs.push({
        content: await fileContent(root, location),
        locale,
        location,
        surface,
      });
    }
  }
  return catalogs;
}

export function createI18nDependencies(root = repositoryRoot): I18nDependencies {
  return {
    listCatalogs: () => listCatalogs(root),
    listSources: () => listSources(root),
    repositoryRoot: root,
  };
}

export async function runI18nCheck(dependencies: I18nDependencies): Promise<I18nReport> {
  const [catalogs, sources] = await Promise.all([
    dependencies.listCatalogs(),
    dependencies.listSources(),
  ]);
  return runI18nChecks(catalogs, sources);
}
