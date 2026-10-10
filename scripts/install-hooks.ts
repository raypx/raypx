#!/usr/bin/env bun

import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

/** Enables the repository's Vite+ hook dispatcher without installing extra tooling. */
execFileSync(
  fileURLToPath(new URL("../node_modules/.bin/vp", import.meta.url)),
  ["hooks", "enable", "--hooks-dir", ".vite-hooks"],
  { cwd: fileURLToPath(new URL("../", import.meta.url)), stdio: "inherit" },
);
