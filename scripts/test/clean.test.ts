import { spawnSync } from "node:child_process";
import { cp, lstat, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, expect, test } from "vite-plus/test";
import { cleanRepository } from "../lib/clean.ts";

const repository = fileURLToPath(new URL("../../", import.meta.url));
const directories: string[] = [];

async function temporaryDirectory() {
  const root = await mkdtemp(join(tmpdir(), "raypx-clean-"));
  directories.push(root);
  return root;
}

async function put(root: string, path: string, content = "sentinel") {
  const file = join(root, path);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, content);
}

async function fixture() {
  const root = await temporaryDirectory();
  await put(root, "package.json", '{"name":"raypx","version":"0.1.0","type":"module"}');
  await put(root, "apps/web/package.json", '{"name":"@raypx/web"}');
  await put(root, "packages/ui/package.json", '{"name":"@raypx/ui"}');
  return root;
}

afterEach(async () => {
  for (const directory of directories.splice(0))
    await rm(directory, { recursive: true, force: true });
});

test("removes generated artifacts while preserving dependencies, configuration and local data", async () => {
  const root = await fixture();
  const generated = [
    "coverage/coverage-summary.json",
    ".ci-reports/quality.log",
    "test-results/app/results.json",
    "playwright-report/index.html",
    "apps/web/.output/server/index.mjs",
    "apps/web/.tanstack/cache/file",
    "apps/web/src/routeTree.gen.ts",
    "apps/web/node_modules/.nitro/cache",
    "packages/ui/dist/index.js",
    "packages/ui/storybook-static/index.html",
    "packages/ui/tsconfig.tsbuildinfo",
    "packages/ui/node_modules/.vite/vitest/results.json",
    "packages/ui/node_modules/.vite-temp/config.mjs",
    "node_modules/.vite/task-cache/entry",
    "node_modules/.cache/storybook/cache",
    "node_modules/.cache/sb-vite-plugin-externals/cache",
    "node_modules/.cache/jiti/cache",
    "scripts/coverage/coverage-summary.json",
    "scripts/.vitest/results.json",
  ];
  const preserved = [
    ".env",
    "apps/web/.env",
    "apps/web/.env.example",
    "apps/web/data/local.sqlite",
    "apps/web/data/local.sqlite-wal",
    "data/cache/item.json",
    "packages/db/migrations/0000_initial.sql",
    ".vite-hooks/_/pre-commit",
    "node_modules/citty/package.json",
    "node_modules/.bun/package/index.js",
    "node_modules/.cache/custom/item",
    "packages/ui/src/dist/source.ts",
    "apps/unregistered/dist/index.js",
    "bun.lock",
  ];
  for (const path of [...generated, ...preserved]) await put(root, path);
  const preview = await cleanRepository(root, true);
  expect(preview).toContain("apps/web/src/routeTree.gen.ts");
  for (const path of [...generated, ...preserved])
    expect(await readFile(join(root, path), "utf8")).toBe("sentinel");
  expect(await cleanRepository(root)).toEqual(preview);
  for (const path of generated)
    await expect(lstat(join(root, path))).rejects.toMatchObject({ code: "ENOENT" });
  for (const path of preserved) expect(await readFile(join(root, path), "utf8")).toBe("sentinel");
  expect(await cleanRepository(root)).toEqual([]);
});

test.skipIf(process.platform === "win32")(
  "never follows linked workspaces, cache parents or artifact contents",
  async () => {
    const root = await fixture();
    const outside = await fixture();
    for (const path of [
      "dist/index.js",
      ".vite/cache",
      "storybook/cache",
      "routeTree.gen.ts",
      "index.js",
    ])
      await put(outside, path);
    await symlink(outside, join(root, "packages/linked"));
    await symlink(outside, join(root, "apps/web/node_modules"));
    await symlink(outside, join(root, "apps/web/src"));
    await mkdir(join(root, "node_modules"));
    await symlink(outside, join(root, "node_modules/.cache"));
    await symlink(outside, join(root, "packages/ui/dist"));
    await put(root, "coverage/summary.json");
    await symlink(outside, join(root, "coverage/external"));
    expect(await cleanRepository(root)).toEqual(["coverage", "packages/ui/dist"]);
    for (const path of [
      "dist/index.js",
      ".vite/cache",
      "storybook/cache",
      "routeTree.gen.ts",
      "index.js",
    ])
      expect(await readFile(join(outside, path), "utf8")).toBe("sentinel");
    expect((await lstat(join(root, "apps/web/node_modules"))).isSymbolicLink()).toBe(true);
    // A symlink at the whole workspace group is also outside the cleanup boundary.
    await rm(join(root, "apps"), { recursive: true });
    await symlink(outside, join(root, "apps"));
    expect(await cleanRepository(root)).toEqual([]);
  },
);

test.skipIf(process.platform === "win32")(
  "CLI rejects invalid input and cleans its own checkout from another cwd",
  async () => {
    const root = await fixture();
    const cwd = await temporaryDirectory();
    await cp(join(repository, "scripts"), join(root, "scripts"), { recursive: true });
    await symlink(join(repository, "node_modules"), join(root, "node_modules"));
    await put(root, "packages/ui/dist/index.js");
    await put(cwd, "dist/index.js");
    function invoke(args: string[]) {
      const result = spawnSync(
        "bun",
        ["--no-env-file", "--no-install", join(root, "scripts/bin/raypx.ts"), "clean", ...args],
        {
          cwd,
          encoding: "utf8",
          timeout: 5000,
          env: { PATH: process.env.PATH, NODE_ENV: "test", CI: "true" },
        },
      );
      expect(result.error).toBeUndefined();
      return result;
    }
    for (const args of [["--unknown"], ["../../"], ["--help", "--unknown"], ["--dry-run=false"]])
      expect(invoke(args).status).toBe(1);
    for (const args of [["--help"], ["-h"], ["--dry-run"]]) expect(invoke(args).status).toBe(0);
    expect(await readFile(join(root, "packages/ui/dist/index.js"), "utf8")).toBe("sentinel");
    const result = invoke([]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Removed packages/ui/dist");
    await expect(lstat(join(root, "packages/ui/dist"))).rejects.toMatchObject({ code: "ENOENT" });
    expect(await readFile(join(cwd, "dist/index.js"), "utf8")).toBe("sentinel");
    expect(invoke([]).stdout).toContain("No generated artifacts to clean");
  },
);
