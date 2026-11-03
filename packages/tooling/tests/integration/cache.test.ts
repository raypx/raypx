import {
  copyFileSync,
  symlinkSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { stripVTControlCharacters } from "node:util";
import { expect, it } from "vite-plus/test";
import { argumentKey } from "../../src/tasks/arguments.js";
import { taskModel } from "../../src/tasks/model.js";
import { prepareTaskDirectories } from "../../src/repository.js";
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
  mkdirSync(join(root, "node_modules/@raypx-kit"), { recursive: true });
  symlinkSync(
    join(repository, "packages/tooling/node_modules/@raypx-kit/devkit"),
    join(root, "node_modules/@raypx-kit/devkit"),
    "dir",
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
  prepareTaskDirectories(taskModel(root));
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

function validationProject() {
  const root = project();
  const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  manifest.devEngines = {
    packageManager: { name: "bun", version: "1.4.4", onFail: "error" },
    runtime: { name: "bun", version: "1.4.4", onFail: "error" },
  };
  writeFileSync(join(root, "package.json"), JSON.stringify(manifest));
  writeFileSync(
    join(root, "mise.toml"),
    '[settings]\nidiomatic_version_file_enable_tools = ["bun"]\n',
  );
  writeFileSync(
    join(root, "vite.config.ts"),
    `import { repositoryTaskConfig } from ${JSON.stringify(configUrl)}; export default repositoryTaskConfig(import.meta.url);`,
  );
  const tooling = join(root, "packages/tooling");
  const toolingManifest = JSON.parse(readFileSync(join(tooling, "package.json"), "utf8"));
  toolingManifest.dependencies = { "@raypx-kit/devkit": "1.0.0", "@raypx-kit/intl": "1.0.0" };
  writeFileSync(join(tooling, "package.json"), JSON.stringify(toolingManifest));
  symlinkSync(
    join(repository, "packages/tooling/node_modules/@raypx-kit/intl"),
    join(root, "node_modules/@raypx-kit/intl"),
    "dir",
  );
  for (const file of [
    "policy.ts",
    "validation/toolchain.ts",
    "validation/source-layers.ts",
    "validation/entries.ts",
    "validation/deployment.ts",
    "build/deployment.ts",
    "verification/prechecks.ts",
  ]) {
    mkdirSync(join(tooling, "src", file, ".."), { recursive: true });
    copyFileSync(join(repository, "packages/tooling/src", file), join(tooling, "src", file));
  }
  writeFileSync(
    join(tooling, "src/repository.ts"),
    'import { discover as read } from "@raypx-kit/devkit/workspaces"; export const discover = (root: string) => read(root, { metadataKey: "raypx" });',
  );
  writeFileSync(
    join(tooling, "src/cli.ts"),
    'import { runPrecheck } from "./verification/prechecks.ts"; runPrecheck(process.cwd(), process.argv[3] ?? "");',
  );
  // Fixture workspaces model a repository snapshot, not a product graph: their
  // entries exist so policy has something to inspect, not for an importer.
  const scaffold = (entries: Record<string, string>) => ({
    kind: "library",
    target: "universal",
    entryConsumers: entries,
  });
  const i18n = member(root, "i18n", {
    extra: {
      exports: { "./config": "./src/config.ts" },
      raypx: scaffold({ "./config": "read by the fixture precheck" }),
    },
  });
  writeFileSync(
    join(root, i18n, "src/config.ts"),
    'export default { locales: { en: "English", zh: "中文" }, defaultLocale: "en" };',
  );
  const feature = member(root, "feature", {
    extra: { raypx: scaffold({ ".": "fixture workspace" }) },
  });
  mkdirSync(join(root, feature, "src/messages"));
  for (const locale of ["en", "zh"])
    writeFileSync(
      join(root, feature, `src/messages/${locale}.ts`),
      'export default { label: "Label" };',
    );
  for (const path of ["packages/tooling", i18n, feature])
    writeFileSync(join(root, path, "AGENTS.md"), "Fixture instructions.\n");
  return root;
}

it("caches policy while rejecting new violations and deleted required inputs", () => {
  const root = validationProject();
  const run = () => execute(root, "policy", {}, "cache-fixture#task:policy");
  pass(run());
  const timing = join(root, ".artifacts/verification/prechecks/policy.json");
  const evidence = readFileSync(timing, "utf8");
  expect(JSON.parse(evidence).durationMs).toBeGreaterThanOrEqual(0);
  rmSync(timing);
  expect(pass(run()).log).toContain("cache hit");
  expect(readFileSync(timing, "utf8")).toBe(evidence);
  writeFileSync(join(root, "packages/feature/src/new.ts"), "export const value = 1;");
  expect(pass(run()).log).toContain("cache miss");
  expect(pass(run()).log).toContain("cache hit");
  writeFileSync(join(root, "packages/feature/src/new.ts"), 'import "undeclared-library";');
  for (let attempt = 0; attempt < 2; attempt++) {
    const invalid = run();
    expect(invalid.code).not.toBe(0);
    expect(invalid.log).toContain("undeclared runtime dependency");
  }
  writeFileSync(join(root, "packages/feature/src/new.ts"), "export const value = 2;");
  pass(run());
  rmSync(join(root, "packages/feature/AGENTS.md"));
  const deleted = run();
  expect(deleted.code).not.toBe(0);
  expect(deleted.log).toContain("missing AGENTS.md");
  writeFileSync(join(root, "packages/feature/AGENTS.md"), "Fixture instructions.\n");
  pass(run());
  writeFileSync(join(root, ".nvmrc"), "24\n");
  const pin = run();
  expect(pin.code).not.toBe(0);
  expect(pin.log).toContain("only runtime pin");
}, 60000);

it("caches locale parity while tracking changed, new and deleted catalogs and language policy", () => {
  const root = validationProject();
  const run = () => execute(root, "locales", {}, "cache-fixture#task:locales");
  pass(run());
  expect(pass(run()).log).toContain("cache hit");
  const english = join(root, "packages/feature/src/messages/en.ts");
  writeFileSync(english, 'export default { label: "Label", added: "Added" };');
  expect(run().code).not.toBe(0);
  writeFileSync(
    join(root, "packages/feature/src/messages/zh.ts"),
    'export default { label: "标签", added: "新增" };',
  );
  pass(run());
  expect(pass(run()).log).toContain("cache hit");
  rmSync(english);
  expect(run().code).not.toBe(0);
  writeFileSync(english, 'export default { label: "Label", added: "Added" };');
  pass(run());
  const folder = join(root, "packages/i18n/src/messages");
  mkdirSync(folder);
  writeFileSync(join(folder, "en.json"), '{"label":"Label"}');
  const added = run();
  expect(added.code).not.toBe(0);
  expect(added.log).toContain("missing zh catalog");
  rmSync(folder, { recursive: true });
  pass(run());
  writeFileSync(
    join(root, "packages/i18n/src/config.ts"),
    'export default { locales: { en: "English", zh: "中文", fr: "Français" }, defaultLocale: "en" };',
  );
  const config = run();
  expect(config.code).not.toBe(0);
  expect(config.log).toContain("missing fr catalog");
}, 60000);

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
  "ignores dependency coverage and reports while tracking authored inputs (automatic inputs: %s)",
  (automaticInputs) => {
    const root = project(automaticInputs);
    const tokens = checked(root, "tokens");
    checked(root, "consumer", { "@raypx/tokens": "workspace:*" });
    const selector = "@raypx/consumer#task:check";
    pass(execute(root, "check", {}, selector));
    expect(pass(execute(root, "check", {}, selector)).log).toContain("cache hit");
    for (const directory of ["coverage", ".artifacts", "test-results", "playwright-report"]) {
      mkdirSync(join(tokens, directory), { recursive: true });
      const report = join(tokens, directory, "result.json");
      writeFileSync(report, "{}");
      expect(pass(execute(root, "check", {}, selector)).log).toContain("cache hit");
      writeFileSync(report, '{"changed":true}');
      expect(pass(execute(root, "check", {}, selector)).log).toContain("cache hit");
      rmSync(join(tokens, directory), { recursive: true });
      expect(pass(execute(root, "check", {}, selector)).log).toContain("cache hit");
    }
    // A source folder named coverage is authored input, not a workspace report directory.
    mkdirSync(join(tokens, "src/coverage"));
    writeFileSync(join(tokens, "src/coverage/value.ts"), "export const value = 1;");
    expect(pass(execute(root, "check", {}, selector)).log).toContain("cache miss");
    const config = join(tokens, "tsconfig.json");
    writeFileSync(config, readFileSync(config, "utf8") + "\n");
    expect(pass(execute(root, "check", {}, selector)).log).toContain("cache miss");
  },
  60000,
);

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
    },
  );
  mkdirSync(join(folder, "scripts/native"), { recursive: true });
  copyFileSync(
    join(repository, "apps/desktop/scripts/native/task.ts"),
    join(folder, "scripts/native/task.ts"),
  );
  writeFileSync(
    join(folder, "scripts/native/generate.ts"),
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

it("reuses VP pack results after validation writes ignored artifacts", () => {
  const root = project();
  const folder = checked(
    root,
    "cli-fixture",
    {},
    { build: `bun --bun ${JSON.stringify(vp)} pack` },
  );
  const config = join(folder, "vite.config.ts");
  writeFileSync(
    config,
    readFileSync(config, "utf8").replace(
      "export default config;",
      'export default {...config, envPrefix: [], pack: {entry: ["src/index.ts"], dts: false}};',
    ),
  );
  const selector = "@raypx/cli-fixture#task:build";
  pass(execute(root, "build", {}, selector));
  expect(pass(execute(root, "build", {}, selector)).log).toContain("2 cache hits");
  mkdirSync(join(root, ".artifacts/validation"), { recursive: true });
  writeFileSync(join(root, ".artifacts/validation/result.json"), "fixture");
  expect(pass(execute(root, "build", {}, selector)).log).toContain("2 cache hits");
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
