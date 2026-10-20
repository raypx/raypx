import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach } from "vite-plus/test";
import type { Metadata } from "@voidmix/devkit/workspaces";

export function workspaceFixtures() {
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
  return { fixture, member };
}
