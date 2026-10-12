import { existsSync } from "node:fs";
import { join } from "node:path";
import { expect, it, vi } from "vite-plus/test";
import { temporaryRepository } from "../test-fixtures.js";
import { runCommand } from "../runtime/process.js";
import { stageRuntimeArtifact } from "./artifact.js";
import { verifyWorkerRuntime } from "./worker.js";

const metadata = JSON.stringify({ preset: "bun", serverEntry: "server/index.mjs" });
const output = "apps/worker/.output";

function dependencies(repositoryRoot: string) {
  const processEnv = Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] => entry[1] !== undefined,
    ),
  );
  delete processEnv.RAYPX_ARTIFACT_ENV_PROBE;
  return { repositoryRoot, processEnv, runCommand, log: vi.fn() };
}

function stages() {
  const directories: string[] = [];
  return {
    directories,
    async stageOutput(source: string) {
      const stage = await stageRuntimeArtifact(source);
      directories.push(stage.directory);
      return stage;
    },
  };
}

it("runs a relocated Worker with sibling Runner and package assets, without loading env files", async () => {
  const root = await temporaryRepository({
    [`${output}/nitro.json`]: metadata,
    [`${output}/.env`]: "RAYPX_ARTIFACT_ENV_PROBE=should-not-load\n",
    [`${output}/server/index.mjs`]: `import assert from "node:assert/strict";
import { asset } from "packaged-runtime";
import { runner } from "./runner.mjs";
assert.equal(process.versions.bun, "1.4.0");
assert.equal(process.env.NODE_ENV, "production");
assert.equal(process.env.RAYPX_ARTIFACT_ENV_PROBE, undefined);
assert.ok(process.argv.includes("--check"));
assert.equal(asset, "package asset");
assert.equal(runner, "sibling Runner");
console.log("standalone Worker checked");
`,
    [`${output}/server/runner.mjs`]: 'export const runner = "sibling Runner";\n',
    [`${output}/server/node_modules/packaged-runtime/package.json`]: JSON.stringify({
      name: "packaged-runtime",
      type: "module",
      exports: "./index.mjs",
    }),
    [`${output}/server/node_modules/packaged-runtime/index.mjs`]:
      'import { readFileSync } from "node:fs"; export const asset = readFileSync(new URL("./asset.txt", import.meta.url), "utf8");\n',
    [`${output}/server/node_modules/packaged-runtime/asset.txt`]: "package asset",
  });
  const staged = stages();
  await verifyWorkerRuntime(dependencies(root), { ...staged, captureOutput: true });
  expect(staged.directories).toHaveLength(1);
  expect(existsSync(staged.directories[0]!)).toBe(false);
  expect(existsSync(join(root, output, "server/index.mjs"))).toBe(true);
});

it("rejects a missing artifact dependency even when the checkout can supply it", async () => {
  const root = await temporaryRepository({
    [`${output}/nitro.json`]: metadata,
    [`${output}/server/index.mjs`]: 'import "checkout-only-runtime";\n',
    "node_modules/checkout-only-runtime/package.json": JSON.stringify({
      name: "checkout-only-runtime",
      type: "module",
      exports: "./index.mjs",
    }),
    "node_modules/checkout-only-runtime/index.mjs": 'console.log("checkout fallback");\n',
  });
  const deps = dependencies(root);
  await expect(
    runCommand(
      ["bun", "--no-env-file", "--no-install", join(root, output, "server/index.mjs"), "--check"],
      { cwd: root, env: deps.processEnv, captureOutput: true, timeoutMs: 5_000 },
    ),
  ).resolves.toBeUndefined();
  const staged = stages();
  await expect(verifyWorkerRuntime(deps, { ...staged, captureOutput: true })).rejects.toThrow(
    "checkout-only-runtime",
  );
  expect(staged.directories).toHaveLength(1);
  expect(existsSync(staged.directories[0]!)).toBe(false);
  expect(existsSync(join(root, "node_modules/checkout-only-runtime/index.mjs"))).toBe(true);
});

it("terminates Worker initialization and cleans staging after the child closes", async () => {
  const root = await temporaryRepository({
    [`${output}/nitro.json`]: metadata,
    [`${output}/server/index.mjs`]:
      'console.error("Worker initialization stalled"); setInterval(() => {}, 1_000); await new Promise(() => {});\n',
  });
  const staged = stages();
  await expect(
    verifyWorkerRuntime(dependencies(root), { ...staged, captureOutput: true, timeoutMs: 500 }),
  ).rejects.toMatchObject({
    signal: "SIGTERM",
    message: expect.stringContaining("Worker initialization stalled"),
  });
  expect(staged.directories).toHaveLength(1);
  expect(existsSync(staged.directories[0]!)).toBe(false);
});
