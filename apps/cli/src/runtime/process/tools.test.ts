import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { BundledTools } from "./tools.ts";

const roots: string[] = [];
afterEach(() => {
  vi.unstubAllEnvs();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "raypx-runtime-tools-"));
  roots.push(root);
  const runtime = join(root, "runtime");
  mkdirSync(runtime);
  const node = join(runtime, process.platform === "win32" ? "node.exe" : "node");
  writeFileSync(node, "bundled Node");
  return {
    root,
    runtime,
    layout: {
      root,
      bundled: true,
      systemNode: false,
      node,
      entry: join(root, "main.mjs"),
      launcher: join(root, "raypx"),
    },
  };
}

it("provides bundled Node without requiring a package manager", () => {
  const { runtime, layout } = fixture();
  vi.stubEnv("PATH", "");
  const tools = new BundledTools(layout);
  expect(tools.pnpm).toBeNull();
  expect(tools.environment({ PATH: "", KEEP: "value" })).toEqual({ PATH: runtime, KEEP: "value" });
});

it("discovers user pnpm and preserves user tools before bundled Node", () => {
  const { root, runtime, layout } = fixture();
  const user = join(root, "user-tools");
  mkdirSync(user);
  const pnpm = join(user, process.platform === "win32" ? "pnpm.CMD" : "pnpm");
  writeFileSync(pnpm, "user pnpm");
  chmodSync(pnpm, 0o755);
  vi.stubEnv("PATH", user);
  const tools = new BundledTools(layout);
  expect(tools.pnpm).toBe(pnpm);
  expect(tools.environment({ PATH: user }).PATH).toBe([user, runtime].join(delimiter));
  expect(tools.environment({ PATH: [user, runtime].join(delimiter) }).PATH).toBe(
    [user, runtime].join(delimiter),
  );
});
