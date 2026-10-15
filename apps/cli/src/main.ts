#!/usr/bin/env bun
import manifest from "../package.json";
import { runCommand } from "./commands";
import { errorPayload } from "./runtime/errors";
import { serveStdio } from "./transport/stdio";

const args = process.argv.slice(2);
const options: { dataDir?: string; profile?: string } = {};
for (const [flag, key] of [
  ["--data-dir", "dataDir"],
  ["--profile", "profile"],
] as const) {
  const index = args.indexOf(flag);
  if (index >= 0) {
    const value = args[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value`);
    options[key] = value;
    args.splice(index, 2);
  }
}
try {
  if (args[0] === "--version") console.log(manifest.version);
  else if (args[0] === "stdio") await serveStdio(options);
  else await runCommand(args, options);
} catch (error) {
  console.error(JSON.stringify(errorPayload(error)));
  process.exitCode = 1;
}
