import { existsSync, globSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseSync } from "oxc-parser";
import { compareMessageCatalogs } from "@voidmix/intl/testing";
import type { MessageTree } from "@voidmix/intl/types";
import { checkArchitecture } from "./architecture.js";
import { checkToolchain } from "./toolchain.js";
import { discover } from "./workspaces.js";

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
  for (const file of documents) {
    const source = readFileSync(join(root, file), "utf8");
    for (const match of source.matchAll(/\]\(([^\s)]+)(?:\s+"[^"]*")?\)/g)) {
      const url = match[1]!;
      if (/^(?:[a-z]+:|#|\/)/i.test(url)) continue;
      const path = url.split("#")[0]!.split("?")[0]!;
      if (path && !existsSync(resolve(root, file, "..", decodeURIComponent(path))))
        findings.push(`${file}: broken documentation link ${url}`);
    }
  }
  // Acceptance records describe the release they ran on and are not rewritten on upgrade.
  findings.push(
    ...checkToolchain(
      root,
      documents.filter((file) => file !== "docs/development/foundation-acceptance.md"),
    ),
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
  // Catalogs are static objects. Oxc reads their keys and string values without executing modules.
  for (const [folder, pair] of pairs) {
    if (!pair.en || !pair.zh) {
      findings.push(`${folder}: both en and zh catalogs are required`);
      continue;
    }
    const extract = (path: string): MessageTree => {
      const source = readFileSync(join(root, path), "utf8");
      const object = (): Record<string, string | MessageTree> => Object.create(null);
      function readNode(value: unknown): string | MessageTree {
        if (!value || typeof value !== "object")
          throw new Error(`${path}: catalogs must contain static string objects`);
        const node = value as Record<string, unknown>;
        if (node.type === "TSAsExpression" || node.type === "TSSatisfiesExpression")
          return readNode(node.expression);
        if (node.type === "Literal" && typeof node.value === "string") return node.value;
        if (node.type !== "ObjectExpression")
          throw new Error(`${path}: catalogs must contain static string objects`);
        const result = object();
        for (const property of node.properties as Record<string, unknown>[]) {
          if (property.type !== "Property" || property.computed)
            throw new Error(`${path}: dynamic catalog keys are unsupported`);
          const key = property.key as { value?: unknown; name?: string };
          const name = typeof key.value === "string" ? key.value : key.name;
          if (!name) throw new Error(`${path}: invalid catalog key`);
          result[name] = readNode(property.value);
        }
        return result;
      }
      function readJson(value: unknown): string | MessageTree {
        if (typeof value === "string") return value;
        if (!value || typeof value !== "object" || Array.isArray(value))
          throw new Error(`${path}: expected static string objects`);
        const result = object();
        for (const [key, child] of Object.entries(value)) result[key] = readJson(child);
        return result;
      }
      let result: string | MessageTree;
      if (path.endsWith(".json")) result = readJson(JSON.parse(source));
      else {
        const parsed = parseSync(path, source);
        if (parsed.errors.length) throw new Error(`${path}: ${parsed.errors[0]!.message}`);
        const declaration = parsed.program.body.find(
          (node) => node.type === "ExportDefaultDeclaration",
        );
        if (!declaration || declaration.type !== "ExportDefaultDeclaration")
          throw new Error(`${path}: expected a default static catalog`);
        result = readNode(declaration.declaration);
      }
      if (typeof result === "string") throw new Error(`${path}: expected a catalog object`);
      return result;
    };
    const catalogs: { en?: MessageTree; zh?: MessageTree } = {};
    for (const locale of ["en", "zh"] as const) {
      try {
        catalogs[locale] = extract(pair[locale]!);
      } catch (error) {
        findings.push(error instanceof Error ? error.message : `${pair[locale]}: invalid catalog`);
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
