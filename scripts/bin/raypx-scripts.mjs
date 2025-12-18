#!/usr/bin/env node

import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url);

// Parse command line arguments
const args = process.argv.slice(2);

// Execute the CLI with error handling
try {
  const cli = await jiti.import("../cli", { default: true });
  await cli(args);
} catch (error) {
  // Handle errors with proper exit codes
  const exitCode = error?.status || error?.code || 1;
  process.exit(exitCode);
}
