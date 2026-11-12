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
    metadata?: Omit<Metadata, "kind"> & { kind?: Metadata["kind"] };
    source?: string;
    deps?: Record<string, string>;
    extra?: Record<string, unknown>;
  } = {},
) {
  const path = `packages/${name}`;
  mkdirSync(join(root, path, "src"), { recursive: true });
  // Kind is derived from the manifest: applications have no exports, tooling has a bin.
  const { kind = "library", ...metadata } = options.metadata ?? {};
  writeFileSync(
    join(root, path, "package.json"),
    JSON.stringify({
      name: `@raypx/${name}`,
      private: true,
      type: "module",
      ...(kind === "app" ? {} : { exports: { ".": "./src/index.ts" } }),
      ...(kind === "tooling" ? { bin: { [name]: "./src/index.ts" } } : {}),
      devkit: metadata,
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
    });
    expect(index.findings).toEqual(["packages/orphan: missing workspace manifest"]);
    expect(checkArchitecture(index)).toContain("packages/orphan: missing workspace manifest");
    const custom = discover(root, { metadataKey: "product", containers: [] });
    expect(custom.findings).toEqual([]);
    // Kind is derived from the manifest, so a workspace needs no metadata block.
    expect(custom.byName.get("@raypx/one")?.metadata).toEqual({ kind: "library" });
  });
  it("uses complete supplied metadata instead of merging manifest metadata", () => {
    const root = fixture();
    member(root, "one", {
      metadata: {},
      source: 'import "node:fs";',
    });
    member(root, "two");
    const metadata = {
      "packages/one": { kind: "library" },
      "packages/two": { kind: "library" },
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
      metadata: { "packages/one": { kind: "library" } },
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
        "packages/one": { kind: "library" },
        "packages/removed": { kind: "library" },
        "packages/one/": { kind: "library" },
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
        "packages/one": { kind: "unsupported" } as unknown as Metadata,
      },
    });
    expect(checkArchitecture(index)).toEqual(["packages/one: invalid supplied workspace metadata"]);
  });
  it("preserves valid metadata from a custom manifest key when no override is supplied", () => {
    const root = fixture();
    member(root, "one", {
      source: 'import "node:fs";',
      extra: { bin: { one: "./src/index.ts" }, product: {} },
    });
    const index = discover(root, { metadataKey: "product" });
    expect(index.byName.get("@raypx/one")?.metadata).toEqual({
      kind: "tooling",
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
      metadata: { kind: "library" },
      source: `${sideEffect} export const value = 42;`,
    });
    expect(checkArchitecture(discover(root))).toEqual([]);
    expect(
      checkArchitecture(discover(root, { metadata: { "packages/one": { kind: "library" } } })),
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
  it("rejects importing applications and tooling from production libraries", () => {
    const root = fixture();
    member(root, "app", { metadata: { kind: "app" } });
    member(root, "tool", { metadata: { kind: "tooling" } });
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
      metadata: { kind: "tooling" },
      extra: { private: false },
    });
    expect(checkArchitecture(discover(root))).toEqual([]);
    member(root, "app", {
      metadata: { kind: "app" },
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
        sourceEntries: { ".": "./src/index.ts" },
      },
      extra: {
        private: false,
        exports: { ".": { types: "./dist/index.d.mts", import: "./dist/index.mjs" } },
      },
      source: 'export { value } from "./internal.js";',
    });
    writeFileSync(join(root, path, "src/internal.ts"), 'export { value } from "left-pad";');
    const findings = checkArchitecture(discover(root));
    expect(findings).toEqual([
      "packages/generated/src/internal.ts: undeclared runtime dependency left-pad",
    ]);
  });

  it("rejects missing, escaping and unknown source entry mappings", () => {
    const root = fixture();
    member(root, "invalid", {
      metadata: {
        kind: "library",
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
      metadata: { kind: "library", bundledDependencies: ["inlined"] },
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
      member(root, "ui", { metadata: { kind: "library" } });
      member(root, "unlisted");
      member(root, "bundled", {
        metadata: { kind, bundledDependencies: ["@raypx/ui"] },
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

  it("keeps public exports, applications and cycles enforced for internal bundles", () => {
    const root = fixture();
    member(root, "ui", {
      metadata: { kind: "library" },
      extra: { devDependencies: { "@raypx/bundled": "workspace:*" } },
    });
    member(root, "app", { metadata: { kind: "app" } });
    member(root, "bundled", {
      metadata: {
        kind: "tooling",
        bundledDependencies: ["@raypx/ui", "@raypx/app", "@raypx/missing"],
      },
      extra: { devDependencies: { "@raypx/ui": "workspace:*", "@raypx/app": "workspace:*" } },
      source:
        'import "@raypx/ui"; import "@raypx/ui/src/index"; import "@raypx/app"; import "@raypx/missing";',
    });
    const findings = checkArchitecture(discover(root)).join("\n");
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
});
