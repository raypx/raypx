/**
 * @raypx/worker - Unified worker system
 *
 * Provides task execution, management, and IPC communication
 * for CLI and desktop applications
 */

export { defineTask, Task } from './task';
export type { TaskDefinition, TaskContext } from './task';

export { WorkerManager, getWorkerManager } from './manager';
export type { TaskStatus, RunningTask } from './manager';

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
} from './protocol';
