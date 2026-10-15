import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { checkArchitecture } from "./architecture.js";
import { checkLocales } from "./policy.js";
import { scaffold } from "./scaffold.js";
import { discover, type Metadata } from "./workspaces.js";

const roots: string[] = [];
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "raypx-framework-test-"));
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
      raypx: options.metadata ?? { kind: "library", target: "universal" },
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

describe("extensible workspace foundation", () => {
  it("discovers a scaffolded package without editing any central list and refuses overwrite", () => {
    const root = fixture();
    const preview = scaffold(root, "feature-kit", { kind: "library", target: "universal" });
    expect(preview).toContain("packages/feature-kit/src/index.ts");
    expect(discover(root).workspaces).toHaveLength(0);
    scaffold(root, "feature-kit", { kind: "library", target: "universal", write: true });
    expect(discover(root).byName.has("@raypx/feature-kit")).toBe(true);
    expect(checkArchitecture(discover(root))).toEqual([]);
    expect(readFileSync(join(root, "packages/feature-kit/package.json"), "utf8")).not.toContain(
      '"build"',
    );
    expect(() =>
      scaffold(root, "feature-kit", { kind: "library", target: "universal", write: true }),
    ).toThrow("already exists");
    expect(() => scaffold(root, "../escape", { kind: "library", target: "universal" })).toThrow(
      "hyphenated",
    );
    expect(() => scaffold(root, "con", { kind: "library", target: "universal" })).toThrow(
      "reserved on Windows",
    );
  });
  it("rejects undeclared dependencies, private relative paths, and dev-only cycles", () => {
    const root = fixture();
    member(root, "one", {
      source: 'import "@raypx/two"; import "../../two/src/index";',
      extra: { devDependencies: { "@raypx/two": "workspace:*" } },
    });
    member(root, "two", { extra: { devDependencies: { "@raypx/one": "workspace:*" } } });
    const findings = checkArchitecture(discover(root)).join("\n");
    expect(findings).toContain("undeclared runtime dependency");
    expect(findings).toContain("private cross-workspace");
    expect(findings).toContain("dependency cycle");
  });
  it("follows private modules behind a pure public export and detects DOM and host leaks", () => {
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
  it("detects nested locale mismatches and interpolation drift without executing catalogs", () => {
    const root = fixture();
    member(root, "messages");
    mkdirSync(join(root, "packages/messages/src/messages"));
    writeFileSync(
      join(root, "packages/messages/src/messages/en.ts"),
      'export default { auth: { hello: "Hi {name}" } } as const;',
    );
    writeFileSync(
      join(root, "packages/messages/src/messages/zh.ts"),
      'export default { auth: { hello: "你好 {email}" } } as const;',
    );
    expect(checkLocales(root).join("\n")).toContain("interpolation variables differ");
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
  it("rejects private alias imports and undeclared external packages", () => {
    const root = fixture();
    member(root, "private");
    const from = member(root, "consumer", {
      source: 'import "#secret"; import "undeclared-package";',
    });
    const manifest = join(root, from, "package.json");
    const data = JSON.parse(readFileSync(manifest, "utf8"));
    data.imports = { "#secret": "../private/src/index.ts" };
    writeFileSync(manifest, JSON.stringify(data));
    const findings = checkArchitecture(discover(root)).join("\n");
    expect(findings).toContain("private cross-workspace import #secret");
    expect(findings).toContain("undeclared runtime dependency undeclared-package");
  });
});
