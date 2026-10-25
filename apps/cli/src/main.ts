#!/usr/bin/env bun
import { runCommand } from "./commands";
import { parseCliArgs } from "./commands/args";
import { errorPayload } from "./runtime/errors";
import { diagnosticCode, recordDiagnostic, type RecordDiagnostic } from "./diagnostics";
import { createCliLogging } from "./logging";

const args = process.argv.slice(2);
const logging = await createCliLogging();
const startedAt = performance.now();
const options: { dataDir?: string; profile?: string; recordDiagnostic: RecordDiagnostic } = {
  recordDiagnostic: logging.record,
};
let mode: "command" | "stdio" | "version" | "tui" = "command";
let code: string | undefined;
try {
  const invocation = parseCliArgs(args);
  mode = invocation.version
    ? "version"
    : (invocation.positionals[0] === "stdio" ||
          (invocation.positionals[0] === "daemon" && invocation.positionals[1] === "proxy")) &&
        !invocation.help
      ? "stdio"
      : invocation.positionals[0] === "tui" && !invocation.help
        ? "tui"
        : "command";
  await runCommand(invocation, options);
} catch (error) {
  code = diagnosticCode(error);
  console.error(JSON.stringify(errorPayload(error)));
  process.exitCode = 1;
} finally {
  const exitCode = Number(process.exitCode ?? 0);
  const completionCode =
    code ?? (exitCode === 130 ? "INTERRUPTED" : exitCode === 143 ? "TERMINATED" : undefined);
  recordDiagnostic(logging.record, {
    operation: "cli.completed",
    mode,
    outcome: code || exitCode !== 0 ? "failed" : "success",
    elapsedMs: Math.max(0, Math.round(performance.now() - startedAt)),
    ...(completionCode ? { code: completionCode } : {}),
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
