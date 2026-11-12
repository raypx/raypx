import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, expect, it } from "vite-plus/test";
import { checkEntryConsumers } from "./entries.js";
import { discover } from "../repository.js";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

interface Manifest {
  kind?: "library" | "tooling" | "app";
  exports?: Record<string, string>;
  entryConsumers?: Record<string, string>;
}

/** A throwaway repository: `workspaces` maps a path to its manifest, `files` to file text. */
function check(workspaces: Record<string, Manifest>, files: Record<string, string>) {
  const root = mkdtempSync(join(tmpdir(), "raypx-entries-"));
  roots.push(root);
  const write = (path: string, text: string) => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  };
  write("package.json", JSON.stringify({ private: true, workspaces: ["apps/*", "packages/*"] }));
  for (const [path, manifest] of Object.entries(workspaces))
    write(
      `${path}/package.json`,
      JSON.stringify({
        name: `@raypx/${path.split("/").at(-1)}`,
        private: true,
        exports: manifest.exports,
        // Kind is derived from the manifest: tooling has a bin.
        ...(manifest.kind === "tooling" ? { bin: { tool: "./bin.ts" } } : {}),
        raypx: {
          target: "universal",
          ...(manifest.entryConsumers ? { entryConsumers: manifest.entryConsumers } : {}),
        },
      }),
    );
  for (const [path, text] of Object.entries(files)) write(path, text);
  return checkEntryConsumers(root, discover(root));
}

const none = (workspace: string, entry: string) =>
  `${workspace}: entry "${entry}" has no importer in another workspace; remove it or declare raypx.entryConsumers`;
const testsOnly = (workspace: string, entry: string) =>
  `${workspace}: entry "${entry}" is imported only by tests; remove it or declare raypx.entryConsumers`;
const app: Manifest = { kind: "app" };

it("skips root build output but reads nested source directories with output names", () => {
  const lib = { exports: { "./nested": "./src/a.ts", "./output": "./src/b.ts" } };
  expect(
    check(
      { "packages/lib": lib, "apps/web": app },
      {
        "apps/web/src/build/env.ts": 'export * from "@raypx/lib/nested";',
        "apps/web/build/bundle.js": 'import "@raypx/lib/output";',
      },
    ),
  ).toEqual([none("packages/lib", "./output")]);
});

it("reports an entry nothing imports and ignores a workspace importing itself", () => {
  const lib = { exports: { ".": "./src/a.ts", "./unused": "./src/b.ts" } };
  expect(
    check(
      { "packages/lib": lib, "apps/web": app },
      {
        "apps/web/src/main.ts": 'import "@raypx/lib";',
        "packages/lib/src/a.ts": 'import "@raypx/lib/unused";',
      },
    ),
  ).toEqual([none("packages/lib", "./unused")]);
});

it("counts suites, tests/ helpers and the e2e workspace only as test importers", () => {
  const lib = {
    exports: { "./a": "./a.ts", "./b": "./b.ts", "./c": "./c.ts", "./testing": "./t.ts" },
  };
  expect(
    check(
      { "packages/lib": lib, "apps/web": app, "apps/e2e": app },
      {
        "apps/web/src/feature.component.test.tsx": 'import "@raypx/lib/a";',
        "apps/web/tests/helpers/server.ts": 'import "@raypx/lib/b";',
        "apps/e2e/fixtures/live.ts": 'import "@raypx/lib/c";',
        "apps/web/tests/setup.ts": 'import "@raypx/lib/testing";',
      },
    ),
  ).toEqual([
    testsOnly("packages/lib", "./a"),
    testsOnly("packages/lib", "./b"),
    testsOnly("packages/lib", "./c"),
  ]);
});

it("lets tests alone keep a tooling workspace's entries alive", () => {
  expect(
    check(
      {
        "packages/kit": { kind: "tooling", exports: { "./tasks": "./tasks.ts" } },
        "apps/web": app,
      },
      { "apps/web/src/kit.test.ts": 'import "@raypx/kit/tasks";' },
    ),
  ).toEqual([]);
});

it("finds CSS @import and @source, JSONC tsconfig extends, wildcard entries and root config", () => {
  const theme = {
    exports: {
      "./app.css": "./app.css",
      "./sources": "./src/index.ts",
      "./components/*": "./src/*.tsx",
      "./node.json": "./node.json",
      "./tasks": "./tasks.ts",
      "./unused/*": "./src/unused/*.ts",
    },
  };
  expect(
    check(
      { "packages/theme": theme, "apps/web": app },
      {
        "apps/web/src/styles.css":
          '@import "@raypx/theme/app.css";\n@source "@raypx/theme/sources";',
        "apps/web/src/view.tsx": 'import { Card } from "@raypx/theme/components/card";',
        "apps/web/tsconfig.json": '{\n  // presets\n  "extends": ["@raypx/theme/node.json"],\n}',
        "vite.config.ts": 'import { tasks } from "@raypx/theme/tasks";',
      },
    ),
  ).toEqual([none("packages/theme", "./unused/*")]);
});

it("honours declared exceptions and rejects reasons for entries that are not exported", () => {
  expect(
    check(
      {
        "packages/lib": {
          exports: { "./renderer": "./renderer.ts" },
          entryConsumers: { "./renderer": "injected as a string", "./gone": "stale" },
        },
      },
      {},
    ),
  ).toEqual(['packages/lib: raypx.entryConsumers names unexported entry "./gone"']);
});
