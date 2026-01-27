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
  run("pnpm outdated --recursive");
}

checkDeps();
