#!/usr/bin/env node
/**
 * Check for outdated dependencies
 *
 * Usage: pnpm tsx scripts/check-deps.ts
 */

import { execSync } from "node:child_process";

function run(cmd: string) {
  execSync(cmd, { stdio: "inherit" });
}

async function checkDeps() {
  console.log("🔍 Checking for outdated dependencies...\n");

  run("pnpm outdated --recursive");

  console.log("\n💡 To update dependencies, run: pnpm update --interactive --recursive --latest");
}

checkDeps();
