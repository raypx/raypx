import { existsSync, globSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { checkArchitecture } from "@raypx-kit/devkit/architecture";
import { readStaticCatalog, type CatalogTree } from "@raypx-kit/devkit/catalogs";
import { checkDocumentLinks } from "@raypx-kit/devkit/docs";
import { checkToolchain } from "@raypx-kit/devkit/toolchain";
import type { WorkspaceIndex } from "@raypx-kit/devkit/workspaces";
import { compareMessageCatalogs } from "@raypx-kit/intl/testing";
import { discover } from "./repository.js";

export function policy(root: string): string[] {
  const index = discover(root);
  const findings = checkArchitecture(index);
  for (const workspace of index.workspaces) {
    const file = join(root, workspace.path, "AGENTS.md");
    if (!existsSync(file)) findings.push(`${workspace.path}: missing AGENTS.md`);
    else if (readFileSync(file, "utf8").split("\n").length > 200)
      findings.push(`${workspace.path}: AGENTS.md exceeds 200 lines`);
    if (
      workspace.manifest.scripts?.test &&
      !existsSync(join(root, workspace.path, "vitest.config.ts"))
    )
      findings.push(`${workspace.path}: tests need an independent vitest.config.ts`);
  }
  const documents = globSync(
    [
      "*.md",
      "docs/**/*.md",
      "skills/raypx-infra/**/*.md",
      ...index.workspaces.map((w) => `${w.path}/AGENTS.md`),
    ],
    { cwd: root, exclude: ["docs/history/**"] },
  );
  findings.push(...checkDocumentLinks(root, documents));
  // Acceptance records describe the release they ran on and are not rewritten on upgrade.
  findings.push(
    ...checkToolchain(root, {
      documents: documents.filter((file) => file !== "docs/development/foundation-acceptance.md"),
      turboGlobalDependencies: [".nvmrc"],
    }),
  );
  return [...new Set(findings)];
}

export interface LocaleCatalogOptions {
  /** Supported locales; every catalog folder needs one file per locale. */
  locales?: readonly string[];
  /** The catalog every other locale is compared against. */
  base?: string;
}

function localeDefaults(root: string, index: WorkspaceIndex): Required<LocaleCatalogOptions> {
  const workspace = index.byName.get("@raypx/i18n");
  const entry = workspace?.manifest.exports?.["./config"];
  if (!workspace || typeof entry !== "string" || !entry.startsWith("./"))
    throw new Error("@raypx/i18n must export a static ./config language policy");
  const path = join(workspace.path, entry);
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

/** Read the public static language policy without importing the i18n runtime. */
export function checkLocales(root: string, options: LocaleCatalogOptions = {}): string[] {
  const index = discover(root);
  let locales = options.locales;
  let base = options.base;
  try {
    if (!locales || !base) {
      const defaults = localeDefaults(root, index);
      locales ??= defaults.locales;
      base ??= defaults.base;
    }
  } catch (error) {
    return [error instanceof Error ? error.message : String(error)];
  }
  if (!locales.length || !locales.includes(base))
    return ["Locale catalog policy must include its base in the supported locales"];
  const supported = new Set(locales);
  const dictionaries = globSync(
    index.workspaces.map((w) => `${w.path}/src/messages/*.{ts,json}`),
    { cwd: root },
  );
  const folders = new Map<string, Map<string, string>>();
  for (const path of dictionaries) {
    const match = /^(.*)\/([^/]+)\.(?:ts|json)$/.exec(path);
    if (!match || match[2] === "index") continue;
    const [, folder, locale] = match as unknown as [string, string, string];
    const files = folders.get(folder) ?? new Map<string, string>();
    files.set(locale, path);
    folders.set(folder, files);
  }
  const findings: string[] = [];
  for (const [folder, files] of folders) {
    const missing = locales.filter((locale) => !files.has(locale));
    if (missing.length) {
      findings.push(`${folder}: missing ${missing.join(", ")} catalog for supported locales`);
      continue;
    }
    for (const locale of files.keys())
      if (!supported.has(locale))
        findings.push(`${files.get(locale)}: ${locale} is not a supported locale`);
    const catalogs = new Map<string, CatalogTree>();
    for (const locale of locales) {
      const path = files.get(locale)!;
      try {
        catalogs.set(locale, readStaticCatalog(path, readFileSync(join(root, path), "utf8")));
      } catch (error) {
        findings.push(error instanceof Error ? error.message : `${path}: invalid catalog`);
      }
    }
    const reference = catalogs.get(base);
    if (!reference) continue;
    for (const locale of locales) {
      const catalog = catalogs.get(locale);
      if (locale === base || !catalog) continue;
      for (const issue of compareMessageCatalogs(reference, catalog, base, locale)) {
        const source = issue.side ? files.get(issue.side === "left" ? base : locale)! : folder;
        findings.push(`${source}: ${issue.message}; ${issue.fix}`);
      }
    }
  }
  return findings;
}
