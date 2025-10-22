#!/usr/bin/env node

/**
 * raypx-scripts CLI entry point
 *
 * This executable script provides a command-line interface for running
 * various development and build scripts in the raypx monorepo.
 *
 * Usage: raypx-scripts <script-name> [args...]
 *
 * Examples:
 *   raypx-scripts clean
 *   raypx-scripts format
 *   raypx-scripts setup
 */

// import "tsx";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url);

// Import the main CLI handler
const cli = await jiti.import("../cli.ts", { default: true });

// Parse command line arguments
const [name, ...args] = process.argv.slice(2);

// Execute the CLI with error handling
try {
  cli(name, args);
} catch (error) {
  process.exit(error.status || 1);
}
