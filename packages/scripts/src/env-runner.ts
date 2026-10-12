import type { StdioOptions } from "node:child_process";

import { resolveProcessEnvironment, type ResolveProcessEnvironmentOptions } from "./runtime/env.js";
import { runChildProcess, type ProcessResult } from "./runtime/process.js";

export interface RunWithRepositoryEnvOptions extends ResolveProcessEnvironmentOptions {
  cwd?: string;
  stdio?: StdioOptions;
}

export async function runWithRepositoryEnv(
  command: readonly string[],
  options: RunWithRepositoryEnvOptions = {},
): Promise<ProcessResult> {
  if (command.length === 0) throw new Error("Missing command. Use: vmx env -- <command>");

  return await runChildProcess(command, {
    cwd: options.cwd ?? process.cwd(),
    env: resolveProcessEnvironment("repository", options),
    stdio: options.stdio ?? "inherit",
  });
}
