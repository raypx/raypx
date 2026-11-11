import { existsSync, globSync, readFileSync, readdirSync } from "node:fs";
import { join, posix } from "node:path";
import { readStaticCatalog, type CatalogTree } from "@raypx-kit/devkit/catalogs";
import type { WorkspaceIndex } from "@raypx-kit/devkit/workspaces";
import { compareMessageCatalogs } from "@raypx-kit/intl/testing";
import { discover } from "../repository.js";

export interface LocaleCatalogOptions {
  locales?: readonly string[];
  base?: string;
}

function localeDefaults(root: string, index: WorkspaceIndex): Required<LocaleCatalogOptions> {
  const workspace = index.byName.get("@raypx/i18n");
  const entry = workspace?.manifest.exports?.["./config"];
  if (!workspace || typeof entry !== "string" || !entry.startsWith("./"))
    throw new Error("@raypx/i18n must export a static ./config language policy");
  const path = posix.join(workspace.path, entry);
  const config = readStaticCatalog(path, readFileSync(join(root, path), "utf8"));
  const labels = config.locales;
  const base = config.defaultLocale;
  if (
    !labels ||
    typeof labels !== "object" ||
    !Object.keys(labels).length ||
    Object.values(labels).some((label) => typeof label !== "string" || !label.length) ||
    typeof base !== "string" ||
    !Object.hasOwn(labels, base)
  )
    throw new Error(`${path}: locales need names and must include defaultLocale`);
  return { locales: Object.keys(labels), base };
}

/** Compare static TypeScript namespace catalogs without executing them. */
export function checkLocales(root: string, options: LocaleCatalogOptions = {}): string[] {
  const index = discover(root);
  const findings: string[] = [];
  let { locales, base } = options;
  try {
    if (!locales || !base) {
      const defaults = localeDefaults(root, index);
      locales ??= defaults.locales;
      base ??= defaults.base;
    }
  } catch (error) {
    findings.push(error instanceof Error ? error.message : String(error));
    return findings;
  }
  if (!locales.length || !locales.includes(base)) {
    findings.push("Locale catalog policy must include its base in the supported locales");
    return findings;
  }
  for (const workspace of index.workspaces) {
    const directory = `${workspace.path}/locales`;
    if (!existsSync(join(root, directory))) {
      if (workspace.manifest.exports?.["./messages"])
        findings.push(`${directory}: missing locale catalogs`);
      continue;
    }
    const languages = readdirSync(join(root, directory), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
    for (const language of languages)
      if (!locales.includes(language))
        findings.push(`${directory}/${language}: ${language} is not a supported locale`);
    const catalogs = new Map<string, CatalogTree>();
    const namespaces = new Map<string, string[]>();
    let invalidCatalog = false;
    for (const locale of locales) {
      const folder = `${directory}/${locale}`;
      const paths = globSync(`${folder}/*.ts`, { cwd: root })
        .map((path) => path.replaceAll("\\", "/"))
        .filter((path) => posix.basename(path) !== "index.ts")
        .sort();
      if (!paths.length)
        findings.push(`${folder}: missing TypeScript catalogs for supported locale`);
      const catalog: Record<string, string | CatalogTree> = {};
      const names: string[] = [];
      for (const path of paths) {
        const namespace = posix.basename(path, ".ts");
        names.push(namespace);
        try {
          catalog[namespace] = readStaticCatalog(path, readFileSync(join(root, path), "utf8"));
        } catch (error) {
          invalidCatalog = true;
          const message = error instanceof Error ? error.message : "invalid catalog";
          findings.push(message.startsWith(`${path}:`) ? message : `${path}: ${message}`);
        }
      }
      catalogs.set(locale, catalog);
      namespaces.set(locale, names);
    }
    if (invalidCatalog) continue;
    const reference = catalogs.get(base)!;
    const expected = namespaces.get(base)!;
    for (const locale of locales) {
      if (locale === base) continue;
      const names = namespaces.get(locale)!;
      const missing = expected.filter((name) => !names.includes(name));
      const extra = names.filter((name) => !expected.includes(name));
      if (missing.length)
        findings.push(`${directory}/${locale}: missing namespaces: ${missing.join(", ")}`);
      if (extra.length)
        findings.push(`${directory}/${locale}: unexpected namespaces: ${extra.join(", ")}`);
      for (const issue of compareMessageCatalogs(reference, catalogs.get(locale)!, base, locale)) {
        const source = issue.side
          ? `${directory}/${issue.side === "left" ? base : locale}`
          : directory;
        findings.push(`${source}: ${issue.message}; ${issue.fix}`);
      }
    }
  }
  return findings;
}
