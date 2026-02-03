#!/usr/bin/env node
/**
 * Clean all build artifacts and turbo cache
 *
 * Usage: pnpm tsx scripts/clean.ts
 */

import { execSync } from "node:child_process";
import { rmSync } from "node:fs";
import { join } from "node:path";

function run(cmd: string) {
  try {
    execSync(cmd, { stdio: "pipe" });
  } catch {
    // Ignore errors
  }
}

async function clean() {
  // Run turbo clean
  run("pnpm turbo run clean");

  // Remove .turbo directory
  rmSync(join(process.cwd(), ".turbo"), { recursive: true, force: true });

  // Remove node_modules from all packages
  run("rm -rf apps/*/node_modules packages/*/node_modules");
}

clean();
