import { existsSync, globSync, readFileSync, realpathSync } from "node:fs";
import { join, relative } from "node:path";
import { checkArchitecture } from "./repo/architecture.js";
import { checkDocumentLinks } from "./repo/docs.js";
import { discover } from "./repository.js";
import { checkToolchain } from "./validation/toolchain.js";
import { checkSourceLayers } from "./validation/source-layers.js";
import { checkDeployment } from "./validation/deployment.js";
import { checkEntryConsumers } from "./validation/entries.js";
import { checkIntlEngine } from "./validation/intl-engine.js";

const MAX_MARKDOWN_LINES = 1000;

export function checkMarkdownLength(root: string): string[] {
  return globSync("**/*.md", {
    cwd: root,
    exclude: [
      "**/node_modules/**",
      ".agents/**",
      ".claude/**",
      "**/dist/**",
      "e2e/test-results/**",
    ],
  }).flatMap((file) => {
    // Skill aliases must retain the same vendored exclusion as their canonical directory.
    const canonical = relative(root, realpathSync(join(root, file))).replaceAll("\\", "/");
    if (/^(?:\.agents|\.claude)\//.test(canonical)) return [];
    const lines = readFileSync(join(root, file), "utf8").split(/\r?\n/);
    if (lines.at(-1) === "") lines.pop();
    return lines.length > MAX_MARKDOWN_LINES
      ? [`${file}: Markdown document exceeds ${MAX_MARKDOWN_LINES} lines`]
      : [];
  });
}

/** `*.test.*` is Vitest; `*.spec.*` is Playwright and lives only under an `e2e/` directory. */
export function checkSpecPlacement(root: string): string[] {
  return globSync("**/*.spec.{ts,tsx,mts,cts,js,jsx,mjs,cjs}", {
    cwd: root,
    exclude: ["**/node_modules/**", ".agents/**", ".claude/**", "skills/**", "**/dist/**"],
  })
    .map((file) => file.replaceAll("\\", "/"))
    .filter((file) => !/(?:^|\/)e2e\//.test(file))
    .sort()
    .map((file) => `${file}: *.spec.* is reserved for Playwright under e2e/; use *.test.*`);
}

export function policy(root: string): string[] {
  const index = discover(root);
  const findings = checkArchitecture(index);
  findings.push(...checkSourceLayers(root, index));
  findings.push(...checkEntryConsumers(root, index));
  findings.push(...checkIntlEngine(index));
  findings.push(...checkDeployment(root));
  for (const workspace of index.workspaces) {
    const file = join(root, workspace.path, "AGENTS.md");
    if (!existsSync(file)) findings.push(`${workspace.path}: missing AGENTS.md`);
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
      "skills/**/*.md",
      ...index.workspaces.map((w) => `${w.path}/AGENTS.md`),
    ],
    { cwd: root },
  );
  findings.push(...checkMarkdownLength(root));
  findings.push(...checkSpecPlacement(root));
  findings.push(...checkDocumentLinks(root, documents));
  findings.push(...checkToolchain(root, documents));
  return [...new Set(findings)];
}

export { checkLocales, writeLocaleTypes } from "./validation/locales.js";
