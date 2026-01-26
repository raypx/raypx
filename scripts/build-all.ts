#!/usr/bin/env node
/**
 * Build all applications
 *
 * Usage: pnpm tsx scripts/build-all.ts
 */

import { execSync } from "node:child_process";

function run(cmd: string) {
  console.log(`  ${cmd}`);
  execSync(cmd, { stdio: "inherit" });
}

async function buildAll() {
  console.log("🔨 Building all applications...\n");

  console.log("Building API...");
  run("pnpm turbo build --filter=api");

  console.log("\nBuilding Web...");
  run("pnpm turbo build --filter=web");

  console.log("\nBuilding Docs...");
  run("pnpm turbo build --filter=docs");

  console.log("\nBuilding Desktop...");
  run("pnpm --filter desktop build");

  console.log("\n✅ All applications built successfully!");
}

buildAll();
