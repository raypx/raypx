import { execFile } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { afterEach, expect, test } from "vite-plus/test";
import { packageConfig, workspaceCacheInputs, workspaceSourceAliases } from "../src/vite.ts";
import { workspacePackages, workspaceRoot } from "../src/workspace.ts";

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "raypx-vite-config-"));
  directories.push(root);
  await writeFile(
    join(root, "package.json"),
    JSON.stringify({ private: true, workspaces: ["packages/*"] }),
  );
  async function workspace(
    name: string,
    dependencies: string[] = [],
    files: Record<string, string> = {},
  ) {
    const directory = join(root, "packages", name);
    await mkdir(directory, { recursive: true });
    await writeFile(
      join(directory, "package.json"),
      JSON.stringify({
        name: `@raypx/${name}`,
        exports: {
          ".": "./dist/index.js",
          "./health": "./dist/health.js",
          "./styles.css": "./dist/styles.css",
        },
        dependencies: Object.fromEntries(
          dependencies.map((dependency) => [`@raypx/${dependency}`, "workspace:*"]),
        ),
        devDependencies: name === "config" ? {} : { "@raypx/config": "workspace:*" },
      }),
    );
    for (const [path, content] of Object.entries(files)) {
      const target = join(directory, path);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, content);
    }
    return pathToFileURL(join(directory, "vite.config.ts")).href;
  }
  await workspace("config");
  return { root, workspace };
}

test("cache inputs follow transitive workspace dependencies and exclude generated outputs", async () => {
  const { root, workspace } = await fixture();
  await workspace("tsconfig", [], { "base.json": '{"compilerOptions":{"strict":true}}' });
  await writeFile(
    join(root, "packages/config/package.json"),
    JSON.stringify({
      name: "@raypx/config",
      devDependencies: { "@raypx/tsconfig": "workspace:*" },
    }),
  );
  await workspace("env");
  await workspace("db", ["env"]);
  await workspace("auth", ["db"]);
  const configUrl = await workspace("api", ["auth"]);
  const patterns = workspaceCacheInputs(configUrl).flatMap((input) =>
    typeof input === "object" && "pattern" in input ? [input.pattern] : [],
  );
  expect(patterns).toEqual(
    expect.arrayContaining([
      "packages/api/src/**",
      "packages/auth/src/**",
      "packages/db/src/**",
      "packages/env/src/**",
      "packages/config/src/**",
      "packages/config/tsconfig/**",
      "packages/tsconfig/*.json",
      "!**/dist/**",
      "!**/.output/**",
      "!**/routeTree.gen.ts",
      "bun.lock",
      "bunfig.toml",
      ".bun-version",
      ".node-version",
    ]),
  );
  expect(patterns).not.toContain("pnpm-lock.yaml");
  expect(patterns).not.toContain("pnpm-workspace.yaml");
});

test("source aliases match only explicit public exports and preserve CSS", async () => {
  const { root, workspace } = await fixture();
  await workspace("ui", [], {
    "src/index.tsx": "export {};",
    "src/health.ts": "export {};",
    "src/styles.css": ":root {}",
  });
  const aliases = workspaceSourceAliases(root);
  expect(aliases).toHaveLength(3);
  const main = aliases.find((alias) => alias.find.test("@raypx/ui"));
  expect(main?.replacement).toBe(join(root, "packages/ui/src/index.tsx"));
  expect(main?.find.test("@raypx/ui/private")).toBe(false);
  const stylesheet = aliases.find((alias) => alias.find.test("@raypx/ui/styles.css"));
  expect(stylesheet?.replacement).toBe(join(root, "packages/ui/src/styles.css"));
  expect(aliases.some((alias) => alias.find.test("@raypx/config"))).toBe(false);
});

test("engineering checks track root tools and doctor source inputs without invalidating runtime builds", async () => {
  const { root, workspace } = await fixture();
  const configUrl = pathToFileURL(join(root, "packages/config/vite.config.ts")).href;
  const apiUrl = await workspace("api");
  const patterns = (url: string) =>
    workspaceCacheInputs(url).flatMap((input) =>
      typeof input === "object" && "pattern" in input ? [input.pattern] : [],
    );
  expect(patterns(configUrl)).toEqual(
    expect.arrayContaining([
      "scripts/**",
      "knip.ts",
      "packages/env/src/**",
      "packages/db/migrations/**",
    ]),
  );
  expect(patterns(apiUrl)).not.toContain("scripts/**");
  expect(patterns(apiUrl)).not.toContain("knip.ts");
});

test("package tasks use compiled outputs while test-free packages cannot collect root tests", async () => {
  const { workspace } = await fixture();
  const url = await workspace("ui");
  const config = packageConfig(url, { name: "ui", react: true, styles: true });
  expect(config.test?.include).toEqual([]);
  expect(config.run?.tasks?.test).toBeUndefined();
  const build = config.run?.tasks?.build;
  expect(build).toMatchObject({
    dependsOn: [{ task: "build", from: "dependencies" }],
    cache: { output: ["dist/**"] },
  });
  expect(build).toMatchObject({
    command: ["tsc", expect.stringMatching(/^bun .+styles\.ts' --copy$/)],
  });
  expect(config.run?.tasks?.dev).toMatchObject({
    command: expect.stringMatching(/^bun .+styles\.ts' --watch$/),
  });
  const tested = packageConfig(url, { name: "ui", test: true, dom: true });
  expect(tested.test).toMatchObject({ name: "ui", environment: "jsdom" });
  expect(tested.run?.tasks?.test).toBeDefined();
  expect(tested.run?.tasks?.dev).toMatchObject({ cache: false });
  expect(tested.run?.tasks?.test).toMatchObject({ command: "vp test run" });
  expect(tested.run?.tasks?.typecheck).toMatchObject({
    command: "tsc --noEmit && tsc -p tsconfig.test.json",
  });
});

test("Node loads the exported TypeScript tool directly without generated JavaScript", async () => {
  const run = promisify(execFile);
  const { stdout } = await run(
    process.execPath,
    [
      "--input-type=module",
      "--eval",
      'const tools = await import("@raypx/config/vite"); console.log(JSON.stringify({ type: typeof tools.packageConfig, bunProtected: tools.serverOnlySpecifierPatterns.some((pattern) => pattern.test("bun:sqlite")) }));',
    ],
    { cwd: fileURLToPath(new URL("../", import.meta.url)), timeout: 5000 },
  );
  expect(JSON.parse(stdout)).toEqual({ type: "function", bunProtected: true });
});

test("finds the workspace from package.json without pnpm files and follows its declared groups", async () => {
  const { root, workspace } = await fixture();
  await workspace("ui");
  const directory = join(root, "packages/ui/src");
  await mkdir(directory, { recursive: true });
  expect(workspaceRoot(directory)).toBe(root);
  await mkdir(join(root, "apps/web"), { recursive: true });
  await writeFile(join(root, "apps/web/package.json"), JSON.stringify({ name: "@raypx/web" }));
  expect([...workspacePackages(root).keys()]).toEqual(["@raypx/config", "@raypx/ui"]);
  await writeFile(
    join(root, "package.json"),
    JSON.stringify({ workspaces: ["apps/*", "packages/*"] }),
  );
  expect([...workspacePackages(root).keys()]).toContain("@raypx/web");
});
