import { copyFileSync, symlinkSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { stripVTControlCharacters } from "node:util";
import { taskModel } from "../../src/tasks/model.js";
import { prepareTaskDirectories } from "../../src/repository.js";
import { workspaceFixtures } from "./workspace.js";

const { fixture, member } = workspaceFixtures();
const repository = resolve(import.meta.dirname, "../../../..");
const configUrl = pathToFileURL(join(repository, "packages/tooling/src/tasks/config.ts")).href;
const vp = join(repository, "node_modules/vite-plus/bin/vp");

export function project(automaticInputs = true) {
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

export function checked(
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

export function execute(
  root: string,
  task: string,
  env: Record<string, string> = {},
  selector?: string,
) {
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

export function pass(result: ReturnType<typeof execute>) {
  if (result.code !== 0) throw new Error(result.log);
  return result;
}
