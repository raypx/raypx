import { logger } from "@raypx/shared/logger";
import type { Options } from "execa";
import { Listr, type ListrTask, PRESET_TIMER } from "listr2";
import type { Simplify } from "type-fest";
import { safeExecAsync } from "../utils";

/**
 * Creates a ListrTask - supports both task functions and shell commands
 *
 * @example
 * createTask("Custom Task", async (_, task) => { console.log("done"); })
 * createTask("pnpm build", { title: "Building" })
 * createTask("pnpm test", "Running tests")
 */
type TaskConfig = Simplify<{
  title: string;
  successTitle?: string;
  failureMessage?: string;
  options?: Options;
  retries?: number; // 0-2, simple retry
}>;

export function createTask(
  titleOrCommand: string,
  taskFnOrOpts?: ListrTask["task"] | TaskConfig | string,
): ListrTask {
  if (typeof taskFnOrOpts === "function") {
    return {
      title: titleOrCommand,
      task: taskFnOrOpts,
    };
  }

  const command = titleOrCommand;
  const config = typeof taskFnOrOpts === "string" ? { title: taskFnOrOpts } : taskFnOrOpts;
  const { title = command, successTitle, failureMessage, options, retries = 0 } = config ?? {};

  const autoSuccessTitle = successTitle || `${title} completed`;
  const autoFailureMessage = failureMessage || `${title} failed`;

  return {
    title,
    task: async (_ctx, task) => {
      let attempts = 0;
      const maxAttempts = retries + 1;

      while (attempts < maxAttempts) {
        try {
          const result = await safeExecAsync(command, options);

          if (result.success) {
            task.title = autoSuccessTitle;
            if (result.output) {
              logger.debug(`Command output: ${result.output}`);
            }
            return;
          }

          throw result.error || new Error(`Command execution failed: ${command}`);
        } catch (error) {
          attempts++;
          const errorMessage = error instanceof Error ? error.message : "Unknown error";

          if (attempts < maxAttempts) {
            task.title = `${title} (retry ${attempts}/${retries})`;
            // Reduce retry delay for better responsiveness
            await new Promise((resolve) => setTimeout(resolve, Math.min(500 * attempts, 2000)));
            continue;
          }

          logger.error(`Task failed: ${command}`, error);
          throw new Error(`${autoFailureMessage}: ${errorMessage}`);
        }
      }
    },
  };
}

/**
 * Run multiple tasks with listr2
 * Commands can choose to use this for complex task orchestration
 *
 * @param tasks - Array of ListrTask objects
 * @param concurrent - Run tasks in parallel (default: false for safety)
 */
export async function runTasks(tasks: ListrTask[], concurrent = false): Promise<void> {
  const listr = new Listr(tasks, {
    concurrent,
    exitOnError: true,
    renderer: process.env.CI ? "verbose" : "default",
    rendererOptions: {
      timer: PRESET_TIMER,
      clearOutput: false,
      removeEmptyLines: true,
    },
  });

  await listr.run();
}

/**
 * Simplified command definition type
 * Commands decide themselves whether to use listr2 or not
 */
export type Command = {
  cmd: string;
  description?: string;
  help?: string;
  examples?: string[];
  run: (args?: string[]) => Promise<void>;
};

/**
 * Define a command with simplified API
 * No more type discrimination - just a simple command object
 */
export function defineCommand(opts: Command): Command {
  return opts;
}

/**
 * Legacy type alias for backward compatibility
 * @deprecated Use Command instead
 */
export type DefinedCmd = Command;
