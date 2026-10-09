/**
 * @raypx/worker - Unified worker system
 *
 * Provides task execution, management, and IPC communication
 * for CLI and desktop applications
 */

export { defineTask, Task, TaskCancelledError } from "./task.js";
export type { TaskDefinition, TaskContext, TaskProgress } from "./task.js";

export { WorkerManager, getWorkerManager } from "./manager.js";
export type { TaskStatus, RunningTask } from "./manager.js";

export type {
  WorkerMessage,
  ExecuteMessage,
  CancelMessage,
  StatusMessage,
  ListMessage,
  ProgressMessage,
  CompleteMessage,
  ErrorMessage,
  TaskStatusResponse,
  AvailableTasksResponse,
} from "./protocol.js";
