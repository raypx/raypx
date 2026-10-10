import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, expect, test } from "vite-plus/test";

const repository = fileURLToPath(new URL("../../", import.meta.url));
const directories: string[] = [];

function write(root: string, path: string, content: string): void {
  const target = join(root, path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content);
}

function fixture(): string {
  // Knip's resolver canonicalizes CLI entries, so its project root must match on macOS /var aliases.
  const root = realpathSync(mkdtempSync(join(tmpdir(), "raypx-knip-")));
  directories.push(root);
  write(
    root,
    "package.json",
    JSON.stringify({
      name: "audit-fixture",
      private: true,
      type: "module",
      workspaces: ["packages/*", "apps/*"],
      scripts: {
        raypx: "bun --no-env-file --no-install scripts/bin/raypx.ts",
        doctor: "bun --no-env-file --no-install scripts/bin/raypx.ts doctor",
        preinstall: "bun packages/config/src/environment.ts",
      },
      devDependencies: { knip: "6.16.0" },
    }),
  );
  copyFileSync(join(repository, "knip.ts"), join(root, "knip.ts"));
  symlinkSync(join(repository, "node_modules"), join(root, "node_modules"), "junction");
  write(
    root,
    "scripts/bin/raypx.ts",
    'import { fileURLToPath } from "node:url";\nimport { toolVersion } from "../lib/cli/bootstrap.ts";\nconst root = fileURLToPath(new URL("../../", import.meta.url));\nconst { runCli } = await import("../cli.ts");\nrunCli([toolVersion(root)]);\n',
  );
  write(
    root,
    "scripts/cli.ts",
    'import { validateConsumerArgs } from "./lib/consumer/cli.ts";\nexport function runCli(args: string[]) { validateConsumerArgs(args); }\n',
  );
  write(
    root,
    "scripts/lib/cli/bootstrap.ts",
    "export function toolVersion(root: string) { return root; }\n",
  );
  write(
    root,
    "scripts/lib/consumer/cli.ts",
    "export function validateConsumerArgs(args: string[]) { return args; }\n",
  );
  write(root, "scripts/doctor.ts", "export function doctor() {}\n");
  write(root, "scripts/setup.ts", "export function setup() {}\n");
  write(root, "scripts/install-hooks.ts", "export function installHooks() {}\n");
  write(root, "playwright.consumer.config.ts", "export default {};\n");
  write(root, "apps/web/package.json", '{"name":"@fixture/web","private":true}');
  write(root, "apps/web/src/router.tsx", "export function getRouter() {}\n");
  write(root, "apps/web/server/plugins/runtime.ts", "export default () => {};\n");
  for (const name of ["config", "env", "db", "client", "ui"]) {
    const exports =
      name === "config"
        ? {}
        : {
            ".": { types: "./dist/index.d.ts", import: "./dist/index.js" },
            "./extra": { types: "./dist/extra.d.ts", import: "./dist/extra.js" },
          };
    write(
      root,
      `packages/${name}/package.json`,
      JSON.stringify({ name: `@fixture/${name}`, private: true, exports }),
    );
    if (name !== "config") {
      write(root, `packages/${name}/src/index.ts`, "export function publicApi() {}\n");
      write(root, `packages/${name}/src/extra.ts`, "export type PublicType = string;\n");
    }
  }
  write(root, "packages/config/src/styles.ts", "export function copyStyles() {}\n");
  write(
    root,
    "packages/config/src/environment.ts",
    "export function checkDevelopmentEnvironment() {}\n",
  );
  write(root, "packages/env/src/cli.ts", "export function validateEnvironment() {}\n");
  write(root, "packages/db/src/cli.ts", "export function migrateDatabase() {}\n");
  write(
    root,
    "packages/client/test/fixtures/core-entry.ts",
    "export const browserFixture = true;\n",
  );
  write(root, "packages/ui/.storybook/preview.tsx", "export default {};\n");
  write(root, "packages/ui/stories/demo.stories.tsx", "export default {};\n");
  return root;
}

function audit(root: string) {
  return spawnSync(
    process.execPath,
    [
      join(repository, "node_modules/knip/bin/knip.js"),
      "--directory",
      root,
      "--config",
      join(root, "knip.ts"),
      "--reporter",
      "json",
      "--no-progress",
    ],
    {
      encoding: "utf8",
      timeout: 30_000,
      env: { PATH: process.env.PATH, NODE_ENV: "test" },
    },
  );
}

afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

test("root Bun commands expose the unified scripts bin graph and narrow source entries", () => {
  const root = fixture();
  const result = audit(root);
  expect(result.error).toBeUndefined();
  expect({
    status: result.status,
    failure: result.status === 0 ? "" : result.stdout + result.stderr,
  }).toEqual({ status: 0, failure: "" });
  expect(JSON.parse(result.stdout)).toMatchObject({ issues: [] });
}, 30_000);

test("current audit rules detect unused bin, library, package source, and dependency", () => {
  const root = fixture();
  write(root, "scripts/bin/unused-command.ts", "export function accidentalCommand() {}\n");
  write(root, "scripts/lib/unused-helper.ts", "export function accidentalHelper() {}\n");
  write(
    root,
    "packages/client/src/unused-internal.ts",
    "export function accidentalDeadCode() {}\n",
  );
  write(
    root,
    "packages/client/package.json",
    JSON.stringify({
      name: "@fixture/client",
      private: true,
      exports: {
        ".": { types: "./dist/index.d.ts", import: "./dist/index.js" },
        "./extra": { types: "./dist/extra.d.ts", import: "./dist/extra.js" },
      },
      dependencies: { "unused-fixture-dependency": "1.0.0" },
    }),
  );
  const result = audit(root);
  expect(result.error).toBeUndefined();
  expect(result.status).toBe(1);
  expect(result.stdout).toContain("unused-command.ts");
  expect(result.stdout).toContain("unused-helper.ts");
  expect(result.stdout).toContain("unused-internal.ts");
  expect(result.stdout).toContain("unused-fixture-dependency");
  expect(result.stdout).not.toContain("publicApi");
  expect(result.stdout).not.toContain("PublicType");
}, 30_000);
