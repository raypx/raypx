import { existsSync, globSync, readFileSync, readdirSync } from "node:fs";
import { join, posix } from "node:path";
import { readStaticCatalog, type CatalogTree } from "../repo/catalogs.js";
import { writeCatalogDeclarations } from "../repo/catalog-types.js";
import type { WorkspaceIndex } from "../repo/workspaces.js";
import { discover } from "../repository.js";
import { checkCatalogEntry } from "./catalog-entry.js";
import { compareMessageCatalogs } from "./catalog-parity.js";

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

function catalogPaths(root: string, folder: string): string[] {
  return globSync(`${folder}/*.json`, { cwd: root })
    .map((path) => path.replaceAll("\\", "/"))
    .sort();
}

/** Catalogs are JSON so translation tooling reads them; only the entry stays TypeScript. */
function authoredModules(root: string, folder: string): string[] {
  return globSync(`${folder}/*.ts`, { cwd: root })
    .map((path) => path.replaceAll("\\", "/"))
    .filter((path) => posix.basename(path) !== "index.ts" && !path.endsWith(".d.json.ts"))
    .sort();
}

/** Writes the literal-typed declarations that sit beside reference-language catalogs. */
export function writeLocaleTypes(root: string): string[] {
  const index = discover(root);
  return writeCatalogDeclarations(
    root,
    index.workspaces.map((workspace) => workspace.path),
    localeDefaults(root, index).base,
  );
}

/** Public language entries expose their owner's namespace files; apps alone compose them. */
function sharedCatalogs(root: string, index: WorkspaceIndex, locale: string) {
  const sources = new Map<string, readonly string[]>();
  for (const workspace of index.workspaces) {
    if (workspace.metadata?.kind === "app") continue;
    const entry = workspace.manifest.exports?.[`./messages/${locale}`];
    const folder = `${workspace.path}/locales/${locale}`;
    if (typeof entry !== "string" || posix.join(workspace.path, entry) !== `${folder}/index.ts`)
      continue;
    const names = catalogPaths(root, folder).map((path) =>
      posix.basename(path, posix.extname(path)),
    );
    sources.set(`${workspace.manifest.name}/messages/${locale}`, [...new Set(names)]);
  }
  return sources;
}

/** Compare authored JSON namespace catalogs without executing their entries. */
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
  const owners = new Map<string, string>();
  const shared = new Map(locales.map((locale) => [locale, sharedCatalogs(root, index, locale)]));
  for (const workspace of index.workspaces) {
    const directory = `${workspace.path}/locales`;
    if (!existsSync(join(root, directory))) {
      if (
        Object.keys(workspace.manifest.exports ?? {}).some((entry) =>
          entry.startsWith("./messages/"),
        )
      )
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
      const paths = catalogPaths(root, folder);
      for (const module of authoredModules(root, folder))
        findings.push(`${module}: catalogs are JSON; move these messages to a .json file`);
      const entry = `${folder}/index.ts`;
      const hasEntry = existsSync(join(root, entry));
      if (!paths.length && !hasEntry)
        findings.push(`${folder}: missing catalogs for supported locale`);
      if (hasEntry) {
        try {
          findings.push(
            ...checkCatalogEntry(
              entry,
              readFileSync(join(root, entry), "utf8"),
              paths,
              workspace.metadata?.kind === "app" ? shared.get(locale) : undefined,
            ),
          );
        } catch {
          findings.push(`${entry}: invalid catalog entry`);
        }
      } else if (paths.length) findings.push(`${entry}: missing catalog entry`);
      const catalog: Record<string, string | CatalogTree> = Object.create(null);
      const names: string[] = [];
      for (const path of paths) {
        const extension = posix.extname(path);
        const namespace = posix.basename(path, extension);
        names.push(namespace);
        if (locale === base) {
          const owner = owners.get(namespace);
          if (owner) findings.push(`${path}: namespace ${namespace} is already owned by ${owner}`);
          else owners.set(namespace, path);
        }
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
