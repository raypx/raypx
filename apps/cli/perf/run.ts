import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runPerformance } from "@raypx/tooling/performance";
await runPerformance(
  resolve(import.meta.dirname, "../../.."),
  resolve(
    dirname(fileURLToPath(import.meta.resolve("@hona/strobe/package.json"))),
    "bin/strobe.js",
  ),
  "apps/cli/perf/commands.bench.ts",
  ["cli", ...process.argv.slice(2)],
);
