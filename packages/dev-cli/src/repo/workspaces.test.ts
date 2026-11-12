import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vite-plus/test";
import { discover, workspaceKind } from "./workspaces.js";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

it("derives kind from bin and exports", () => {
  expect(workspaceKind({ bin: { tool: "./bin.ts" } })).toBe("tooling");
  expect(workspaceKind({ bin: { tool: "./bin.ts" }, exports: { ".": "./src/index.ts" } })).toBe(
    "tooling",
  );
  expect(workspaceKind({})).toBe("app");
  expect(workspaceKind({ exports: { ".": "./src/index.ts" } })).toBe("library");
});

it("reports retired fields and needs no metadata block", () => {
  const root = mkdtempSync(join(tmpdir(), "raypx-workspaces-"));
  roots.push(root);
  writeFileSync(join(root, "package.json"), JSON.stringify({ workspaces: ["packages/*"] }));
  for (const [name, raypx] of [
    ["kit", { kind: "library", target: "node", entryTargets: {}, sourceTargets: {} }],
    ["plain", undefined],
  ] as const) {
    mkdirSync(join(root, "packages", name), { recursive: true });
    writeFileSync(
      join(root, "packages", name, "package.json"),
      JSON.stringify({ name: `@raypx/${name}`, exports: { ".": "./index.ts" }, raypx }),
    );
  }
  const index = discover(root, { metadataKey: "raypx" });
  expect(index.byName.get("@raypx/plain")?.metadata).toEqual({ kind: "library" });
  expect(index.byName.get("@raypx/kit")?.metadata?.kind).toBe("library");
  expect(index.findings).toEqual(
    ["kind", "target", "entryTargets", "sourceTargets"].map(
      (field) => `packages/kit/package.json: raypx.${field} is retired; remove it`,
    ),
  );
});
