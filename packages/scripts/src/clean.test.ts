import { existsSync } from "node:fs";
import { temporaryRepository } from "./test-fixtures.js";
import { join } from "node:path";

import { describe, expect, it } from "vite-plus/test";

import { cleanRepository } from "./clean.js";

describe("cleanRepository", () => {
  it("removes rebuildable artifacts and preserves source and dependencies", async () => {
    // Each case names the artifact root and the nested file that proves recursive removal.
    const artifacts = [
      [".cache", "tool/state.json"],
      [".vite", "deps/metadata.json"],
      [".vite-plus", "cache/state.json"],
      ["build.tsbuildinfo", ""],
      ["package.tgz", ""],
      ["report.1.2.3.4.json", ""],
      ["node_modules/.cache", "tool/state.json"],
      ["apps/storybook/storybook-static", "index.html"],
      ["apps/web/.nitro", "cache/state.json"],
      ["apps/web/dist", "index.html"],
      ["apps/web/.output", "server/index.mjs"],
      ["apps/web/.storage", "state.json"],
      ["apps/web/.vite", "deps/metadata.json"],
      ["apps/web/app.lcov", ""],
      ["apps/web/app.tsbuildinfo", ""],
      ["apps/web/node_modules/.cache", "tool/state.json"],
      ["apps/web/node_modules/.vite", "metadata.json"],
      ["packages/core/coverage", "coverage.json"],
      ["e2e/test-results", "results.json"],
      ["apps/desktop/src-tauri/target", "debug/voidmix"],
      ["apps/desktop/src-tauri/gen/schemas", "schema.json"],
    ] as const;
    const removedPaths = artifacts.map(([root, file]) => join(root, file));
    const preservedPaths = [
      "node_modules/example/package.json",
      "development.log",
      "apps/web/src/routeTree.gen.ts",
      "apps/web/node_modules/example/package.json",
      "packages/db/drizzle/20260815142252_unusual_leech/migration.sql",
      "packages/shared/dist/index.js",
    ];

    const repositoryRoot = await temporaryRepository(
      Object.fromEntries([...removedPaths, ...preservedPaths].map((path) => [path, "fixture"])),
    );

    const removed = await cleanRepository(repositoryRoot);

    for (const path of removedPaths) {
      expect(existsSync(join(repositoryRoot, path))).toBe(false);
    }
    expect(existsSync(join(repositoryRoot, "apps/desktop/src-tauri/gen"))).toBe(false);
    for (const path of preservedPaths) {
      expect(existsSync(join(repositoryRoot, path))).toBe(true);
    }
    expect([...removed].sort()).toEqual(
      [...artifacts.map(([root]) => root), "apps/desktop/src-tauri/gen"].sort(),
    );
  });

  it("removes repository dependencies only when requested", async () => {
    const dependencyPaths = [
      "node_modules/root-package/package.json",
      "node_modules.bun/root-package/package.json",
      "apps/web/node_modules/web-package/package.json",
      "apps/web/node_modules.bun/web-package/package.json",
      "packages/core/node_modules/domain-package/package.json",
    ];
    const sourcePath = "apps/web/src/index.ts";

    const repositoryRoot = await temporaryRepository(
      Object.fromEntries([...dependencyPaths, sourcePath].map((path) => [path, "fixture"])),
    );

    const removed = await cleanRepository(repositoryRoot, { dependencies: true });

    for (const path of dependencyPaths) {
      expect(existsSync(join(repositoryRoot, path))).toBe(false);
    }
    expect(existsSync(join(repositoryRoot, sourcePath))).toBe(true);
    expect([...removed].sort()).toEqual(
      [
        "apps/web/node_modules",
        "apps/web/node_modules.bun",
        "packages/core/node_modules",
        "node_modules",
        "node_modules.bun",
      ].sort(),
    );
  });
});
