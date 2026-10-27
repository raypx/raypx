import { rm } from "node:fs/promises";
import { join } from "node:path";
import { discover } from "./repository.js";

export async function clean(root: string): Promise<void> {
  const outputs = [
    ...discover(root).workspaces.flatMap((workspace) =>
      [
        "dist",
        ".output",
        ".output-cloudflare",
        "coverage",
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
    ".artifacts",
    "apps/desktop/build",
    "apps/desktop/artifacts",
    "apps/desktop/.smoke-build.noindex",
    "apps/desktop/.smoke-artifacts.noindex",
    "apps/desktop/.hutch",
    "apps/desktop/.cottontail-tmp",
    "e2e/test-results",
    "e2e/playwright-report",
  ];
  const concurrency = 8;
  for (let offset = 0; offset < outputs.length; offset += concurrency)
    await Promise.all(
      outputs
        .slice(offset, offset + concurrency)
        .map((output) => rm(join(root, output), { recursive: true, force: true })),
    );
}
