import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, expect, test } from "vite-plus/test";
import { checkBoundaries } from "../src/check-boundaries.ts";
import { checkBoundaries as checkSimpleBoundaries } from "../src/check-boundaries-simple.ts";

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "raypx-boundaries-"));
  directories.push(root);
  await writeFile(
    join(root, "package.json"),
    JSON.stringify({ private: true, workspaces: ["apps/*", "packages/*"] }),
  );
  async function workspace(
    name: string,
    dependencies: string[] = [],
    files: Record<string, string> = {},
  ) {
    const directory = join(root, name === "web" ? "apps" : "packages", name);
    await mkdir(directory, { recursive: true });
    await writeFile(
      join(directory, "package.json"),
      JSON.stringify({
        name: `@raypx/${name}`,
        exports: {
          ".": "./dist/index.js",
          "./health": "./dist/health.js",
          "./react": "./dist/react/index.js",
          "./hooks": "./dist/hooks/index.js",
          "./server": "./dist/server.js",
          "./styles.css": "./dist/styles.css",
        },
        dependencies: Object.fromEntries(
          dependencies.map((dependency) => [`@raypx/${dependency}`, "workspace:*"]),
        ),
        devDependencies:
          name === "config" || name === "tsconfig" ? {} : { "@raypx/config": "workspace:*" },
      }),
    );
    for (const [path, content] of Object.entries(files)) {
      const target = join(directory, path);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, content);
    }
  }
  await workspace("config");
  return { root, workspace };
}

test("accepts declared public imports and app server adapters", async () => {
  const { root, workspace } = await fixture();
  await workspace("contracts");
  await workspace("api", ["contracts"], {
    "src/index.ts": 'export type { Health } from "@raypx/contracts/health";',
  });
  await workspace("client", ["contracts"], {
    "src/index.ts": 'import { schema } from "@raypx/contracts/health";',
  });
  await workspace("ui");
  await workspace("web", ["api", "client", "ui"], {
    "src/routes/api.health.ts": 'import { health } from "@raypx/api/health";',
    "src/health.server.ts": 'export { health } from "@raypx/api/health";',
    "src/App.tsx": 'import { health } from "@raypx/client/health";',
    "src/routes/__root.tsx": 'import stylesheet from "@raypx/ui/styles.css?url";',
    "vite.config.ts": 'import { packageConfig } from "@raypx/config/vite";',
  });
  // The config fixture exposes only generic entries until this public tool is added.
  await writeFile(
    join(root, "packages/config/package.json"),
    JSON.stringify({
      name: "@raypx/config",
      exports: { "./vite": "./src/vite.ts" },
    }),
  );
  expect(checkBoundaries(root)).toEqual([]);
});

test("rejects undeclared dependencies and private package imports", async () => {
  const { root, workspace } = await fixture();
  await workspace("contracts");
  await workspace("client", [], {
    "src/index.ts":
      'import { schema } from "@raypx/contracts/src/index";\nexport { schema } from "@raypx/contracts/not-exported";',
  });
  const messages = checkBoundaries(root).map((violation) => violation.message);
  expect(messages).toEqual(
    expect.arrayContaining([
      expect.stringContaining("undeclared workspace dependency"),
      expect.stringContaining("Internal package path"),
      expect.stringContaining("not a public package export"),
    ]),
  );
});

test("keeps engineering configuration out of runtime packages and app source", async () => {
  const { root, workspace } = await fixture();
  await writeFile(
    join(root, "packages/config/package.json"),
    JSON.stringify({ name: "@raypx/config", exports: { "./vite": "./src/vite.ts" } }),
  );
  await workspace("ui", [], {
    "src/index.tsx": 'import { packageConfig } from "@raypx/config/vite";',
    "vite.config.ts": 'import { packageConfig } from "@raypx/config/vite";',
  });
  await workspace("web", [], {
    "src/config.server.ts": 'import { packageConfig } from "@raypx/config/vite";',
  });
  const violations = checkBoundaries(root);
  expect(violations).toHaveLength(2);
  expect(violations.every((violation) => violation.message.includes("runtime source"))).toBe(true);
});

test("allows static TypeScript configuration for development and rejects runtime use", async () => {
  const { root, workspace } = await fixture();
  await workspace("tsconfig");
  await writeFile(
    join(root, "packages/tsconfig/package.json"),
    JSON.stringify({
      name: "@raypx/tsconfig",
      exports: { "./base.json": "./base.json" },
    }),
  );
  await workspace("ui", [], {
    "vite.config.ts": 'import settings from "@raypx/tsconfig/base.json";',
  });
  const manifest = {
    name: "@raypx/ui",
    exports: { ".": "./dist/index.js" },
    devDependencies: { "@raypx/tsconfig": "workspace:*" },
  };
  await writeFile(join(root, "packages/ui/package.json"), JSON.stringify(manifest));
  expect(checkBoundaries(root)).toEqual([]);
  await mkdir(join(root, "packages/ui/src"));
  await writeFile(
    join(root, "packages/ui/src/index.tsx"),
    'import settings from "@raypx/tsconfig/base.json";',
  );
  expect(checkBoundaries(root)).toEqual([
    expect.objectContaining({ message: expect.stringContaining("runtime source") }),
  ]);
  await writeFile(
    join(root, "packages/ui/package.json"),
    JSON.stringify({
      ...manifest,
      devDependencies: {},
      dependencies: { "@raypx/tsconfig": "workspace:*" },
    }),
  );
  expect(
    checkBoundaries(root).some((violation) =>
      violation.message.includes("cannot declare @raypx/tsconfig in dependencies"),
    ),
  ).toBe(true);
});

test("keeps the static configuration package independent and detects engineering cycles", async () => {
  const { root, workspace } = await fixture();
  await workspace("tsconfig");
  await writeFile(
    join(root, "packages/config/package.json"),
    JSON.stringify({
      name: "@raypx/config",
      devDependencies: { "@raypx/tsconfig": "workspace:*" },
    }),
  );
  await writeFile(
    join(root, "packages/tsconfig/package.json"),
    JSON.stringify({
      name: "@raypx/tsconfig",
      devDependencies: { "@raypx/config": "workspace:*" },
    }),
  );
  const messages = checkBoundaries(root).map((violation) => violation.message);
  expect(messages).toEqual(
    expect.arrayContaining([
      expect.stringContaining("cannot declare @raypx/config"),
      expect.stringContaining("Workspace dependency cycle"),
    ]),
  );
});

test("rejects cross-package paths and package dependencies on apps", async () => {
  const { root, workspace } = await fixture();
  await workspace("web");
  await workspace("contracts", ["web"], {
    "src/index.ts": 'import "../../../apps/web/src/router";',
  });
  const messages = checkBoundaries(root).map((violation) => violation.message);
  expect(messages).toEqual(
    expect.arrayContaining([
      expect.stringContaining("must not depend on app"),
      expect.stringContaining("Cross-package path"),
    ]),
  );
});

test("rejects server imports in frontend packages and app components", async () => {
  const { root, workspace } = await fixture();
  await workspace("api");
  await workspace("env");
  await workspace("ui", ["api"], {
    "src/index.tsx": 'export { health } from "@raypx/api/health";',
  });
  await workspace("web", ["env", "api"], {
    "src/App.tsx":
      'import "@raypx/env/server";\nimport type { Health } from "@raypx/api";\nimport "./health.server";',
  });
  const violations = checkBoundaries(root).filter((violation) =>
    violation.message.includes("Server-only import"),
  );
  expect(violations).toHaveLength(4);
});

test("inspects dynamic imports, require calls, reexports, and type imports", async () => {
  const { root, workspace } = await fixture();
  await workspace("contracts");
  await workspace("client", [], {
    "src/index.ts": [
      'const load = () => import("@raypx/contracts");',
      'const schema = require("@raypx/contracts");',
      'export { schema } from "@raypx/contracts";',
      'type Schema = import("@raypx/contracts").Schema;',
    ].join("\n"),
  });
  const violations = checkBoundaries(root).filter((violation) =>
    violation.message.includes("undeclared workspace dependency"),
  );
  expect(violations.map((violation) => violation.line)).toEqual([1, 2, 3, 4]);
});

test("rejects workspace dependency cycles", async () => {
  const { root, workspace } = await fixture();
  await workspace("api", ["auth"]);
  await workspace("auth", ["db"]);
  await workspace("db", ["api"]);
  expect(
    checkBoundaries(root).some((violation) =>
      violation.message.includes("Workspace dependency cycle"),
    ),
  ).toBe(true);
});

test("blocks runtime builtins in browser sources while allowing server and test utilities", async () => {
  const { root, workspace } = await fixture();
  await workspace("contracts", [], {
    "src/index.ts": 'import "node:fs";\nimport "fs/promises";\nimport "bun";\nimport "bun:sqlite";',
    "src/index.test.ts": 'import "node:fs";\nimport "bun:test";',
    "test/contract.test.ts": 'import "node:fs";',
  });
  await workspace("db", [], { "src/index.ts": 'import "bun:sqlite";' });
  const violations = checkBoundaries(root).filter((violation) =>
    violation.message.includes("builtin"),
  );
  expect(violations.map((violation) => violation.line)).toEqual([1, 2, 3, 4]);
});

test("allows a framework-free client core and a separate React adapter", async () => {
  const { root, workspace } = await fixture();
  await workspace("contracts");
  await workspace("client", ["contracts"], {
    "src/index.ts": 'export { checkHealth } from "./health.js";',
    "src/health.ts": 'import { schema } from "@raypx/contracts/health";',
    "src/react/index.ts": 'export { useHealthCheck } from "./health.js";',
    "src/react/health.ts":
      'import { useQuery } from "@tanstack/react-query";\nimport { useEffect } from "react";\nimport { checkHealth } from "../health.js";',
    "test/core.test.ts": 'import { renderHook } from "@testing-library/react";\nimport "react";',
  });
  await workspace("ui", [], {
    "src/hooks/debounce.ts": 'import { useEffect } from "react";',
  });
  await workspace("web", ["client", "ui"], {
    "src/App.tsx":
      'import { useHealthCheck } from "@raypx/client/react";\nimport { useDebouncedValue } from "@raypx/ui/hooks";',
  });
  expect(checkBoundaries(root)).toEqual([]);
  expect(checkSimpleBoundaries(root)).toEqual([]);
});

test("keeps every client core module free of React, including indirect reexports", async () => {
  const { root, workspace } = await fixture();
  await workspace("client", [], {
    "src/index.ts": 'export * from "./shared.js";',
    "src/shared.ts": [
      'export { useEffect } from "react";',
      'const load = () => import("react-dom/client");',
      'const query = require("@tanstack/react-query");',
      'type Node = import("react").ReactNode;',
    ].join("\n"),
  });
  const violations = checkBoundaries(root);
  expect(violations).toHaveLength(4);
  expect(violations.map(({ file, line }) => ({ file, line }))).toEqual([
    { file: "packages/client/src/shared.ts", line: 1 },
    { file: "packages/client/src/shared.ts", line: 2 },
    { file: "packages/client/src/shared.ts", line: 3 },
    { file: "packages/client/src/shared.ts", line: 4 },
  ]);
  expect(violations.every(({ message }) => message.includes("client core"))).toBe(true);
});

test("blocks client core access to the React adapter through public and relative paths", async () => {
  const { root, workspace } = await fixture();
  await workspace("client", [], {
    "src/index.ts": [
      'export * from "./react/index.js";',
      'export * from "@raypx/client/react";',
      'const load = () => import("./helpers/../react/index.js?raw");',
      'type Options = import("./react/options.js").Options;',
      'const adapter = require("./react/index.js");',
    ].join("\n"),
    "src/react/index.ts": 'import "react";',
  });
  const violations = checkBoundaries(root);
  expect(violations).toHaveLength(5);
  expect(violations.map(({ line }) => line)).toEqual([1, 2, 3, 4, 5]);
  expect(violations.every(({ message }) => message.includes("React adapter"))).toBe(true);
});

test("rejects JSX's implicit React dependency in the client core", async () => {
  const { root, workspace } = await fixture();
  await workspace("client", [], {
    "src/index.tsx": "export const panel = <><span>Core</span></>;",
    "src/react/provider.tsx": "export const panel = <span>Adapter</span>;",
  });
  expect(checkBoundaries(root)).toEqual([
    {
      file: "packages/client/src/index.tsx",
      line: 1,
      message: "JSX implicitly imports React and is forbidden in the client core",
    },
  ]);
});

test("keeps Start-specific dependencies and source out of the universal client", async () => {
  const { root, workspace } = await fixture();
  await workspace("client", [], {
    "src/react/index.ts": 'import "@tanstack/react-start";\nimport "@tanstack/start-client-core";',
  });
  await writeFile(
    join(root, "packages/client/package.json"),
    JSON.stringify({
      name: "@raypx/client",
      dependencies: { "@tanstack/react-start": "1.0.0" },
      devDependencies: { "@raypx/config": "workspace:*" },
    }),
  );
  const violations = checkBoundaries(root);
  expect(violations).toHaveLength(3);
  expect(violations[0]?.message).toContain("framework-independent");
  expect(violations.slice(1).every(({ message }) => message.includes("belongs in the app"))).toBe(
    true,
  );
});

test("rejects business workspace dependencies in UI and reverse client dependencies", async () => {
  const { root, workspace } = await fixture();
  await workspace("contracts");
  await workspace("client", ["contracts", "ui"], {
    "src/index.ts": 'import "@raypx/ui/hooks";',
  });
  await workspace("ui", ["contracts"], {
    "src/hooks/index.ts": 'import type { Health } from "@raypx/contracts/health";',
  });
  const violations = checkBoundaries(root);
  expect(violations).toHaveLength(4);
  expect(violations.every(({ message }) => message.includes("cannot"))).toBe(true);
  expect(checkSimpleBoundaries(root)).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        package: "@raypx/client",
        issue: expect.stringContaining("@raypx/ui"),
      }),
      expect.objectContaining({
        package: "@raypx/ui",
        issue: expect.stringContaining("@raypx/contracts"),
      }),
    ]),
  );
});
