import { readFileSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { it, expect } from "vite-plus/test";
import { runProcessSync } from "@raypx/runtime-node/process";
import { argumentKey } from "../../src/tasks/arguments.ts";
import { workspaceFixtures } from "../helpers/workspace.ts";

const { fixture } = workspaceFixtures();
const repository = resolve(import.meta.dirname, "../../../..");

it.each([
  "packages/tooling/src/tasks/leaf.ts",
  "packages/runtime-node/scripts/task.ts",
  "packages/tsconfig/scripts/task.ts",
])("%s preserves task arguments, environment and exit status", (leaf) => {
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
  const result = runProcessSync([process.execPath, join(repository, leaf), "test"], {
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
