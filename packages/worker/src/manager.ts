/**
 * Worker manager for task execution and lifecycle management
 */

import { EventEmitter } from 'node:events';
import { createLogger } from '@raypx/logger';
import type { Task } from './task';

const logger = createLogger({ name: 'worker-manager' });

/**
 * Task status
 */
export type TaskStatus = 'pending' | 'running' | 'complete' | 'error' | 'cancelled';

/**
 * Running task info
 */
export interface RunningTask {
  id: string;
  name: string;
  status: TaskStatus;
  startedAt: Date;
  progress?: any;
}

/**
 * Worker manager for managing multiple tasks
 */
export class WorkerManager extends EventEmitter {
  private tasks: Map<string, Task> = new Map();
  private running: Map<string, RunningTask> = new Map();

  /**
   * Register a task
   */
  register(task: Task) {
    if (this.tasks.has(task.name)) {
      throw new Error(`Task ${task.name} already registered`);
    }

    logger.info('Registering task', { task: task.name });
    this.tasks.set(task.name, task);
  }

  /**
   * Execute a task
   */
  async execute<TResult = any>(
    taskName: string,
    options?: any
  ): Promise<TResult> {
    const task = this.tasks.get(taskName);
    if (!task) {
      throw new Error(`Task ${taskName} not found`);
    }

    const id = crypto.randomUUID();
    const runningTask: RunningTask = {
      id,
      name: taskName,
      status: 'running',
      startedAt: new Date(),
    };

    this.running.set(id, runningTask);
    this.emit('task:start', runningTask);

    // Listen to task events
    const onProgress = (data: any) => {
      runningTask.progress = data;
      this.emit('task:progress', { ...runningTask, progress: data });
    };

    const onComplete = (data: any) => {
      runningTask.status = 'complete';
      this.running.delete(id);
      this.emit('task:complete', { ...runningTask, result: data.result });
    };

    const onError = (data: any) => {
      runningTask.status = 'error';
      this.running.delete(id);
      this.emit('task:error', { ...runningTask, error: data.error });
    };

    task.on('progress', onProgress);
    task.on('complete', onComplete);
    task.on('error', onError);

    try {
      const result = await task.execute(options);
      return result;
    } finally {
      task.off('progress', onProgress);
      task.off('complete', onComplete);
      task.off('error', onError);
    }
  }

  /**
   * Cancel a running task
   */
  async cancel(id: string) {
    const runningTask = this.running.get(id);
    if (!runningTask) {
      throw new Error(`Running task ${id} not found`);
    }

    const task = this.tasks.get(runningTask.name);
    if (task) {
      await task.cancel();
    }

    runningTask.status = 'cancelled';
    this.running.delete(id);
    this.emit('task:cancel', runningTask);
  }

  /**
   * Get status of all running tasks
   */
  getStatus(): RunningTask[] {
    return Array.from(this.running.values());
  }

  /**
   * Get list of available tasks
   */
  getAvailableTasks(): Array<{ name: string; description?: string }> {
    return Array.from(this.tasks.values()).map(task => ({
      name: task.name,
      description: task.description,
    }));
  }

  /**
   * Cancel all running tasks
   */
  async cancelAll() {
    logger.info('Cancelling all tasks');

    const promises = Array.from(this.running.keys()).map(id => this.cancel(id));
    await Promise.all(promises);
  }
}

/**
 * Global worker manager instance
 */
let globalManager: WorkerManager | null = null;

/**
 * Get or create the global worker manager
 */
export function getWorkerManager(): WorkerManager {
  if (!globalManager) {
    globalManager = new WorkerManager();
  }
  return globalManager;
}
