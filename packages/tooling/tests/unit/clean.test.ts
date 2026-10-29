import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { expect, it } from "vite-plus/test";
import { clean, cleanArtifacts } from "../../src/clean.js";
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
    `${library}/node_modules/.cache/raypx-tests/run.json`,
    "node_modules/.cache/raypx-tests/run.json",
    ".artifacts/probe/cache/task.tar.zst",
    "apps/desktop/artifacts/browser/client/index.html",
    "apps/desktop/resources/bin/raypx",
    "apps/desktop/generated/local-methods.json",
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
    "apps/desktop/resources/icon.png",
    ".git/config",
    ".env.local",
    "data/profile.sqlite",
    "apps/desktop/main.go",
    "apps/desktop/mygo.config.ts",
    "apps/desktop/resources/icon.png",
    "packages/tooling/src/validation/inventory.ts",
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

it("cleans reports independently while preserving built applications, sidecars and validation tools", async () => {
  const root = fixture();
  const library = member(root, "feature");
  const outputs = [
    ".artifacts/tests/run/inventory.json",
    `${library}/.artifacts/probe/result.json`,
    "node_modules/.cache/raypx-tests/run.json",
    `${library}/node_modules/.cache/raypx-tests/run.json`,
    `${library}/coverage/lcov.info`,
    "e2e/test-results/trace.zip",
    "e2e/playwright-report/index.html",
  ];
  const preserved = [
    `${library}/dist/index.js`,
    `${library}/node_modules/.vite/task-cache/task.json`,
    "apps/desktop/resources/bin/raypx",
    "apps/desktop/build/darwin-arm64/Raypx.app/Contents/MacOS/Raypx",
    "packages/tooling/src/validation/inventory.ts",
    "data/profile.sqlite",
    "bun.lock",
  ];
  for (const path of [...outputs, ...preserved]) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), path);
  }
  await cleanArtifacts(root);
  await cleanArtifacts(root);
  for (const path of outputs) expect(existsSync(join(root, path))).toBe(false);
  for (const path of preserved) expect(readFileSync(join(root, path), "utf8")).toBe(path);
});
