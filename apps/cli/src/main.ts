#!/usr/bin/env bun
import manifest from "../package.json";
import { runCommand } from "./commands";
import { errorPayload } from "./runtime/errors";
import { serveStdio } from "./transport/stdio";
import { diagnosticCode, recordDiagnostic, type RecordDiagnostic } from "./diagnostics";
import { createCliLogging } from "./logging";

const args = process.argv.slice(2);
const logging = await createCliLogging();
const startedAt = performance.now();
const options: { dataDir?: string; profile?: string; recordDiagnostic: RecordDiagnostic } = {
  recordDiagnostic: logging.record,
};
let mode: "command" | "stdio" | "version" = "command";
let code: string | undefined;
try {
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
  mode = args[0] === "stdio" ? "stdio" : args[0] === "--version" ? "version" : "command";
  if (args[0] === "--version") console.log(manifest.version);
  else if (args[0] === "stdio") await serveStdio(options);
  else await runCommand(args, options);
} catch (error) {
  code = diagnosticCode(error);
  console.error(JSON.stringify(errorPayload(error)));
  process.exitCode = 1;
} finally {
  recordDiagnostic(logging.record, {
    operation: "cli.completed",
    mode,
    outcome: code ? "failed" : "success",
    elapsedMs: Math.max(0, Math.round(performance.now() - startedAt)),
    ...(code ? { code } : {}),
  });
  try {
    await logging.close();
  } catch {
    // A broken diagnostic sink must not replace the command's result or exit code.
    console.error(
      JSON.stringify({ operation: "logger.close_failed", code: "LOGGER_DRAIN_FAILED" }),
    );
  }
}
