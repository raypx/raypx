import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { stripVTControlCharacters } from "node:util";
import { expect, it } from "vite-plus/test";
import { argumentKey } from "../../src/tasks/arguments.js";
import { workspaceFixtures } from "../helpers/workspace.js";

const { fixture, member } = workspaceFixtures();
const repository = resolve(import.meta.dirname, "../../../..");
const configUrl = pathToFileURL(join(repository, "packages/tooling/src/tasks/config.ts")).href;
const vp = join(repository, "node_modules/vite-plus/bin/vp");

function project(automaticInputs = true) {
  const root = fixture();
  writeFileSync(
    join(root, "package.json"),
    JSON.stringify({
      name: "cache-fixture",
      private: true,
      type: "module",
      packageManager: "bun@1.4.4",
      workspaces: ["packages/*"],
    }),
  );
  writeFileSync(join(root, "bun.lock"), "{}\n");
  writeFileSync(join(root, "bunfig.toml"), "\n");
  writeFileSync(join(root, "automatic-inputs.json"), JSON.stringify(automaticInputs));
  mkdirSync(join(root, "node_modules/.vite/task-cache"), { recursive: true });
  mkdirSync(join(root, "node_modules/.vite-temp"), { recursive: true });
  mkdirSync(join(root, "packages/tooling/src/tasks"), { recursive: true });
  writeFileSync(
    join(root, "packages/tooling/package.json"),
    JSON.stringify({
      name: "@raypx/tooling",
      private: true,
      type: "module",
      raypx: { kind: "tooling", target: "bun" },
    }),
  );
  for (const name of ["leaf", "arguments", "delegation"])
    copyFileSync(
      join(repository, `packages/tooling/src/tasks/${name}.ts`),
      join(root, `packages/tooling/src/tasks/${name}.ts`),
    );
  return root;
}

function checked(
  root: string,
  name: string,
  dependencies: Record<string, string> = {},
  scripts: Record<string, string> = {},
) {
  const folder = member(root, name, {
    deps: dependencies,
    extra: {
      scripts: {
        check: "bun --check --tsconfig-override tsconfig.json",
        ...scripts,
      },
    },
  });
  // Model an installed workspace; config-cache creation must not change a
  // previously missing module-resolution directory between the cache samples.
  mkdirSync(join(root, folder, "node_modules/.vite-temp"), { recursive: true });
  mkdirSync(join(root, folder, "node_modules/.vite"), { recursive: true });
  writeFileSync(
    join(root, folder, "vite.config.ts"),
    `import { readFileSync } from "node:fs";
import { workspaceTaskConfig } from ${JSON.stringify(configUrl)};
const config = workspaceTaskConfig(import.meta.url);
if (!JSON.parse(readFileSync(new URL("../../automatic-inputs.json", import.meta.url), "utf8"))) {
  for (const task of Object.values(config.run.tasks)) {
    if (task.cache) task.cache.input = task.cache.input.filter(input => typeof input !== "object" || !("auto" in input));
  }
}
export default config;`,
  );
  writeFileSync(
    join(root, folder, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: {
        strict: true,
        noEmit: true,
        target: "ESNext",
        module: "ESNext",
        moduleResolution: "Bundler",
        lib: ["ES2022"],
        types: [],
        paths: { "@raypx/tokens": ["../tokens/src/index.ts"] },
      },
      include: ["src"],
    }),
  );
  return join(root, folder);
}

function execute(root: string, task: string, env: Record<string, string> = {}, selector?: string) {
  const child = Bun.spawnSync(
    [
      process.execPath,
      "--bun",
      vp,
      "run",
      "--verbose",
      "--concurrency-limit",
      "2",
      ...(selector ? [] : ["--filter", "@raypx/*", "--parallel"]),
      selector ?? `task:${task}`,
    ],
    {
      cwd: root,
      env: { ...process.env, ...env },
      stdout: "pipe",
      stderr: "pipe",
    },
  );
  return {
    code: child.exitCode,
    log: stripVTControlCharacters(
      new TextDecoder().decode(child.stdout) + new TextDecoder().decode(child.stderr),
    ),
  };
}

function pass(result: ReturnType<typeof execute>) {
  if (result.code !== 0) throw new Error(result.log);
  return result;
}

it("runs a delegated package runner once with literal arguments scoped to the public task", () => {
  const root = project();
  const directory = checked(
    root,
    "feature",
    {},
    { test: "bun missing-public-entry.ts", _test: "bun runner.ts" },
  );
  const manifest = JSON.parse(readFileSync(join(directory, "package.json"), "utf8"));
  manifest.raypx.taskScripts = { test: "_test" };
  writeFileSync(join(directory, "package.json"), JSON.stringify(manifest));
  writeFileSync(
    join(directory, "runner.ts"),
    'import {appendFileSync} from "node:fs"; appendFileSync("calls.jsonl", JSON.stringify(process.argv.slice(2))+"\\n");',
  );
  const argv = ["two words", "literal-$VALUE", "--reporter=json"];
  pass(
    execute(
      root,
      "test",
      { [argumentKey("@raypx/feature#test")]: JSON.stringify(argv) },
      "@raypx/feature#task:test",
    ),
  );
  const calls = readFileSync(join(directory, "calls.jsonl"), "utf8").trim().split("\n");
  expect(calls.map((line) => JSON.parse(line))).toEqual([argv]);
}, 30000);

it.each([true, false])(
  "invalidates typecheck consumers and retains unrelated hits (automatic inputs: %s)",
  (automaticInputs) => {
    const root = project(automaticInputs);
    const tokens = checked(root, "tokens");
    const bridge = checked(root, "bridge", { "@raypx/tokens": "workspace:*" });
    const consumer = checked(root, "consumer", { "@raypx/bridge": "workspace:*" });
    checked(root, "independent");
    writeFileSync(join(tokens, "src/index.ts"), "export const value: number = 1;\n");
    writeFileSync(join(bridge, "src/index.ts"), 'export { value } from "@raypx/tokens";\n');
    writeFileSync(
      join(consumer, "src/index.ts"),
      'import { value } from "../../bridge/src/index"; export const result: number = value;\n',
    );
    pass(execute(root, "check"));
    const warm = execute(root, "check");
    expect(warm.code).toBe(0);
    expect(warm.log).toContain("4 cache hits");
    writeFileSync(join(tokens, "src/index.ts"), "export const value: number = 2;\n");
    const changed = execute(root, "check");
    expect(changed.code).toBe(0);
    expect(changed.log).toContain("1 cache hit");
    expect(changed.log).toContain("3 cache misses");
    writeFileSync(join(tokens, "src/index.ts"), 'export const value: string = "changed";\n');
    const invalid = execute(root, "check");
    expect(invalid.code).not.toBe(0);
    expect(invalid.log).toContain("not assignable to type 'number'");
  },
  30000,
);

it("restores cached build outputs and scopes literal argv and public build environment", () => {
  const root = project();
  const folder = checked(root, "feature", {}, { build: "bun build.ts" });
  writeFileSync(
    join(folder, "build.ts"),
    'import { mkdirSync, writeFileSync } from "node:fs"; mkdirSync("dist",{recursive:true}); writeFileSync("dist/value.json",JSON.stringify([process.env.VITE_EXAMPLE,...process.argv.slice(2)]));',
  );
  const selector = "@raypx/feature#task:build";
  const first = execute(root, "build", { VITE_EXAMPLE: "one" }, selector);
  pass(first);
  const file = join(folder, "dist/value.json");
  expect(JSON.parse(readFileSync(file, "utf8"))).toEqual(["one"]);
  rmSync(join(folder, "dist"), { recursive: true });
  const warm = execute(root, "build", { VITE_EXAMPLE: "one" }, selector);
  expect(warm.code).toBe(0);
  expect(warm.log).toContain("2 cache hits");
  expect(existsSync(file)).toBe(true);
  const literal = "a path with spaces $(never-run) `literal`";
  const changed = execute(
    root,
    "build",
    {
      VITE_EXAMPLE: "two",
      [argumentKey("@raypx/feature#build")]: JSON.stringify([literal]),
    },
    selector,
  );
  expect(changed.code).toBe(0);
  expect(changed.log).toContain("1 cache hit");
  expect(JSON.parse(readFileSync(file, "utf8"))).toEqual(["two", literal]);
}, 30000);

it.each([true, false])(
  "tracks dependency declarations while excluding owned outputs (automatic inputs: %s)",
  (automaticInputs) => {
    const root = project(automaticInputs);
    const tokens = checked(root, "tokens");
    const consumer = checked(root, "consumer", { "@raypx/tokens": "workspace:*" });
    mkdirSync(join(tokens, "dist"));
    writeFileSync(join(tokens, "dist/value.d.ts"), "export declare const value: number;");
    writeFileSync(
      join(consumer, "src/index.ts"),
      'import { value } from "../../tokens/dist/value"; export const result: number = value;',
    );
    const selector = "@raypx/consumer#task:check";
    pass(execute(root, "check", {}, selector));
    expect(execute(root, "check", {}, selector).log).toContain("cache hit");
    mkdirSync(join(consumer, "dist"));
    writeFileSync(join(consumer, "dist/owned.d.ts"), "export declare const owned: string;");
    expect(pass(execute(root, "check", {}, selector)).log).toContain("cache hit");
    writeFileSync(join(tokens, "dist/value.d.ts"), "export declare const value: string;");
    const changed = execute(root, "check", {}, selector);
    expect(changed.code).not.toBe(0);
    expect(changed.log).toContain("not assignable to type 'number'");
  },
  30000,
);

it("prepares ignored SDK inputs before deciding whether a native check is reusable", () => {
  const root = project();
  const folder = checked(
    root,
    "native",
    {},
    {
      "native:prepare": "bun prepare.ts",
      typecheck: "bun --check --tsconfig-override tsconfig.json",
      "typecheck:node": "bun --check --tsconfig-override tsconfig.json",
      "typecheck:native": "bun --check --tsconfig-override tsconfig.json",
    },
  );
  mkdirSync(join(folder, "scripts/native"), { recursive: true });
  copyFileSync(
    join(repository, "apps/desktop/scripts/native/task.ts"),
    join(folder, "scripts/native/task.ts"),
  );
  writeFileSync(join(root, ".gitignore"), ".hutch/\nnode_modules/\n");
  writeFileSync(join(folder, "seed.txt"), "number");
  writeFileSync(
    join(folder, "prepare.ts"),
    'import { mkdirSync, readFileSync, writeFileSync } from "node:fs"; mkdirSync(".hutch/types",{recursive:true}); writeFileSync(".hutch/types/runtime.d.ts",`export declare const value: ${readFileSync("seed.txt","utf8")};`); console.log("prepared-sdk");',
  );
  writeFileSync(
    join(folder, "src/index.ts"),
    'import { value } from "../.hutch/types/runtime"; export const result: number = value;',
  );
  const selector = "@raypx/native#task:check";
  pass(execute(root, "check", {}, selector));
  const warm = execute(root, "check", {}, selector);
  expect(warm.code).toBe(0);
  expect(warm.log).toContain("prepared-sdk");
  writeFileSync(join(folder, "seed.txt"), "string");
  const changed = execute(root, "check", {}, selector);
  expect(changed.code).not.toBe(0);
  expect(changed.log).toContain("not assignable to type 'number'");
}, 30000);
