import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { expect, it } from "vite-plus/test";
import { discover } from "../../src/repository.js";

const root = resolve(import.meta.dirname, "../../../..");

it("keeps every ordinary suite connected to one nonempty focused test entry", () => {
  const findings: string[] = [];
  for (const workspace of discover(root).workspaces) {
    const directory = join(root, workspace.path);
    const scripts = workspace.manifest.scripts ?? {};
    const files = Array.from(
      new Bun.Glob("tests/**/*.{test,spec}.{ts,tsx}").scanSync({ cwd: directory }),
    ).map((file) => file.replaceAll("\\", "/"));
    for (const file of files)
      if (/\b(?:it|test|describe)\.only\b/.test(readFileSync(join(directory, file), "utf8")))
        findings.push(`${workspace.path}/${file}: focused test left enabled`);
    // Playwright has a separate root launcher and explicit external acceptance gates.
    if (scripts.e2e && !existsSync(join(directory, "vitest.config.ts"))) continue;
    const ordinary = files.filter((file) => !/^tests\/(?:postgres|redis)\//.test(file));
    if (ordinary.length && !scripts.test) findings.push(`${workspace.path}: missing test entry`);
    const layers = new Set(
      ordinary.map((file) => file.match(/\/(component|integration)\//)?.[1] ?? "unit"),
    );
    for (const layer of ["unit", "component", "integration"]) {
      const entry = `test:${layer}`;
      if (layers.has(layer) && !scripts[entry])
        findings.push(`${workspace.path}: ${entry} misses existing suites`);
      if (!layers.has(layer) && scripts[entry])
        findings.push(`${workspace.path}: ${entry} has no suites`);
    }
  }
  expect(findings).toEqual([]);
});
