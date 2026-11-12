import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vite-plus/test";
import { discover, workspaceKind } from "./workspaces.js";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

it("derives kind from bin, exports and target", () => {
  expect(workspaceKind({ bin: { tool: "./bin.ts" } }, "bun")).toBe("tooling");
  expect(workspaceKind({}, "bun")).toBe("app");
  expect(workspaceKind({}, "browser")).toBe("app");
  expect(workspaceKind({ exports: { ".": "./src/index.ts" } }, "bun")).toBe("tooling");
  expect(workspaceKind({ exports: { ".": "./src/index.ts" } }, "universal")).toBe("library");
});

it("rejects a declared kind and derives it instead", () => {
  const root = mkdtempSync(join(tmpdir(), "raypx-workspaces-"));
  roots.push(root);
  writeFileSync(join(root, "package.json"), JSON.stringify({ workspaces: ["packages/*"] }));
  mkdirSync(join(root, "packages/kit"), { recursive: true });
  writeFileSync(
    join(root, "packages/kit/package.json"),
    JSON.stringify({ name: "@raypx/kit", raypx: { kind: "library", target: "node" } }),
  );
  const index = discover(root, { metadataKey: "raypx" });
  expect(index.byName.get("@raypx/kit")?.metadata).toEqual({ kind: "app", target: "node" });
  expect(index.findings).toEqual([
    "packages/kit/package.json: raypx.kind is derived from exports, bin and target; remove it",
  ]);
});
