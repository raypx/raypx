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

function log(message: string) {
  console.log(`  ${message}`);
}

async function clean() {
  log("🧹 Cleaning project...");

  // Run turbo clean
  log("Running turbo clean...");
  run("pnpm turbo run clean");

  // Remove .turbo directory
  log("Removing .turbo directory...");
  rmSync(join(process.cwd(), ".turbo"), { recursive: true, force: true });

  // Remove node_modules from all packages
  log("Removing node_modules from apps and packages...");
  run("rm -rf apps/*/node_modules packages/*/node_modules");

  console.log("✅ Clean complete!");
}

clean();
