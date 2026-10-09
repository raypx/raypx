/**
 * Worker manager for task execution and lifecycle management
 */

import { EventEmitter } from "node:events";
import { createLogger } from "@raypx/logger";
import type { Task, TaskProgress } from "./task.js";

const logger = createLogger({ name: "worker-manager" });

/**
 * Task status
 */
export type TaskStatus = "pending" | "running" | "complete" | "error" | "cancelled";

/**
 * Running task info
 */
export interface RunningTask {
  id: string;
  name: string;
  status: TaskStatus;
  startedAt: Date;
  progress?: TaskProgress;
}

/**
 * Worker manager for managing multiple tasks
 */
export class WorkerManager extends EventEmitter {
  private tasks: Map<string, Task> = new Map();
  private running: Map<string, RunningTask> = new Map();
  private executions: Map<string, Task> = new Map();

  /**
   * Register a task
   */
  register<TOptions, TResult>(task: Task<TOptions, TResult>) {
    if (this.tasks.has(task.name)) {
      throw new Error(`Task ${task.name} already registered`);
    }

    logger.info("Registering task", { task: task.name });
    // Registration erases the options type at the dynamic task-name boundary.
    this.tasks.set(task.name, task as Task);
  }

  /**
   * Execute a task
   */
  async execute<TResult = unknown>(taskName: string, options?: unknown): Promise<TResult> {
    const definition = this.tasks.get(taskName);
    if (!definition) {
      throw new Error(`Task ${taskName} not found`);
    }
    const task = definition.createExecution();

    const id = crypto.randomUUID();
    const runningTask: RunningTask = {
      id,
      name: taskName,
      status: "running",
      startedAt: new Date(),
    };

    this.running.set(id, runningTask);
    this.executions.set(id, task);
    this.emit("task:start", runningTask);

    // Listen to task events
    const onProgress = (data: TaskProgress) => {
      if (runningTask.status !== "running") return;
      runningTask.progress = data;
      this.emit("task:progress", { ...runningTask, progress: data });
    };

    task.on("progress", onProgress);

    try {
      const result = await task.execute(options);
      if (runningTask.status === "running") {
        runningTask.status = "complete";
        this.emit("task:complete", { ...runningTask, result });
      }
      return result as TResult;
    } catch (error) {
      if (runningTask.status === "running") {
        runningTask.status = "error";
        this.emit("task:error", { ...runningTask, error });
      }
      throw error;
    } finally {
      task.off("progress", onProgress);
      this.running.delete(id);
      this.executions.delete(id);
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
    if (runningTask.status === "cancelled") return;

    runningTask.status = "cancelled";
    try {
      await this.executions.get(id)?.cancel();
    } finally {
      this.running.delete(id);
      this.emit("task:cancel", runningTask);
    }
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
    return Array.from(this.tasks.values()).map((task) => ({
      name: task.name,
      description: task.description,
    }));
  }

  /**
   * Cancel all running tasks
   */
  async cancelAll() {
    logger.info("Cancelling all tasks");

    const promises = Array.from(this.running.keys()).map((id) => this.cancel(id));
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
