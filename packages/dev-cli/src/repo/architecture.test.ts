import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { checkArchitecture } from "./architecture.js";
import { discover, type Metadata } from "@raypx/task-graph/workspaces";

const roots: string[] = [];
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "raypx-architecture-test-"));
  roots.push(root);
  mkdirSync(join(root, "packages"));
  mkdirSync(join(root, "apps"));
  writeFileSync(
    join(root, "package.json"),
    JSON.stringify({ workspaces: { packages: ["apps/*", "packages/*"] } }),
  );
  return root;
}
function member(
  root: string,
  name: string,
  options: {
    metadata?: Metadata;
    source?: string;
    deps?: Record<string, string>;
    extra?: Record<string, unknown>;
  } = {},
) {
  const path = `packages/${name}`;
  mkdirSync(join(root, path, "src"), { recursive: true });
  writeFileSync(
    join(root, path, "package.json"),
    JSON.stringify({
      name: `@raypx/${name}`,
      private: true,
      type: "module",
      exports: { ".": "./src/index.ts" },
      devkit: options.metadata ?? { kind: "library", target: "universal" },
      dependencies: options.deps ?? {},
      ...options.extra,
    }),
  );
  writeFileSync(join(root, path, "src/index.ts"), options.source ?? "export const answer = 42;");
  return path;
}
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("workspace architecture", () => {
  it("discovers workspaces from manifests and reads metadata from a configured key", () => {
    const root = fixture();
    member(root, "one");
    mkdirSync(join(root, "packages/orphan"));
    const index = discover(root);
    expect(index.byName.get("@raypx/one")?.metadata).toEqual({
      kind: "library",
      target: "universal",
    });
    expect(index.findings).toEqual(["packages/orphan: missing workspace manifest"]);
    expect(checkArchitecture(index)).toContain("packages/orphan: missing workspace manifest");
    const custom = discover(root, { metadataKey: "product", containers: [] });
    expect(custom.findings).toEqual([]);
    expect(checkArchitecture(custom)).toContain(
      "packages/one/package.json: invalid or missing product metadata",
    );
  });
  it("uses complete supplied metadata instead of merging manifest metadata", () => {
    const root = fixture();
    member(root, "one", {
      metadata: {
        kind: "app",
        target: "browser",
        sourceTargets: { "src/index.ts": "browser" },
      },
      source: 'import "node:fs";',
    });
    member(root, "two");
    const metadata = {
      "packages/one": { kind: "library", target: "node" },
      "packages/two": { kind: "library", target: "universal" },
    } satisfies Readonly<Record<string, Metadata>>;
    const index = discover(root, { metadata });
    expect(index.byName.get("@raypx/one")?.metadata).toEqual(metadata["packages/one"]);
    expect(index.findings).toEqual([]);
    expect(checkArchitecture(index)).toEqual([]);
  });
  it("requires supplied metadata for every workspace even when manifests contain it", () => {
    const root = fixture();
    member(root, "one");
    member(root, "two");
    const index = discover(root, {
      metadata: { "packages/one": { kind: "library", target: "universal" } },
    });
    expect(index.byName.get("@raypx/two")?.metadata).toBeUndefined();
    expect(index.findings).toEqual(["packages/two: missing supplied workspace metadata"]);
    expect(checkArchitecture(index)).toEqual(index.findings);
    expect(checkArchitecture(discover(root, { metadata: {} }))).toEqual([
      "packages/one: missing supplied workspace metadata",
      "packages/two: missing supplied workspace metadata",
    ]);
  });
  it("rejects supplied metadata for paths that are not exact workspace paths", () => {
    const root = fixture();
    member(root, "one");
    const index = discover(root, {
      metadata: {
        "packages/one": { kind: "library", target: "universal" },
        "packages/removed": { kind: "library", target: "universal" },
        "packages/one/": { kind: "library", target: "universal" },
      },
    });
    expect(index.findings).toEqual([
      "packages/one/: metadata supplied for unknown workspace",
      "packages/removed: metadata supplied for unknown workspace",
    ]);
    expect(checkArchitecture(index)).toEqual(index.findings);
  });
  it("attributes invalid supplied metadata to the workspace rather than its manifest", () => {
    const root = fixture();
    member(root, "one");
    const index = discover(root, {
      metadata: {
        "packages/one": { kind: "library", target: "unsupported" } as unknown as Metadata,
      },
    });
    expect(checkArchitecture(index)).toEqual(["packages/one: invalid supplied workspace metadata"]);
  });
  it("preserves valid metadata from a custom manifest key when no override is supplied", () => {
    const root = fixture();
    member(root, "one", {
      source: 'import "node:fs";',
      extra: { product: { kind: "tooling", target: "node" } },
    });
    const index = discover(root, { metadataKey: "product" });
    expect(index.byName.get("@raypx/one")?.metadata).toEqual({
      kind: "tooling",
      target: "node",
    });
    expect(checkArchitecture(index)).toEqual([]);
  });
  it("does not load root configuration or execute inspected source files", () => {
    const root = fixture();
    const marker = join(root, "executed.txt");
    const sideEffect = `import { writeFileSync } from "node:fs"; writeFileSync(${JSON.stringify(marker)}, "executed");`;
    writeFileSync(
      join(root, "devkit.config.ts"),
      `${sideEffect} throw new Error("config executed");`,
    );
    member(root, "one", {
      metadata: { kind: "library", target: "node" },
      source: `${sideEffect} export const value = 42;`,
    });
    expect(checkArchitecture(discover(root))).toEqual([]);
    expect(
      checkArchitecture(
        discover(root, { metadata: { "packages/one": { kind: "library", target: "node" } } }),
      ),
    ).toEqual([]);
    expect(existsSync(marker)).toBe(false);
  });
  it("rejects undeclared dependencies, internal relative paths, and dev-only cycles", () => {
    const root = fixture();
    member(root, "one", {
      source: 'import "@raypx/two"; import "../../two/src/index";',
      extra: { devDependencies: { "@raypx/two": "workspace:*" } },
    });
    member(root, "two", { extra: { devDependencies: { "@raypx/one": "workspace:*" } } });
    const findings = checkArchitecture(discover(root)).join("\n");
    expect(findings).toContain("undeclared runtime dependency");
    expect(findings).toContain("internal cross-workspace");
    expect(findings).toContain("dependency cycle");
  });
  it("follows internal modules behind a pure public export and detects DOM and host leaks", () => {
    const root = fixture();
    const path = member(root, "tokens", { source: 'export { read } from "./internal.js";' });
    writeFileSync(
      join(root, path, "src/internal.ts"),
      'import { readFile } from "node:fs"; export const read = () => document.body;',
    );
    const findings = checkArchitecture(discover(root)).join("\n");
    expect(findings).toContain("universal code cannot import node:fs");
    expect(findings).toContain("reaches DOM global");
  });
  it("allows public pure subpaths while rejecting browser entry in native consumer", () => {
    const root = fixture();
    const ui = member(root, "ui", {
      metadata: {
        kind: "library",
        target: "browser",
        entryTargets: { "./theme": "universal" },
        sourceTargets: { "src/theme.ts": "universal" },
      },
      extra: { exports: { ".": "./src/index.ts", "./theme": "./src/theme.ts" } },
    });
    writeFileSync(join(root, ui, "src/theme.ts"), "export const theme = 'dark';");
    member(root, "native", {
      metadata: { kind: "library", target: "native" },
      deps: { "@raypx/ui": "workspace:*" },
      source: 'import "@raypx/ui/theme";',
    });
    expect(checkArchitecture(discover(root))).toEqual([]);
    writeFileSync(join(root, "packages/native/src/index.ts"), 'import "@raypx/ui";');
    expect(checkArchitecture(discover(root)).join("\n")).toContain(
      "native entry cannot import browser entry",
    );
  });
  it("rejects importing applications and tooling from production libraries", () => {
    const root = fixture();
    member(root, "app", { metadata: { kind: "app", target: "browser" } });
    member(root, "tool", { metadata: { kind: "tooling", target: "bun" } });
    member(root, "consumer", {
      deps: { "@raypx/app": "workspace:*", "@raypx/tool": "workspace:*" },
      source: 'import "@raypx/app"; import "@raypx/tool";',
    });
    const findings = checkArchitecture(discover(root)).join("\n");
    expect(findings).toContain("applications cannot be imported");
    expect(findings).toContain("runtime cannot depend on tooling");
  });
  it("rejects internal alias imports and undeclared external packages", () => {
    const root = fixture();
    member(root, "internal");
    const from = member(root, "consumer", {
      source: 'import "#secret"; import "undeclared-package";',
    });
    const manifest = join(root, from, "package.json");
    const data = JSON.parse(readFileSync(manifest, "utf8"));
    data.imports = { "#secret": "../internal/src/index.ts" };
    writeFileSync(manifest, JSON.stringify(data));
    const findings = checkArchitecture(discover(root)).join("\n");
    expect(findings).toContain("internal cross-workspace import #secret");
    expect(findings).toContain("undeclared runtime dependency undeclared-package");
  });

  it("accepts published libraries and tooling while requiring private ESM applications", () => {
    const root = fixture();
    member(root, "public", { extra: { private: false } });
    member(root, "tool", {
      metadata: { kind: "tooling", target: "node" },
      extra: { private: false },
    });
    expect(checkArchitecture(discover(root))).toEqual([]);
    member(root, "app", {
      metadata: { kind: "app", target: "browser" },
      extra: { private: false, type: "commonjs" },
    });
    expect(checkArchitecture(discover(root))).toEqual([
      "packages/app: workspaces must be ESM",
      "packages/app: applications must be private",
    ]);
  });

  it("walks maintained sources behind generated exports without requiring a build", () => {
    const root = fixture();
    const path = member(root, "generated", {
      metadata: {
        kind: "library",
        target: "universal",
        sourceEntries: { ".": "./src/index.ts" },
      },
      extra: {
        private: false,
        exports: { ".": { types: "./dist/index.d.mts", import: "./dist/index.mjs" } },
      },
      source: 'export { value } from "./internal.js";',
    });
    writeFileSync(join(root, path, "src/internal.ts"), "export const value = document.body;");
    const findings = checkArchitecture(discover(root));
    expect(findings).toEqual([
      "packages/generated: . reaches DOM global in packages/generated/src/internal.ts",
    ]);
  });

  it("resolves another workspace's source entry transitively instead of a stale bundle", () => {
    const root = fixture();
    const path = member(root, "node", {
      metadata: {
        kind: "library",
        target: "node",
        sourceEntries: { ".": "./src/index.ts" },
      },
      extra: { exports: { ".": "./dist/index.mjs" } },
      source: 'import "node:fs";',
    });
    mkdirSync(join(root, path, "dist"));
    writeFileSync(join(root, path, "dist/index.mjs"), "export const stale = true;");
    member(root, "browser", {
      metadata: { kind: "library", target: "browser" },
      deps: { "@raypx/node": "workspace:*" },
      source: 'import "@raypx/node";',
    });
    const findings = checkArchitecture(discover(root)).join("\n");
    expect(findings).toContain("browser entry cannot import node entry @raypx/node");
    expect(findings).toContain("packages/node/src/index.ts: browser code cannot import node:fs");
  });

  it("rejects missing, escaping and unknown source entry mappings", () => {
    const root = fixture();
    member(root, "invalid", {
      metadata: {
        kind: "library",
        target: "universal",
        sourceEntries: {
          ".": "./src/missing.ts",
          "./escape": "../other.ts",
          "./unknown": "./src/index.ts",
        },
      },
      extra: { exports: { ".": "./dist/index.mjs", "./escape": "./dist/escape.mjs" } },
    });
    expect(checkArchitecture(discover(root))).toEqual([
      "packages/invalid: invalid sourceEntries override .: ./src/missing.ts",
      "packages/invalid: invalid sourceEntries override ./escape: ../other.ts",
      "packages/invalid: invalid sourceEntries override ./unknown: ./src/index.ts",
    ]);
  });

  it("allows only explicitly bundled external development dependencies at runtime", () => {
    const root = fixture();
    member(root, "bundled", {
      metadata: { kind: "library", target: "universal", bundledDependencies: ["inlined"] },
      extra: { devDependencies: { inlined: "^1.0.0", unbundled: "^1.0.0" } },
      source: 'import "inlined/subpath"; import "unbundled";',
    });
    expect(checkArchitecture(discover(root))).toEqual([
      "packages/bundled/src/index.ts: undeclared runtime dependency unbundled",
    ]);
  });

  it("does not use bundled metadata to permit undeclared or internal dependencies", () => {
    const root = fixture();
    member(root, "internal");
    member(root, "bundled", {
      metadata: {
        kind: "library",
        target: "universal",
        bundledDependencies: ["undeclared", "@raypx/internal"],
      },
      extra: { devDependencies: { "@raypx/internal": "workspace:*" } },
      source: 'import "undeclared"; import "@raypx/internal";',
    });
    const findings = checkArchitecture(discover(root)).join("\n");
    expect(findings).toContain(
      "bundled dependency must be an external development dependency: undeclared",
    );
    expect(findings).toContain(
      "bundled dependency must be an external development dependency: @raypx/internal",
    );
    expect(findings).toContain("undeclared runtime dependency undeclared");
    expect(findings).toContain("undeclared runtime dependency @raypx/internal");
  });

  it.each(["app", "tooling"] as const)(
    "allows explicit internal development bundles only for %s runtime",
    (kind) => {
      const root = fixture();
      member(root, "ui", { metadata: { kind: "library", target: "browser" } });
      member(root, "unlisted");
      member(root, "bundled", {
        metadata: { kind, target: "browser", bundledDependencies: ["@raypx/ui"] },
        extra: {
          devDependencies: { "@raypx/ui": "workspace:*", "@raypx/unlisted": "workspace:*" },
        },
        source: 'import "@raypx/ui"; import "@raypx/unlisted";',
      });
      expect(checkArchitecture(discover(root))).toEqual([
        "packages/bundled/src/index.ts: undeclared runtime dependency @raypx/unlisted",
      ]);
    },
  );

  it("keeps platforms, public exports, applications and cycles enforced for internal bundles", () => {
    const root = fixture();
    member(root, "ui", {
      metadata: { kind: "library", target: "browser" },
      extra: { devDependencies: { "@raypx/bundled": "workspace:*" } },
    });
    member(root, "app", { metadata: { kind: "app", target: "node" } });
    member(root, "bundled", {
      metadata: {
        kind: "tooling",
        target: "node",
        bundledDependencies: ["@raypx/ui", "@raypx/app", "@raypx/missing"],
      },
      extra: { devDependencies: { "@raypx/ui": "workspace:*", "@raypx/app": "workspace:*" } },
      source:
        'import "@raypx/ui"; import "@raypx/ui/src/index"; import "@raypx/app"; import "@raypx/missing";',
    });
    const findings = checkArchitecture(discover(root)).join("\n");
    expect(findings).toContain("node entry cannot import browser entry @raypx/ui");
    expect(findings).toContain("internal cross-workspace import @raypx/ui/src/index");
    expect(findings).toContain("application source cannot be imported: @raypx/app");
    expect(findings).toContain("workspace dependency cycle:");
    expect(findings).toContain(
      "bundled dependency must be an external development dependency: @raypx/missing",
    );
    expect(findings).toContain("undeclared runtime dependency @raypx/missing");
  });

  it("recognizes DefinitelyTyped packages for type imports without allowing runtime imports", () => {
    const root = fixture();
    member(root, "typed", {
      extra: { devDependencies: { "@types/mdx": "^2.0.0", "@types/scope__pkg": "^1.0.0" } },
      source:
        'import type { Component } from "mdx/types"; import type { Value } from "@scope/pkg"; import "mdx";',
    });
    expect(checkArchitecture(discover(root))).toEqual([
      "packages/typed/src/index.ts: undeclared runtime dependency mdx",
    ]);
  });

  it("distinguishes DOM globals from local variables, parameters, comments and strings", () => {
    const root = fixture();
    member(root, "pure", {
      source: `
        // document.body and window.location are examples, not executed code.
        export const example = "localStorage.getItem('key')";
        export function read(document: { value: number }) { return document.value; }
        export function local() { const window = { value: 1 }; return window.value; }
        export const value = (sessionStorage: { length: number }) => sessionStorage.length;
      `,
    });
    expect(checkArchitecture(discover(root))).toEqual([]);
  });

  it("does not hide a DOM global because a sibling function binds the same name", () => {
    const root = fixture();
    member(root, "leak", {
      source: `
        export function local(document: { value: number }) { return document.value; }
        export function leak() { return document.body; }
      `,
    });
    expect(checkArchitecture(discover(root))).toEqual([
      "packages/leak: . reaches DOM global in packages/leak/src/index.ts",
    ]);
  });

  it("keeps loop bindings local while resolving hoisted var bindings", () => {
    const root = fixture();
    member(root, "scope", {
      source: `
        export function local() {
          if (true) { var document = { value: 1 }; }
          return document.value;
        }
        for (const window of [{ value: 1 }]) { console.log(window.value); }
        export const leak = () => window.location;
      `,
    });
    expect(checkArchitecture(discover(root))).toEqual([
      "packages/scope: . reaches DOM global in packages/scope/src/index.ts",
    ]);
  });
});
