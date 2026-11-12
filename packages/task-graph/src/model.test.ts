import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vite-plus/test";
import { taskModel } from "./model.js";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function workspace(root: string, name: string, manifest: Record<string, unknown>) {
  mkdirSync(join(root, "packages", name), { recursive: true });
  writeFileSync(
    join(root, "packages", name, "package.json"),
    JSON.stringify({
      name: `@raypx/${name}`,
      private: true,
      raypx: {},
      scripts: { check: "bun check.ts" },
      ...manifest,
    }),
  );
}

it("fingerprints only importable dependencies for a type check", () => {
  const root = mkdtempSync(join(tmpdir(), "raypx-task-model-"));
  roots.push(root);
  writeFileSync(
    join(root, "package.json"),
    JSON.stringify({ name: "fixture", packageManager: "bun@1.4.4", workspaces: ["packages/*"] }),
  );
  workspace(root, "lib", { exports: { ".": "./src/index.ts" } });
  workspace(root, "command", { bin: { command: "./bin/command.mjs" } });
  workspace(root, "app", {
    dependencies: { "@raypx/lib": "workspace:*", "@raypx/command": "workspace:*" },
  });

  const cache = taskModel(root, undefined).definitions.get("@raypx/app#task:check")?.cache;
  const patterns = cache
    ? cache.input.flatMap((input) =>
        typeof input === "object" && "pattern" in input ? [input.pattern] : [],
      )
    : [];
  expect(patterns.filter((pattern) => pattern.startsWith("packages/"))).toEqual([
    "packages/app/**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs,json,jsonc}",
    "packages/lib/**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs,json,jsonc}",
  ]);
});
