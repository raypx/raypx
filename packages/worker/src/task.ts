/**
 * Worker task definition and execution system
 *
 * Provides a unified way to define and run background tasks
 * that can be called from CLI, desktop apps, or web workers
 */

import { EventEmitter } from 'node:events';
import { createLogger } from '@raypx/logger';

const logger = createLogger({ name: 'worker' });

/**
 * Task execution context
 */
export interface TaskContext {
  /**
   * Emit progress updates
   */
  emit(event: string, data: any): void;

  /**
   * Log messages
   */
  log(message: string, data?: any): void;

  /**
   * Cancel token to check if task should stop
   */
  isCancelled(): boolean;
}

/**
 * Task definition options
 */
export interface TaskDefinition<TOptions = any, TResult = any> {
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
  execute(this: TaskContext, options: TOptions): Promise<TResult>;

  /**
   * Cleanup function (called on cancel/error)
   */
  cleanup?(): Promise<void>;
}

/**
 * Task instance
 */
export class Task<TOptions = any, TResult = any> extends EventEmitter {
  public readonly name: string;
  public readonly description?: string;
  private executeFn: TaskDefinition<TOptions, TResult>['execute'];
  private cleanupFn?: TaskDefinition<TOptions, TResult>['cleanup'];
  private cancelled = false;

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
    logger.info('Starting task', { task: this.name, options });
    this.emit('start', { task: this.name, options });

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

      logger.info('Task completed', { task: this.name });
      this.emit('complete', { task: this.name, result });

      return result;
    } catch (error) {
      logger.error('Task failed', {
        task: this.name,
        error: error instanceof Error ? error.message : error
      });
      this.emit('error', { task: this.name, error });

      throw error;
    } finally {
      if (this.cleanupFn) {
        await this.cleanupFn();
      }
    }
  }

  /**
   * Cancel the task
   */
  async cancel() {
    logger.info('Cancelling task', { task: this.name });
    this.cancelled = true;
    this.emit('cancel', { task: this.name });

    if (this.cleanupFn) {
      await this.cleanupFn();
    }
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
export function defineTask<TOptions = any, TResult = any>(
  definition: TaskDefinition<TOptions, TResult>
): Task<TOptions, TResult> {
  return new Task(definition);
}

// Re-export types
export type { TaskDefinition, TaskContext };
