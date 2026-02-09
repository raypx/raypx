#!/usr/bin/env node

import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import dotenvx from "@dotenvx/dotenvx";
import { x } from "tinyexec";

// Get project root directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = resolve(__dirname, "../../");

// Load environment variables from project root .env file
dotenvx.config({ path: join(PROJECT_ROOT, ".env"), quiet: true });

// Parse command line arguments
const args = process.argv.slice(2);

if (!args.length) {
  console.error("Error: No command provided. Usage: rr <command> [args...]");
  process.exit(1);
}

const [command, ...rest] = args;

if (!command) {
  console.error("Error: No command provided. Usage: rr <command> [args...]");
  process.exit(1);
}

// Execute the command with inherited environment variables
try {
  const result = await x(command, rest, {
    nodeOptions: {
      cwd: process.cwd(),
      env: {
        ...process.env,
        CLI_START_TIME: Date.now().toString(),
      },
      stdio: "inherit",
      shell: true,
    },
    throwOnError: true, // Throw error on non-zero exit code to stop execution
  });

  // Check exit code and throw error if command failed
  if (result.exitCode !== 0) {
    const errorMessage =
      result.stderr || result.stdout || `Command exited with code ${result.exitCode}`;
    throw new Error(`Command failed: ${command} ${rest.join(" ")}\n${errorMessage}`);
  }
} catch (error) {
  const errorMessage = error?.message || error?.toString() || "Unknown error";
  console.error(`Error: ${errorMessage}`);
  const exitCode = error?.status || error?.code || 1;
  process.exit(exitCode);
}
