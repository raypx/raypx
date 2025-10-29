import { logger } from "@raypx/shared/logger";
import type { Options } from "execa";
import type { Simplify } from "type-fest";
import { formatDuration, safeExecAsync } from "../utils";

/**
 * Task function type - receives a context object with helper methods
 */
type TaskFn = (ctx: TaskContext) => void | Promise<void>;

/**
 * Context object passed to task functions
 */
interface TaskContext {
  /** Current task title (can be updated during execution) */
  title: string;
}

/**
 * Task configuration for shell commands
 */
type TaskConfig = Simplify<{
  title: string;
  successTitle?: string;
  failureMessage?: string;
  options?: Options;
  retries?: number; // 0-2, simple retry
}>;

/**
 * Internal task representation
 */
export interface Task {
  title: string;
  task: TaskFn;
}

/**
 * Creates a Task - supports both task functions and shell commands
 *
 * @example
 * createTask("Custom Task", async () => { console.log("done"); })
 * createTask("pnpm build", { title: "Building" })
 * createTask("pnpm test", "Running tests")
 */
export function createTask(
  titleOrCommand: string,
  taskFnOrOpts?: TaskFn | TaskConfig | string,
): Task {
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
    task: async (ctx) => {
      let attempts = 0;
      const maxAttempts = retries + 1;

      while (attempts < maxAttempts) {
        try {
          const result = await safeExecAsync(command, options);

          if (result.success) {
            ctx.title = autoSuccessTitle;
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
            ctx.title = `${title} (retry ${attempts}/${retries})`;
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

export type RunTasksOptions = {
  tasks: (Task | undefined | null | false)[];
  concurrent?: boolean;
};

/**
 * Run multiple tasks sequentially or concurrently
 *
 * @param tasks - Array of Task objects
 * @param concurrent - Run tasks in parallel (default: false for safety)
 */
export async function runTasks(_opts: RunTasksOptions | RunTasksOptions["tasks"]): Promise<void> {
  const opts = Array.isArray(_opts) ? { tasks: _opts } : _opts;
  const { concurrent = false } = opts;
  const startTime = Date.now();
  const tasks = opts.tasks.filter(Boolean) as Task[];

  if (concurrent) {
    // Run all tasks in parallel
    await Promise.all(
      tasks.map(async (task) => {
        const taskStart = Date.now();
        logger.info(`⏳ ${task.title}...`);

        try {
          const ctx: TaskContext = { title: task.title };
          await task.task(ctx);
          const duration = Date.now() - taskStart;
          logger.success(`✓ ${ctx.title} (${formatDuration(duration)})`);
        } catch (error) {
          const duration = Date.now() - taskStart;
          logger.error(`✗ ${task.title} failed (${formatDuration(duration)})`);
          throw error;
        }
      }),
    );
  } else {
    // Run tasks sequentially
    for (const task of tasks) {
      const taskStart = Date.now();
      logger.info(`⏳ ${task.title}...`);

      try {
        const ctx: TaskContext = { title: task.title };
        await task.task(ctx);
        const duration = Date.now() - taskStart;
        logger.success(`✓ ${ctx.title} (${formatDuration(duration)})`);
      } catch (error) {
        const duration = Date.now() - taskStart;
        logger.error(`✗ ${task.title} failed (${formatDuration(duration)})`);
        throw error;
      }
    }
  }

  const totalDuration = Date.now() - startTime;
  logger.success(`\n🎉 All tasks completed in ${formatDuration(totalDuration)}`);
}

/**
 * Simplified command definition type
 * Commands can use runTasks for task orchestration or execute directly
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
