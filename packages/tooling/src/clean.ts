import { rm } from "node:fs/promises";
import { join } from "node:path";
import { discover } from "./repository.js";

export async function cleanArtifacts(root: string): Promise<void> {
  await remove(root, artifactPaths(root));
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
  await remove(root, [
    ...artifactPaths(root),
    ...discover(root).workspaces.flatMap((workspace) =>
      [
        "dist",
        ".output",
        ".output-cloudflare",
        ".turbo",
        ".tanstack",
        "node_modules/.vite",
        "node_modules/.vite-temp",
        "node_modules/.vitest-cache",
      ].map((output) => join(workspace.path, output)),
    ),
    ".turbo",
    "target",
    "node_modules/.vite",
    "node_modules/.vite-temp",
    "node_modules/.vitest-cache",
    "apps/desktop/build",
    "apps/desktop/artifacts",
    "apps/desktop/.smoke-build.noindex",
    "apps/desktop/.smoke-artifacts.noindex",
    "apps/desktop/.hutch",
    "apps/desktop/.cottontail-tmp",
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
