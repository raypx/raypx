import { readFileSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { it, expect } from "bun:test";
import { runProcessSync } from "@raypx/runtime-node/process";
import { argumentKey } from "../../src/tasks/arguments.ts";
import { workspaceFixtures } from "../helpers/workspace.ts";

const { fixture } = workspaceFixtures();
const repository = resolve(import.meta.dirname, "../../../..");
// VP's Windows worker can use Bun's node.exe mode, which treats `run` as a file.
const runtime = Bun.which("bun");
if (!runtime) throw new Error("Task leaf acceptance requires the pinned Bun CLI on PATH");

it.each([
  ["packages/tooling/src/tasks/leaf.ts", ["test"]],
  ["packages/runtime-node/scripts/task.ts", []],
  ["packages/tsconfig/scripts/task.ts", []],
] as const)("%s preserves task arguments, environment and exit status", (leaf, runner) => {
  const root = fixture();
  writeFileSync(
    join(root, "package.json"),
    JSON.stringify({ name: "task-fixture", scripts: { test: "bun capture.mjs" } }),
  );
  writeFileSync(
    join(root, "capture.mjs"),
    `import { writeFileSync } from 'node:fs';
writeFileSync('result.json', JSON.stringify({ args: process.argv.slice(2), value: process.env.RAYPX_LEAF_TEST }));
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

it("runs a delegated package runner once with literal arguments scoped to the public task", () => {
  const root = fixture();
  writeFileSync(
    join(root, "package.json"),
    JSON.stringify({
      name: "task-fixture",
      scripts: { test: "bun missing-public-entry.ts", _test: "bun runner.ts" },
    }),
  );
  writeFileSync(
    join(root, "runner.ts"),
    'import {appendFileSync} from "node:fs"; appendFileSync("calls.jsonl", JSON.stringify(process.argv.slice(2))+"\\n");',
  );
  const args = ["two words", "literal-$VALUE", "--reporter=json"];
  const result = runProcessSync(
    [runtime, join(repository, "packages/tooling/src/tasks/leaf.ts"), "test", "_test"],
    {
      cwd: root,
      env: { ...process.env, [argumentKey("task-fixture#test")]: JSON.stringify(args) },
    },
  );
  expect(result.exitCode).toBe(0);
  const calls = readFileSync(join(root, "calls.jsonl"), "utf8").trim().split("\n");
  expect(calls.map((line) => JSON.parse(line))).toEqual([args]);
});
