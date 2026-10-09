#!/usr/bin/env bun

/**
 * Pre-commit hook setup script
 *
 * Installs husky and lint-staged for automated code quality checks
 */

import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";

console.log("📦 Installing pre-commit hooks...\n");

// Install dependencies
console.log("Installing husky and lint-staged...");
execSync("bun add -D husky lint-staged", { stdio: "inherit" });

// Initialize husky
console.log("\nInitializing husky...");
execSync("bunx husky init", { stdio: "inherit" });

// Create pre-commit hook
const preCommitHook = `#!/usr/bin/env sh
. "$(dirname -- "$0")/_/husky.sh"

bunx lint-staged
`;

writeFileSync(".husky/pre-commit", preCommitHook);
execSync("chmod +x .husky/pre-commit");

console.log("\n✅ Pre-commit hooks installed!");
console.log("\nHooks will run on commit:");
console.log("  - Format code with oxfmt");
console.log("  - Lint code with oxlint");
console.log("  - Type check with tsc");
