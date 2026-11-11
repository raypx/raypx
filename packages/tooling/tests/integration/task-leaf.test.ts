import { readFileSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { it, expect } from "vite-plus/test";
import { runProcessSync } from "@raypx/runtime-node/process";
import { argumentKey } from "../../src/tasks/arguments.js";
import { workspaceFixtures } from "../helpers/workspace.js";

const { fixture } = workspaceFixtures();
const repository = resolve(import.meta.dirname, "../../../..");
// VP's Windows worker can use Bun's node.exe mode, which treats `run` as a file.
const runtime = Bun.which("bun");
if (!runtime) throw new Error("Task leaf acceptance requires the pinned Bun CLI on PATH");

it.each([
  ["packages/tooling/src/tasks/leaf.ts", ["_test"]],
  ["packages/runtime-node/scripts/task.ts", []],
  ["packages/tsconfig/scripts/task.ts", []],
] as const)("%s preserves task arguments, environment and exit status", (leaf, runner) => {
  const root = fixture();
  writeFileSync(
    join(root, "package.json"),
    JSON.stringify({
      name: "task-fixture",
      scripts: runner.length
        ? { test: "bun missing-public-entry.ts", _test: "bun capture.mjs" }
        : { test: "bun capture.mjs" },
    }),
  );
  writeFileSync(
    join(root, "capture.mjs"),
    `import { appendFileSync } from 'node:fs';
appendFileSync('result.json', JSON.stringify({ args: process.argv.slice(2), value: process.env.RAYPX_LEAF_TEST })+'\\n');
process.exit(23);`,
  );
  const args = ["--flag", "中文 path", "$(literal)", "a&b"];
  const result = runProcessSync([runtime, join(repository, leaf), "test", ...runner], {
    cwd: root,
    env: {
      ...process.env,
      [argumentKey("task-fixture#test")]: JSON.stringify(args),
      RAYPX_LEAF_TEST: "inherited environment",
    },
  });
  expect(result.exitCode).toBe(23);
  expect(JSON.parse(readFileSync(join(root, "result.json"), "utf8"))).toEqual({
    args,
    value: "inherited environment",
  });
});
