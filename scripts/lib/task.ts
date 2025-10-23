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

type CmdOptions = Simplify<{
  concurrent?: boolean | number;
  exitOnError?: boolean;
  renderer?: string;
}>;

export type TaskCommand = {
  tasks: ListrTask[] | ((args?: string[]) => ListrTask[]);
  options?: CmdOptions;
  description?: string;
  cmd: string;
  help?: string;
  examples?: string[];
  type: "task";
};

export type RunCommand = {
  options?: CmdOptions;
  run: (args?: string[]) => Promise<void>;
  description?: string;
  cmd: string;
  help?: string;
  examples?: string[];
  type: "run";
};

export type DefinedCmd = {
  cmd: string;
  run: (args?: string[]) => Promise<void>;
  description?: string;
  help?: string;
  examples?: string[];
};

/**
 * Creates a Cmd object with tasks and options
 * Supports both task arrays and functions that return task arrays
 * Can automatically parse command line arguments and pass them to tasks
 */
export function definedCmd(opts: TaskCommand | RunCommand): DefinedCmd {
  // Handle RunCommand - simple pass-through
  if (opts.type === "run") {
    return {
      cmd: opts.cmd,
      run: opts.run,
      description: opts.description,
      help: opts.help,
      examples: opts.examples,
    };
  }

  // Handle TaskCommand
  const { tasks, options, description, help, examples } = opts;

  return {
    cmd: opts.cmd,
    help,
    examples,
    run: async (args?: string[]) => {
      // Get task list - either static array or from function
      const taskList = typeof tasks === "function" ? tasks(args) : tasks;

      // Create and run Listr
      const listr = new Listr(taskList, {
        concurrent: options?.concurrent ?? true,
        exitOnError: options?.exitOnError ?? true,
        renderer: process.env.CI ? "verbose" : "default",
        rendererOptions: {
          timer: PRESET_TIMER,
          clearOutput: false,
          removeEmptyLines: true,
        },
      });

      await listr.run();
    },
    description,
  };
}
