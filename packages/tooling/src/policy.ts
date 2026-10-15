import { existsSync, globSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseSync } from "oxc-parser";
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
    const extract = (path: string): Record<string, string> => {
      const source = readFileSync(join(root, path), "utf8");
      const result: Record<string, string> = {};
      function flatten(value: unknown, prefix = "") {
        if (!value || typeof value !== "object") return;
        const node = value as Record<string, unknown>;
        if (node.type === "TSAsExpression" || node.type === "TSSatisfiesExpression")
          return flatten(node.expression, prefix);
        if (node.type === "Literal" && typeof node.value === "string") {
          result[prefix] = node.value;
          return;
        }
        if (node.type !== "ObjectExpression")
          throw new Error(`${path}: catalogs must contain static string objects`);
        for (const property of node.properties as Record<string, unknown>[]) {
          if (property.type !== "Property" || property.computed)
            throw new Error(`${path}: dynamic catalog keys are unsupported`);
          const key = property.key as { value?: unknown; name?: string };
          const name = typeof key.value === "string" ? key.value : key.name;
          if (!name) throw new Error(`${path}: invalid catalog key`);
          flatten(property.value, prefix ? `${prefix}.${name}` : name);
        }
      }
      if (path.endsWith(".json")) {
        const walk = (value: unknown, prefix: string) => {
          if (typeof value === "string") {
            result[prefix] = value;
            return;
          }
          if (!value || typeof value !== "object")
            throw new Error(`${path}: expected string messages`);
          for (const [key, child] of Object.entries(value))
            walk(child, prefix ? `${prefix}.${key}` : key);
        };
        walk(JSON.parse(source), "");
      } else {
        const parsed = parseSync(path, source);
        const declaration = parsed.program.body.find(
          (node) => node.type === "ExportDefaultDeclaration",
        );
        if (!declaration || declaration.type !== "ExportDefaultDeclaration")
          throw new Error(`${path}: expected a default static catalog`);
        flatten(declaration.declaration);
      }
      return result;
    };
    const en = extract(pair.en);
    const zh = extract(pair.zh);
    const compare = (a: string, b: string) => a.localeCompare(b);
    if (
      JSON.stringify(Object.keys(en).sort(compare)) !==
      JSON.stringify(Object.keys(zh).sort(compare))
    )
      findings.push(`${folder}: en/zh catalog keys differ`);
    for (const [key, value] of Object.entries(en)) {
      const variables = (message: string) =>
        [...message.matchAll(/\{([A-Za-z_]\w*)(?:[,}])/g)].map((match) => match[1]!).sort(compare);
      if (zh[key] && JSON.stringify(variables(value)) !== JSON.stringify(variables(zh[key])))
        findings.push(`${folder}: interpolation variables differ for ${key}`);
    }
  }
  return findings;
}
