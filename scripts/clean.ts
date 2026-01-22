#!/usr/bin/env node
/**
 * Clean all build artifacts and turbo cache
 *
 * Usage: node scripts/clean.ts
 */

import { execSync } from "node:child_process";
import consola from "consola";

function run(cmd: string) {
  try {
    execSync(cmd, { stdio: "pipe" });
  } catch {
    // Ignore errors
  }
}

async function clean() {
  consola.start("🧹 Cleaning project...");

  // Run turbo clean
  consola.log("  Running turbo clean...");
  run("pnpm turbo run clean");

  // Remove .turbo directory
  consola.log("  Removing .turbo directory...");
  run("rm -rf .turbo");

  consola.success("Clean complete!");
}

clean();
