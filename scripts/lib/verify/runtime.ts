import { performance } from "node:perf_hooks";
import { scriptLogger } from "../logger.ts";
import { run } from "../process.ts";
import { runConsumers } from "../consumer/run.ts";
import type { VerifyDependencies } from "./run.ts";

/** Use a stable environment snapshot for repository gates; consumers retain their isolated env. */
export function createVerifyDependencies(
  repositoryRoot: string,
  environment: NodeJS.ProcessEnv,
): VerifyDependencies {
  return {
    repositoryRoot,
    environment: { ...environment, NODE_ENV: environment.NODE_ENV },
    runCommand: run,
    runConsumers: (options) => runConsumers("all", options),
    now: () => performance.now(),
    log: (message) => scriptLogger.log(message),
    output(chunk, stream) {
      if (stream === "stderr") process.stderr.write(chunk);
      else process.stdout.write(chunk);
    },
  };
}
