#!/usr/bin/env node
/**
 * Run database migrations
 *
 * Usage: pnpm tsx scripts/migrate.ts
 */

import { execSync } from "node:child_process";

function run(cmd: string) {
  execSync(cmd, { stdio: "inherit" });
}

async function migrate() {
  // Generate migration
  run("pnpm --filter @raypx/database db:generate");

  // Push schema changes
  run("pnpm --filter @raypx/database db:push");
}

migrate();
