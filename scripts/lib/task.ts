import type { ExecSyncOptions } from "node:child_process";
import { logger } from "@raypx/shared/logger";
import { Listr, type ListrTask, PRESET_TIMER } from "listr2";
import type { Simplify } from "type-fest";
import { safeExec } from "../utils";

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
  options?: ExecSyncOptions;
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
          const success = safeExec(command, options);

          if (success) {
            task.title = autoSuccessTitle;
            return;
          }
          throw new Error(`Command execution failed: ${command}`);
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

export type Cmd = Simplify<{
  tasks: ListrTask[];
  options?: CmdOptions;
}>;

type TaskFunction = (args?: string[]) => ListrTask[];

export type TaskCommand = {
  tasks: ListrTask[] | ((args?: string[]) => ListrTask[]);
  options?: CmdOptions;
  type: "task";
};

export type RunCommand = {
  options?: CmdOptions;
  run: (args?: string[]) => Promise<void>;
  type: "run";
};

export type DefinedCmd = {
  run: () => Promise<void>;
};

/**
 * Creates a Cmd object with tasks and options
 * Supports both task arrays and functions that return task arrays
 * Can automatically parse command line arguments and pass them to tasks
 */
export function definedCmd(opts: TaskCommand | RunCommand): DefinedCmd {
  let run: () => Promise<void>;
  if (opts.type === "task") {
    let taskList: ListrTask[];

    if (typeof opts.tasks === "function") {
      // Parse command line arguments (skip node, script, command name)
      const args = process.argv.slice(3);

      // Check if function expects arguments by checking its length
      const taskFunction = opts.tasks as TaskFunction;
      taskList =
        taskFunction.length > 0 ? taskFunction(args) : (taskFunction as () => Cmd["tasks"])();
    } else {
      taskList = opts.tasks;
    }

    const listr = new Listr(taskList, {
      concurrent: opts.options?.concurrent ?? true,
      exitOnError: opts.options?.exitOnError ?? true,
      renderer: process.env.CI ? "verbose" : "default",
      rendererOptions: {
        timer: PRESET_TIMER,
        clearOutput: false,
        removeEmptyLines: true,
      },
    });

    run = async () => {
      await listr.run();
    };
  } else {
    run = async () => {
      await opts.run(process.argv.slice(3));
    };
  }

  return { run };
}
