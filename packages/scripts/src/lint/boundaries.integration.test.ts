import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { afterAll, beforeAll, describe, expect, it } from "vite-plus/test";
import { createArchitectureIndex, type ArchitectureWorkspace } from "../architecture/model.ts";

const workspace = (path: string, manifest: ArchitectureWorkspace["manifest"], aliases = {}) => ({
  path,
  manifest,
  aliases,
});
const exports = { ".": "./src/index.ts" };
const index = createArchitectureIndex([
  workspace(
    "apps/web",
    {
      name: "web",
      dependencies: { "@raypx/ui": "*", "@raypx/db": "*", "@raypx/scripts": "*", desktop: "*" },
      imports: { "#db/*": "../../packages/db/src/*" },
    },
    { "@private/*": ["../../packages/*/src/index.ts"] },
  ),
  workspace(
    "apps/desktop",
    {
      name: "desktop",
      dependencies: { "@raypx/storage": "*" },
      imports: { "#native/*": "./native/*" },
    },
    { "@native/*": ["./native/*"] },
  ),
  workspace("packages/ui", {
    name: "@raypx/ui",
    exports: { "./components/ui/*": "./src/components/ui/*.tsx" },
  }),
  workspace("packages/db", {
    name: "@raypx/db",
    exports,
    devDependencies: { "@raypx/application": "*" },
  }),
  workspace("packages/application", { name: "@raypx/application", exports }),
  workspace("packages/scripts", { name: "@raypx/scripts", exports }),
  workspace("packages/storage", { name: "@raypx/storage", exports }),
]);
const web = "/repo/apps/web/src/index.ts";
const desktop = "/repo/apps/desktop/src/index.ts";

interface ExpectedError {
  message?: RegExp;
  line?: number;
  column?: number;
}
interface RuleCase {
  filename: string;
  code: string;
  errors?: number | ExpectedError[];
}
const cases: { valid: RuleCase[]; invalid: RuleCase[] } = {
  valid: [
    { filename: web, code: 'import "@raypx/ui/components/ui/button";' },
    { filename: web, code: 'const target = "@raypx/db"; import(target);' },
    { filename: desktop, code: 'import type { DesktopRpc } from "../native/rpc";' },
    { filename: desktop, code: 'import type { DesktopRpc } from "@native/rpc.ts";' },
    { filename: desktop, code: 'import type { DesktopRpc } from "#native/rpc.mts";' },
    {
      filename: "/repo/apps/desktop/native/main.ts",
      code: 'import "node:fs"; import "bun:ffi";',
    },
    { filename: "/repo/packages/db/src/index.test.ts", code: 'import "@raypx/application";' },
    { filename: "/repo/packages/db/tests/index.ts", code: 'import "@raypx/application";' },
    { filename: "/repo/apps/web/src/routeTree.gen.ts", code: 'import "@raypx/db";' },
    { filename: "/repo/apps/web/src/generated.d.ts", code: 'import "@raypx/db";' },
    { filename: "/repo/apps/web/src/generated.d.mts", code: 'import "@raypx/db";' },
    { filename: "/repo/vite.config.ts", code: 'import "@raypx/db";' },
  ],
  invalid: [
    {
      filename: web,
      code: 'import "@raypx/db";',
      errors: [{ message: /forbidden runtime dependency/, line: 1, column: 7 }],
    },
    {
      filename: web,
      code: 'export { value } from "@raypx/db";',
      errors: [{ message: /forbidden runtime dependency/ }],
    },
    {
      filename: web,
      code: 'export * from "@raypx/db";',
      errors: [{ message: /forbidden runtime dependency/ }],
    },
    {
      filename: web,
      code: 'const value = import("@raypx/scripts");',
      errors: [{ message: /forbidden runtime dependency/ }],
    },
    {
      filename: web,
      code: 'type Value = import("@raypx/db").Value;',
      errors: [{ message: /forbidden runtime dependency/ }],
    },
    {
      filename: web,
      code: 'import type { Value } from "@raypx/db";',
      errors: [{ message: /forbidden runtime dependency/ }],
    },
    {
      filename: web,
      code: 'import "@raypx/db/src/private";',
      errors: [{ message: /private cross-package/ }, { message: /forbidden runtime/ }],
    },
    {
      filename: web,
      code: 'export * from "../../../packages/db/src/index";',
      errors: [{ message: /private cross-package/ }, { message: /forbidden runtime/ }],
    },
    {
      filename: web,
      code: 'import "@private/db";',
      errors: [{ message: /private cross-package/ }, { message: /forbidden runtime/ }],
    },
    {
      filename: web,
      code: 'import "#db/index.ts";',
      errors: [{ message: /private cross-package/ }, { message: /forbidden runtime/ }],
    },
    {
      filename: web,
      code: 'import "desktop";',
      errors: [{ message: /private cross-package/ }, { message: /forbidden runtime/ }],
    },
    {
      filename: "/repo/packages/db/src/index.ts",
      code: 'import "@raypx/application";',
      errors: [{ message: /forbidden runtime/ }, { message: /declared production dependency/ }],
    },
    {
      filename: "/repo/apps/web/src/index.test.ts",
      code: 'import "@raypx/db/src/private";',
      errors: [{ message: /private cross-package/ }],
    },
    {
      filename: desktop,
      code: 'import "@raypx/storage";',
      errors: [{ message: /forbidden runtime/ }],
    },
    {
      filename: desktop,
      code: 'import "node:fs"; import "bun:ffi";',
      errors: 2,
    },
    {
      filename: desktop,
      code: 'import "electrobun"; import "electrobun/main/browser-window"; import "electrobun/bun"; import "bun:ffi";',
      errors: 4,
    },
    {
      filename: desktop,
      code: 'import "../native/main";',
      errors: [{ message: /window bridge/ }],
    },
    {
      filename: desktop,
      code: 'import "@native/main.ts";',
      errors: [{ message: /window bridge/ }],
    },
    {
      filename: desktop,
      code: 'import "#native/main.ts";',
      errors: [{ message: /window bridge/ }],
    },
  ],
};

interface Diagnostic {
  filename: string;
  code: string;
  message: string;
  labels?: { span: { line: number; column: number } }[];
}
const allCases = [...cases.valid, ...cases.invalid];
let directory: string;
let diagnostics: Diagnostic[] = [];
const files: string[] = [];

beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), "raypx-boundary-cli-"));
  const pluginPath = join(directory, "plugin.mjs");
  await writeFile(
    pluginPath,
    `
import { definePlugin } from ${JSON.stringify(import.meta.resolve("vite-plus/lint/plugins"))};
import { createArchitectureIndex } from ${JSON.stringify(new URL("../architecture/model.ts", import.meta.url).href)};
import { createBoundariesRule } from ${JSON.stringify(new URL("./boundaries.ts", import.meta.url).href)};
const index = createArchitectureIndex(${JSON.stringify(index.workspaces)});
const base = createBoundariesRule(() => index, "/");
export default definePlugin({ meta: { name: "raypx" }, rules: { boundaries: {
  ...base,
  create(context) {
    if (process.versions.bun !== "1.4.0") throw new Error("Boundary plugin must execute with Bun 1.4.0.");
    const segments = context.filename.split(String.fromCharCode(92)).join("/").split("/");
    const position = segments.findIndex(segment => segment.startsWith("case-"));
    if (position < 0) throw new Error("Missing boundary test case directory.");
    const root = segments.slice(0, position + 1).join("/");
    return createBoundariesRule(() => index, root).create(context);
  }
} } });
`,
  );
  const configPath = join(directory, "vite.config.ts");
  await writeFile(
    configPath,
    `export default { lint: {
    categories: { correctness: "off" },
    jsPlugins: [{ name: "raypx", specifier: ${JSON.stringify(pluginPath)} }],
    rules: { "raypx/boundaries": "error" }
  } };`,
  );
  for (const [caseIndex, ruleCase] of allCases.entries()) {
    const file = join(directory, "case-" + caseIndex, ruleCase.filename.slice("/repo/".length));
    files.push(file);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, ruleCase.code);
  }
  const sentinel = join(directory, "node");
  await writeFile(sentinel, "#!/bin/sh\nprintf NODE_EXECUTOR_FORBIDDEN >&2\nexit 97\n", {
    mode: 0o755,
  });
  const result = spawnSync(
    process.execPath,
    [
      "--no-env-file",
      "--no-install",
      "--bun",
      "vp",
      "lint",
      "--config",
      configPath,
      "--format=json",
      "--no-ignore",
      ...files,
    ],
    { encoding: "utf8", env: { ...process.env, PATH: directory + ":" + process.env.PATH } },
  );
  expect(result.error).toBeUndefined();
  expect(result.status).toBe(1);
  expect(result.stderr).not.toContain("NODE_EXECUTOR_FORBIDDEN");
  const report = JSON.parse(result.stdout) as {
    diagnostics: Diagnostic[];
    number_of_files: number;
  };
  expect(report.number_of_files).toBe(allCases.length);
  diagnostics = report.diagnostics;
  expect(diagnostics.filter((diagnostic) => diagnostic.code !== "raypx(boundaries)")).toEqual([]);
}, 30_000);

afterAll(async () => {
  if (directory) await rm(directory, { recursive: true, force: true });
});

describe("raypx/boundaries through bundled Oxlint on Bun", () => {
  for (const [caseIndex, ruleCase] of allCases.entries())
    it(ruleCase.code, () => {
      const actual = diagnostics.filter((diagnostic) => diagnostic.filename === files[caseIndex]);
      const errors = ruleCase.errors;
      expect(actual).toHaveLength(typeof errors === "number" ? errors : (errors?.length ?? 0));
      if (Array.isArray(errors))
        for (const expected of errors) {
          const diagnostic = actual.find(
            (candidate) => !expected.message || expected.message.test(candidate.message),
          );
          expect(diagnostic).toBeDefined();
          if (expected.line !== undefined)
            expect(diagnostic?.labels?.[0]?.span.line).toBe(expected.line);
          // Native Oxlint reports one-based columns; RuleTester reported zero-based columns.
          if (expected.column !== undefined)
            expect(diagnostic?.labels?.[0]?.span.column).toBe(expected.column + 1);
        }
    });
});
