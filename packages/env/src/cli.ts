#!/usr/bin/env bun

import { parseServerEnv, ServerEnvironmentError } from "./server.js";

try {
  parseServerEnv(process.env);
  console.log("Runtime environment is valid.");
} catch (error) {
  console.error(
    error instanceof ServerEnvironmentError
      ? error.message
      : "Runtime environment could not be validated.",
  );
  process.exitCode = 1;
}
