#!/usr/bin/env bun

/**
 * Raypx CLI - Unified development tool
 *
 * Simplifies common development tasks and eliminates script duplication
 */

import { execFileSync, spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../../", import.meta.url));

const COMMANDS = {
  // Environment & validation
  "check-env": "Check Node.js and Bun versions",
  check: "Run all checks (build, lint, typecheck, test)",

  // Development
  dev: "Start development server",
  build: "Build all packages",
  start: "Start production server",

  // Code quality
  lint: "Run linter",
  "lint:fix": "Fix linting issues automatically",
  format: "Format code",
  "format:check": "Check code formatting",

  // Testing
  test: "Run tests",
  "test:watch": "Run tests in watch mode",
  "test:coverage": "Run tests with coverage",

  // Type checking
  typecheck: "Check TypeScript types",

  // Utilities
  clean: "Clean build artifacts",
  install: "Install dependencies",
  help: "Show this help",
};

// Execute command helper
function exec(command: string, args: string[] = [], options: { silent?: boolean } = {}) {
  if (!options.silent) {
    console.log(`→ ${command} ${args.join(" ")}`);
  }

  const result = spawnSync(command, args, {
    stdio: "inherit",
    shell: true,
    cwd: root,
  });

  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

// Command implementations
async function checkEnv() {
  const { checkDevelopmentEnvironment } = await import("./environment.ts");

  let nodeVersion = "unavailable (install Node.js and add it to PATH)";
  try {
    nodeVersion = execFileSync("node", ["--version"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 10_000,
    }).trim();
  } catch {
    // Bun's Node.js version describes compatibility, not the toolchain on PATH.
  }
  const bunVersion = process.versions.bun;
  const manager = process.env.npm_config_user_agent?.split(" ")[0]?.split("/");

  const errors = checkDevelopmentEnvironment(root, {
    nodeVersion,
    bunVersion: bunVersion ?? "unavailable",
    ...(manager?.[0] ? { packageManagerName: manager[0] } : {}),
    ...(manager?.[1] ? { packageManagerVersion: manager[1] } : {}),
  });

  if (errors.length > 0) {
    console.error("✗ Environment check failed:");
    errors.forEach((err) => console.error(`  - ${err}`));
    process.exit(1);
  }

  console.log(`✓ Environment OK (Node.js ${nodeVersion}, Bun ${bunVersion})`);
}

async function runCheck() {
  await checkEnv();
  console.log("\n→ Running full check suite...\n");

  exec("vp", ["run", "--filter", "@raypx/*", "build"]);
  exec("vp", ["fmt", "--check"]);
  exec("vp", ["lint", "--deny-warnings"]);
  exec("bun", ["packages/config/src/check-boundaries.ts"]);
  exec("vp", ["run", "--filter", "@raypx/*", "typecheck"]);
  exec("vp", ["run", "--filter", "@raypx/*", "test"]);

  console.log("\n✓ All checks passed!");
}

async function dev() {
  await checkEnv();
  console.log("\n→ Starting development server...\n");

  // Build dependencies first
  exec("vp", ["run", "--filter", "@raypx/*", "--filter", "!@raypx/web", "build"]);

  // Start dev servers in parallel
  exec("vp", ["run", "--filter", "@raypx/*", "--parallel", "dev"]);
}

async function build() {
  await checkEnv();
  console.log("\n→ Building all packages...\n");

  exec("vp", ["run", "--filter", "@raypx/*", "build"]);

  console.log("\n✓ Build complete!");
}

async function start() {
  await checkEnv();
  console.log("\n→ Starting production server...\n");

  exec("vp", ["run", "@raypx/web#start"]);
}

function lint(fix = false) {
  console.log(`\n→ ${fix ? "Fixing" : "Checking"} code with Oxlint...\n`);

  const args = ["lint", "--deny-warnings"];
  if (fix) args.push("--fix");

  exec("vp", args);

  console.log(`\n✓ Lint ${fix ? "fixed" : "passed"}!`);
}

function format(check = false) {
  console.log(`\n→ ${check ? "Checking" : "Formatting"} code with Oxfmt...\n`);

  const args = ["fmt"];
  if (check) args.push("--check");

  exec("vp", args);

  console.log(`\n✓ Format ${check ? "check passed" : "complete"}!`);
}

function test(mode: "run" | "watch" | "coverage" = "run") {
  console.log(`\n→ Running tests (${mode})...\n`);

  if (mode === "coverage") {
    exec("vp", ["run", "--filter", "@raypx/*", "build"]);
    exec("vp", ["test", "run", "--coverage"]);
  } else if (mode === "watch") {
    exec("vp", ["test", "watch", "--exclude", "**/production.test.ts"]);
  } else {
    exec("vp", ["run", "--filter", "@raypx/*", "test"]);
  }
}

function typecheck() {
  console.log("\n→ Checking TypeScript types...\n");

  exec("vp", ["run", "--filter", "@raypx/*", "typecheck"]);

  console.log("\n✓ Type check passed!");
}

function clean() {
  console.log("\n→ Cleaning build artifacts...\n");

  const dirsToClean = [
    "packages/*/dist",
    "packages/*/.output",
    "apps/*/dist",
    "apps/*/.output",
    "apps/*/.tanstack",
    "coverage",
  ];

  for (const pattern of dirsToClean) {
    exec("rm", ["-rf", pattern], { silent: true });
  }

  console.log("✓ Clean complete!");
}

function install() {
  console.log("\n→ Installing dependencies...\n");

  exec("bun", ["install", "--frozen-lockfile"]);

  console.log("\n✓ Dependencies installed!");
}

function showHelp() {
  console.log(`
Raypx CLI - Unified development tool

Usage:
  raypx <command> [options]

Commands:`);

  const maxLen = Math.max(...Object.keys(COMMANDS).map((k) => k.length));

  for (const [cmd, desc] of Object.entries(COMMANDS)) {
    console.log(`  ${cmd.padEnd(maxLen + 2)} ${desc}`);
  }

  console.log(`
Examples:
  raypx dev              Start development
  raypx check            Run all checks
  raypx lint:fix         Auto-fix linting issues
  raypx test:watch       Run tests in watch mode
  raypx clean            Clean build artifacts
`);
}

// Command router
async function main() {
  const command = process.argv[2] || "help";

  try {
    switch (command) {
      case "check-env":
        await checkEnv();
        break;
      case "check":
        await runCheck();
        break;
      case "dev":
        await dev();
        break;
      case "build":
        await build();
        break;
      case "start":
        await start();
        break;
      case "lint":
        lint(false);
        break;
      case "lint:fix":
        lint(true);
        break;
      case "format":
        format(false);
        break;
      case "format:check":
        format(true);
        break;
      case "test":
        test("run");
        break;
      case "test:watch":
        test("watch");
        break;
      case "test:coverage":
        test("coverage");
        break;
      case "typecheck":
        typecheck();
        break;
      case "clean":
        clean();
        break;
      case "install":
        install();
        break;
      case "help":
      case "--help":
      case "-h":
        showHelp();
        break;
      default:
        console.error(`✗ Unknown command: ${command}\n`);
        showHelp();
        process.exit(1);
    }
  } catch (error) {
    console.error(`\n✗ Error: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  void main();
}
