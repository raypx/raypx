/**
 * Worker task definition and execution system
 *
 * Provides a unified way to define and run background tasks
 * that can be called from CLI, desktop apps, or web workers
 */

import { EventEmitter } from "node:events";
import { createLogger } from "@raypx/logger";

const logger = createLogger({ name: "worker" });

/** Structured progress emitted by a task. Additional fields remain explicitly unknown. */
export interface TaskProgress {
  status?: string;
  percent?: number;
  [key: string]: unknown;
}

/** Raised when a cancelled execution settles, instead of reporting completion. */
export class TaskCancelledError extends Error {
  constructor(taskName: string) {
    super(`Task ${taskName} was cancelled`);
    this.name = "TaskCancelledError";
  }
}

/**
 * Task execution context
 */
export interface TaskContext {
  /**
   * Emit progress updates
   */
  emit(event: string, data: TaskProgress): void;

  /**
   * Log messages
   */
  log(message: string, data?: Record<string, unknown>): void;

  /**
   * Cancel token to check if task should stop
   */
  isCancelled(): boolean;
}

/**
 * Task definition options
 */
export interface TaskDefinition<TOptions = unknown, TResult = unknown> {
  /**
   * Task name (unique identifier)
   */
  name: string;

  /**
   * Task description
   */
  description?: string;

  /**
   * Task execution function
   */
  execute: (this: TaskContext, options: TOptions) => Promise<TResult>;

  /**
   * Cleanup function (called once when execution settles or is cancelled)
   */
  cleanup?: (this: void) => Promise<void>;
}

/**
 * Task instance
 */
export class Task<TOptions = unknown, TResult = unknown> extends EventEmitter {
  public readonly name: string;
  public readonly description?: string;
  private executeFn: TaskDefinition<TOptions, TResult>["execute"];
  private cleanupFn?: TaskDefinition<TOptions, TResult>["cleanup"];
  private cancelled = false;
  private executing = false;
  private cleanupPromise?: Promise<void>;

  constructor(definition: TaskDefinition<TOptions, TResult>) {
    super();
    this.name = definition.name;
    this.description = definition.description;
    this.executeFn = definition.execute;
    this.cleanupFn = definition.cleanup;
  }

  /**
   * Execute the task
   */
  async execute(options: TOptions): Promise<TResult> {
    if (this.executing) throw new Error(`Task ${this.name} is already running`);
    this.executing = true;
    this.cancelled = false;
    this.cleanupPromise = undefined;
    logger.info("Starting task", { task: this.name, options });
    this.emit("start", { task: this.name, options });

    const context: TaskContext = {
      emit: (event, data) => {
        this.emit(event, data);
      },
      log: (message, data) => {
        logger.debug(message, { task: this.name, ...data });
      },
      isCancelled: () => this.cancelled,
    };

    try {
      const result = await this.executeFn.call(context, options);
      await this.cleanupOnce();
      if (this.cancelled) throw new TaskCancelledError(this.name);

      logger.info("Task completed", { task: this.name });
      this.emit("complete", { task: this.name, result });

      return result;
    } catch (error) {
      try {
        await this.cleanupOnce();
      } catch (cleanupError) {
        logger.error("Task cleanup failed", {
          task: this.name,
          error: cleanupError instanceof Error ? cleanupError.message : "Unknown cleanup error",
        });
      }
      if (!this.cancelled) {
        logger.error("Task failed", {
          task: this.name,
          error: error instanceof Error ? error.message : error,
        });
        if (this.listenerCount("error") > 0) {
          this.emit("error", { task: this.name, error });
        }
      }

      throw error;
    } finally {
      this.executing = false;
    }
  }

  /**
   * Cancel the task
   */
  async cancel() {
    if (!this.executing) return;
    if (this.cancelled) return this.cleanupOnce();
    logger.info("Cancelling task", { task: this.name });
    this.cancelled = true;
    this.emit("cancel", { task: this.name });

    await this.cleanupOnce();
  }

  /** Creates an execution with its own cancellation and cleanup state. */
  createExecution(): Task<TOptions, TResult> {
    return new Task({
      name: this.name,
      description: this.description,
      execute: this.executeFn,
      cleanup: this.cleanupFn,
    });
  }

  private cleanupOnce(): Promise<void> {
    this.cleanupPromise ??= Promise.resolve().then(() => this.cleanupFn?.());
    return this.cleanupPromise;
  }
}

/**
 * Define a new task
 *
 * @example
 * ```typescript
 * const buildTask = defineTask({
 *   name: 'build',
 *   description: 'Build the application',
 *   async execute(options: { production: boolean }) {
 *     this.emit('progress', { status: 'compiling', percent: 0 });
 *
 *     // Build logic...
 *
 *     this.emit('progress', { status: 'complete', percent: 100 });
 *
 *     return { success: true };
 *   },
 * });
 * ```
 */
export function defineTask<TOptions = unknown, TResult = unknown>(
  definition: TaskDefinition<TOptions, TResult>,
): Task<TOptions, TResult> {
  return new Task(definition);
}
