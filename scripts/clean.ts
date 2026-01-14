#!/usr/bin/env bun
/**
 * Clean all build artifacts and turbo cache
 *
 * Usage: bun run scripts/clean.ts
 */

import { $ } from "bun";
import consola from "consola";

async function clean() {
  consola.start("🧹 Cleaning project...");

  // Run turbo clean
  consola.log("  Running turbo clean...");
  try {
    await $`turbo run clean`.quiet();
  } catch {
    // Ignore if turbo clean fails
  }

  // Remove .turbo directory
  consola.log("  Removing .turbo directory...");
  try {
    await $`rm -rf .turbo`.quiet();
  } catch {
    // Ignore if directory doesn't exist
  }

  consola.success("Clean complete!");
}

clean();
