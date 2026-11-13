import { existsSync, globSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, posix } from "node:path";
import { readStaticCatalog } from "./catalogs.js";

const suffix = ".d.json.ts";

/**
 * TypeScript widens every value of an imported JSON module to `string`, which would
 * drop ICU argument and rich-text tag checks at call sites. A sibling declaration
 * restores the literal types; `allowArbitraryExtensions` makes the compiler use it.
 * `export =` types the default import under both NodeNext and Bundler resolution.
 */
function catalogDeclaration(path: string, source: string): string {
  const catalog = readStaticCatalog(path, source);
  return [
    `// Generated from ${posix.basename(path)} by \`raypx-dev i18n types\`. Do not edit.`,
    `declare const messages: ${JSON.stringify(catalog, null, 2)};`,
    "export = messages;",
    "",
  ].join("\n");
}

function catalogDeclarationPath(catalog: string): string {
  return catalog.replace(/\.json$/, suffix);
}

/**
 * Writes the declaration of every reference-language catalog and removes one whose
 * catalog is gone. Returns the paths it changed.
 */
export function writeCatalogDeclarations(
  root: string,
  workspaces: readonly string[],
  base: string,
): string[] {
  const changed: string[] = [];
  for (const workspace of workspaces) {
    const folder = `${workspace}/locales/${base}`;
    const expected = new Set<string>();
    for (const catalog of globSync(`${folder}/*.json`, { cwd: root })) {
      const path = catalog.replaceAll("\\", "/");
      const target = catalogDeclarationPath(path);
      expected.add(target);
      const next = catalogDeclaration(path, readFileSync(join(root, path), "utf8"));
      const file = join(root, target);
      if (existsSync(file) && readFileSync(file, "utf8") === next) continue;
      writeFileSync(file, next);
      changed.push(target);
    }
    for (const stale of globSync(`${workspace}/locales/*/*${suffix}`, { cwd: root })) {
      const path = stale.replaceAll("\\", "/");
      if (expected.has(path)) continue;
      rmSync(join(root, path));
      changed.push(path);
    }
  }
  return changed.sort();
}
