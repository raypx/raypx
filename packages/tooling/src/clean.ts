import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { run } from "@raypx-kit/devkit/process";
import { discover } from "./repository.js";

export async function cleanArtifacts(root: string): Promise<void> {
  await remove(root, artifactPaths(root));
}

export async function cleanRust(root: string): Promise<void> {
  const target = resolve(root, process.env.CARGO_TARGET_DIR || "target");
  if (!existsSync(join(root, "Cargo.toml")) || !existsSync(target)) return;
  await run("cargo", ["clean", "--workspace", "--profile", "dev", "--locked", "--offline"], root);
}

function artifactPaths(root: string): string[] {
  return [
    ".artifacts",
    "node_modules/.cache/raypx-tests",
    ...discover(root).workspaces.flatMap((workspace) =>
      [".artifacts", "coverage", "node_modules/.cache/raypx-tests"].map((output) =>
        join(workspace.path, output),
      ),
    ),
    "e2e/test-results",
    "e2e/playwright-report",
  ];
}

export async function clean(root: string): Promise<void> {
  await cleanRust(root);
  await remove(root, [
    ...artifactPaths(root),
    ...discover(root).workspaces.flatMap((workspace) =>
      [
        "dist",
        ".output",
        ".turbo",
        ".tanstack",
        "node_modules/.vite",
        "node_modules/.vite-temp",
        "node_modules/.vitest-cache",
      ].map((output) => join(workspace.path, output)),
    ),
    ".turbo",
    "node_modules/.vite",
    "node_modules/.vite-temp",
    "node_modules/.vitest-cache",
    "apps/desktop/artifacts",
    "apps/desktop/src-tauri/binaries",
    "apps/desktop/src-tauri/gen",
  ]);
}

async function remove(root: string, outputs: string[]): Promise<void> {
  const concurrency = 8;
  for (let offset = 0; offset < outputs.length; offset += concurrency)
    await Promise.all(
      outputs
        .slice(offset, offset + concurrency)
        .map((output) => rm(join(root, output), { recursive: true, force: true })),
    );
}
