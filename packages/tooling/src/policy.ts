import { existsSync, globSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { checkArchitecture } from "@voidmix/devkit/architecture";
import { readStaticCatalog, type CatalogTree } from "@voidmix/devkit/catalogs";
import { checkDocumentLinks } from "@voidmix/devkit/docs";
import { checkToolchain } from "@voidmix/devkit/toolchain";
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

export function checkLocales(root: string): string[] {
  const index = discover(root);
  const dictionaries = globSync(
    index.workspaces.map((w) => `${w.path}/src/messages/{en,zh}.{ts,json}`),
    { cwd: root },
  );
  const pairs = new Map<string, Record<string, string>>();
  for (const path of dictionaries) {
    const locale = /\/(en|zh)\./.exec(path)?.[1];
    if (!locale) continue;
    const key = path.replace(/\/(en|zh)\.(ts|json)$/, "");
    const pair = pairs.get(key) ?? {};
    pair[locale] = path;
    pairs.set(key, pair);
  }
  const findings: string[] = [];
  for (const [folder, pair] of pairs) {
    if (!pair.en || !pair.zh) {
      findings.push(`${folder}: both en and zh catalogs are required`);
      continue;
    }
    const catalogs: { en?: CatalogTree; zh?: CatalogTree } = {};
    for (const locale of ["en", "zh"] as const) {
      const path = pair[locale]!;
      try {
        catalogs[locale] = readStaticCatalog(path, readFileSync(join(root, path), "utf8"));
      } catch (error) {
        findings.push(error instanceof Error ? error.message : `${path}: invalid catalog`);
      }
    }
    if (!catalogs.en || !catalogs.zh) continue;
    for (const issue of compareMessageCatalogs(catalogs.en, catalogs.zh, "en", "zh")) {
      const source = issue.side ? pair[issue.side === "left" ? "en" : "zh"]! : folder;
      findings.push(`${source}: ${issue.message}; ${issue.fix}`);
    }
  }
  return findings;
}
