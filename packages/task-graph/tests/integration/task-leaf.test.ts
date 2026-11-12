import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { afterEach, it, expect } from "vite-plus/test";
import { spawnSync } from "node:child_process";
import { argumentKey } from "../../src/core.js";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "raypx-task-graph-test-"));
  roots.push(root);
  return root;
}
const repository = resolve(import.meta.dirname, "../../../..");
// VP's Windows worker can use Bun's node.exe mode, which treats `run` as a file.
const runtime = Bun.which("bun");
if (!runtime) throw new Error("Task leaf acceptance requires the pinned Bun CLI on PATH");

it.each([["packages/task-graph/src/leaf.ts", ["_test"]]] as const)(
  "%s preserves task arguments, environment and exit status",
  (leaf, runner) => {
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
    const result = spawnSync(runtime, [join(repository, leaf), "test", ...runner], {
      cwd: root,
      env: {
        ...process.env,
        [argumentKey("task-fixture#test")]: JSON.stringify(args),
        RAYPX_LEAF_TEST: "inherited environment",
      },
    });
    expect(result.status).toBe(23);
    expect(JSON.parse(readFileSync(join(root, "result.json"), "utf8"))).toEqual({
      args,
      value: "inherited environment",
    });
  },
);
