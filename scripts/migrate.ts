#!/usr/bin/env node
/**
 * Run database migrations
 *
 * Usage: pnpm tsx scripts/migrate.ts
 */

import { execSync } from "node:child_process";

function run(cmd: string) {
  console.log(`  ${cmd}`);
  execSync(cmd, { stdio: "inherit" });
}

async function migrate() {
  console.log("🔄 Running database migrations...\n");

  // Generate migration
  console.log("Generating database client...");
  run("pnpm --filter @raypx/database db:generate");

  // Push schema changes
  console.log("\nPushing schema changes...");
  run("pnpm --filter @raypx/database db:push");

  console.log("\n✅ Migrations complete!");
}

migrate();
