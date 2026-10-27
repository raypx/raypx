import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { expect, it } from "vite-plus/test";
import { clean } from "../../src/clean.js";
import { workspaceFixtures } from "../helpers/workspace.js";

const { fixture, member } = workspaceFixtures();

it("cleans generated files while preserving source, dependencies and local data on repeated runs", async () => {
  const root = fixture();
  const library = member(root, "feature");
  const outputs = [
    `${library}/dist/index.js`,
    `${library}/coverage/lcov.info`,
    `${library}/.turbo/check.log`,
    ".turbo/cache/task.tar.zst",
    "node_modules/.vite/task-cache/task.json",
    "node_modules/.vitest-cache/module.bin",
    `${library}/node_modules/.vite/vitest/results.json`,
    ".artifacts/probe/cache/task.tar.zst",
    "apps/desktop/build/stable-macos-arm64/Raypx.app/Contents/MacOS/launcher",
    "apps/desktop/artifacts/raypx.tar.zst",
    "apps/desktop/.smoke-build.noindex/dev-macos-arm64/Raypx Test-dev.app/Contents/MacOS/launcher",
    "apps/desktop/.smoke-artifacts.noindex/raypx-test.tar.zst",
    "apps/desktop/.hutch/bin/raypx",
    "apps/desktop/.cottontail-tmp/unpacked/bun",
    "e2e/test-results/screenshot.png",
    "e2e/playwright-report/index.html",
  ];
  const preserved = [
    `${library}/src/index.ts`,
    `${library}/build/source.ts`,
    `${library}/artifacts/fixture.json`,
    `${library}/node_modules/dependency/index.js`,
    "node_modules/.bun/package/index.js",
    "bun.lock",
    ".git/config",
    ".env.local",
    "data/profile.sqlite",
    "apps/desktop/native/main.ts",
    "compose.yaml",
  ];
  for (const path of [...outputs, ...preserved]) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), path);
  }

  await clean(root);
  await clean(root);

  for (const path of outputs) expect(existsSync(join(root, path))).toBe(false);
  for (const path of preserved) expect(readFileSync(join(root, path), "utf8")).toBe(path);
});
