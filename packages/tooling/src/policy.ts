import { existsSync, globSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { checkArchitecture } from "@voidmix/devkit/architecture";
import { readStaticCatalog, type CatalogTree } from "@voidmix/devkit/catalogs";
import { checkDocumentLinks } from "@voidmix/devkit/docs";
import { checkToolchain } from "@voidmix/devkit/toolchain";
import { DEFAULT_LOCALE, SUPPORTED_LOCALES } from "@raypx/i18n";
import { compareMessageCatalogs } from "@voidmix/intl/testing";
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

/** Product locales come from @raypx/i18n, so adding a language extends this check. */
export function checkLocales(
  root: string,
  { locales = SUPPORTED_LOCALES, base = DEFAULT_LOCALE }: LocaleCatalogOptions = {},
): string[] {
  const index = discover(root);
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
