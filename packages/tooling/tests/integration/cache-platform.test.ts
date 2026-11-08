import { copyFileSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { expect, it } from "vite-plus/test";
import { checked, execute, pass, project } from "../helpers/cache.js";

const repository = resolve(import.meta.dirname, "../../../..");

it("checks a native app without staging native resources", () => {
  const root = project();
  const folder = checked(
    root,
    "native",
    {},
    {
      "native:build": "bun package.ts",
      "native:prepare": "bun stage.ts",
      typecheck: "bun --check --tsconfig-override tsconfig.json",
      "typecheck:node": "bun --check --tsconfig-override tsconfig.json",
      "perf:check": "bun --check --tsconfig-override tsconfig.json",
    },
  );
  mkdirSync(join(folder, "scripts/host"), { recursive: true });
  copyFileSync(
    join(repository, "apps/desktop/scripts/host/task.ts"),
    join(folder, "scripts/host/task.ts"),
  );
  writeFileSync(
    join(folder, "scripts/host/generate.ts"),
    "// Contract generation checked by desktop tests.\n",
  );
  writeFileSync(
    join(folder, "package.ts"),
    'throw new Error("Native packaging must be explicit");',
  );
  writeFileSync(join(folder, "stage.ts"), 'throw new Error("Sidecar staging must be explicit");');
  const selector = "@raypx/native#task:check";
  pass(execute(root, "check", {}, selector));
  const warm = execute(root, "check", {}, selector);
  expect(warm.code).toBe(0);
  expect(warm.log).toContain("cache hit");
  // Native preparation adds outputs after the first JS check on a fresh checkout.
  for (const [directory, file] of [
    [join(folder, "resources/bin"), "raypx"],
    [join(folder, "generated"), "schema.json"],
    [join(folder, "build/bindings"), "fixture.toml"],
    [join(folder, "artifacts/browser"), "index.html"],
    [join(folder, "artifacts/native-smoke/client/assets"), "chunk.js"],
  ] as const) {
    mkdirSync(directory, { recursive: true });
    writeFileSync(join(directory, file), "fixture");
  }
  expect(pass(execute(root, "check", {}, selector)).log).toContain("cache hit");
  writeFileSync(join(folder, "src/index.ts"), 'export const result: number = "changed";');
  const changed = execute(root, "check", {}, selector);
  expect(changed.code).not.toBe(0);
  expect(changed.log).toContain("not assignable to type 'number'");
}, 30000);

it("ignores Wrangler state and generated configs while tracking authored configuration", () => {
  const root = project();
  const folder = checked(root, "edge");
  const config = join(folder, "wrangler.json");
  writeFileSync(config, '{"name":"edge"}');
  const selector = "@raypx/edge#task:check";
  pass(execute(root, "check", {}, selector));
  expect(pass(execute(root, "check", {}, selector)).log).toContain("cache hit");
  mkdirSync(join(folder, ".wrangler/state"), { recursive: true });
  writeFileSync(join(folder, ".wrangler/state/local.json"), "{}");
  writeFileSync(join(folder, ".wrangler.1234.json"), '{"image_vars":{"VITE_APP_RELEASE":"test"}}');
  expect(pass(execute(root, "check", {}, selector)).log).toContain("cache hit");
  rmSync(join(folder, ".wrangler.1234.json"));
  expect(pass(execute(root, "check", {}, selector)).log).toContain("cache hit");
  writeFileSync(config, '{"name":"changed"}');
  expect(pass(execute(root, "check", {}, selector)).log).toContain("cache miss");
}, 30000);
