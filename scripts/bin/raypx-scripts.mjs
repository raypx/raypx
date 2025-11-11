#!/usr/bin/env -S node --no-warnings=ExperimentalWarning

import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url);

// Import the main CLI handler
const cli = await jiti.import("../cli.ts", { default: true });

// Parse command line arguments
const args = process.argv.slice(2);

// Execute the CLI with error handling
try {
  cli(args);
} catch (error) {
  process.exit(error.status || 1);
}
