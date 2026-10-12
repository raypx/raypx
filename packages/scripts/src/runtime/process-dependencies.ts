import type { ProcessEnvironment } from "./env.js";
import type { ScriptsLog } from "./logger.js";

export interface RepositoryCommandOptions {
  captureOutput?: boolean;
  cwd: string;
  env: NodeJS.ProcessEnv;
}

export interface RepositoryProcessDependencies {
  log: ScriptsLog;
  processEnv: ProcessEnvironment;
  repositoryRoot: string;
  runCommand(command: readonly string[], options: RepositoryCommandOptions): Promise<void>;
}

/** Run maintenance steps sequentially and log completion only after every step succeeds. */
export async function runRepositoryCommands(
  dependencies: RepositoryProcessDependencies,
  event: string,
  commands: readonly (readonly string[])[],
  data?: Record<string, unknown>,
) {
  const log = (phase: string) =>
    dependencies.log("info", `${event}.${phase}`, ...(data ? [data] : []));
  log("started");
  for (const command of commands)
    await dependencies.runCommand(command, {
      cwd: dependencies.repositoryRoot,
      env: dependencies.processEnv,
    });
  log("completed");
}
