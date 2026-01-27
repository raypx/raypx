#!/usr/bin/env node
/**
 * Build all applications
 *
 * Usage: pnpm tsx scripts/build-all.ts
 */

import { execSync } from "node:child_process";

function run(cmd: string) {
  execSync(cmd, { stdio: "inherit" });
}

async function buildAll() {
  run("pnpm turbo build --filter=api");
  run("pnpm turbo build --filter=web");
  run("pnpm turbo build --filter=docs");
  run("pnpm --filter desktop build");
}

buildAll();
