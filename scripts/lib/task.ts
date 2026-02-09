import type { Simplify } from "type-fest";
import { execCommand, formatDuration } from "../utils";
import type { ExecOptions } from "../utils/exec";
import { logger } from "../utils/logger";

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
  /** Display title for the task */
  title: string;
  /** Success message (defaults to "${title} completed") */
  successTitle?: string;
  /** Failure message (defaults to "${title} failed") */
  failureMessage?: string;
  /** Number of retry attempts (0-2, defaults to 0) */
  retries?: number;
  /** Execution options (timeout, env, etc.) */
  execOptions?: ExecOptions;
  /** Allow task to fail without stopping the entire process (defaults to false) */
  allowFailure?: boolean;
}>;

/**
 * Command specification types
 */
type CommandSpec =
  | string // Legacy: "bun run build"
  | [command: string, ...args: string[]]; // Recommended: ["bun", "run", "build"]

/**
 * Internal task representation
 */
export interface Task {
  title: string;
  task: TaskFn;
  /** Allow task to fail without stopping the entire process */
  allowFailure?: boolean;
}

/**
 * Creates a Task - supports task functions, command strings, and command arrays
 *
 * @param titleOrCommand - Task title (for functions) or command specification
 * @param taskFnOrOpts - Task function, config object, or simple title string
 */
export function createTask(
  titleOrCommand: string | CommandSpec,
  taskFnOrOpts?: TaskFn | TaskConfig | string,
): Task {
  // Case 1: Custom task function
  if (typeof taskFnOrOpts === "function") {
    return {
      title: titleOrCommand as string,
      task: taskFnOrOpts,
      allowFailure: false,
    };
  }

  // Case 2 & 3: Shell command execution
  const commandSpec = titleOrCommand as CommandSpec;
  const config = typeof taskFnOrOpts === "string" ? { title: taskFnOrOpts } : taskFnOrOpts;

  // Parse command specification
  let command: string;
  let args: string[];

  if (Array.isArray(commandSpec)) {
    // Command array: ["bun", "run", "build", "--watch"]
    const [cmd, ...rest] = commandSpec;
    if (!cmd) {
      throw new Error("Command array cannot be empty");
    }
    command = cmd;
    args = rest;
  } else {
    // Command string: "bun run build --watch" (backward compatible)
    const parts = commandSpec.trim().split(/\s+/);
    const [cmd, ...rest] = parts;
    if (!cmd) {
      throw new Error("Command string cannot be empty");
    }
    command = cmd;
    args = rest;
  }

  // Default title from command if not provided
  const commandDisplay = Array.isArray(commandSpec) ? commandSpec.join(" ") : commandSpec;

  const {
    title = commandDisplay,
    successTitle,
    failureMessage,
    retries = 0,
    execOptions,
    allowFailure = false,
  } = config ?? {};

  const autoSuccessTitle = successTitle || `${title} completed`;
  const autoFailureMessage = failureMessage || `${title} failed`;

  return {
    title,
    allowFailure,
    task: async (ctx) => {
      let attempts = 0;
      const maxAttempts = retries + 1;

      while (attempts < maxAttempts) {
        try {
          const result = await execCommand(command, args, execOptions);

          if (result.success) {
            ctx.title = autoSuccessTitle;
            if (result.output) {
              logger.debug(`Command output: ${result.output}`);
            }
            return;
          }

          throw result.error || new Error(`Command execution failed: ${commandDisplay}`);
        } catch (error) {
          attempts++;
          const errorMessage = error instanceof Error ? error.message : "Unknown error";

          if (attempts < maxAttempts) {
            ctx.title = `${title} (retry ${attempts}/${retries})`;
            // Exponential backoff: 500ms, 1s, 2s
            await new Promise((resolve) => setTimeout(resolve, Math.min(500 * attempts, 2000)));
            continue;
          }

          logger.error(`Task failed: ${commandDisplay}`, error);
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

          // If task allows failure, log warning and continue (don't throw)
          if (task.allowFailure) {
            logger.warn(`⚠ ${task.title} failed but continuing (allowFailure=true)`);
            return; // Continue without throwing
          }

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

        // If task allows failure, log warning and continue
        if (task.allowFailure) {
          logger.warn(`⚠ ${task.title} failed but continuing (allowFailure=true)`);
          continue;
        }

        throw error;
      }
    }
  }

  const totalDuration = Date.now() - startTime;
  logger.success(`🎉 All tasks completed in ${formatDuration(totalDuration)}`);
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
