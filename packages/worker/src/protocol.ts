/**
 * IPC protocol for worker communication
 *
 * Used for CLI <-> Desktop communication
 */

/**
 * Message types
 */
export type MessageType =
  | 'execute'
  | 'cancel'
  | 'status'
  | 'list'
  | 'progress'
  | 'complete'
  | 'error';

/**
 * Base message
 */
export interface BaseMessage {
  id: string;
  type: MessageType;
}

/**
 * Execute task message
 */
export interface ExecuteMessage extends BaseMessage {
  type: 'execute';
  task: string;
  options?: any;
}

/**
 * Cancel task message
 */
export interface CancelMessage extends BaseMessage {
  type: 'cancel';
  taskId: string;
}

/**
 * Status request message
 */
export interface StatusMessage extends BaseMessage {
  type: 'status';
}

/**
 * List tasks message
 */
export interface ListMessage extends BaseMessage {
  type: 'list';
}

/**
 * Progress update message
 */
export interface ProgressMessage extends BaseMessage {
  type: 'progress';
  taskId: string;
  data: any;
}

/**
 * Task complete message
 */
export interface CompleteMessage extends BaseMessage {
  type: 'complete';
  taskId: string;
  result: any;
}

/**
 * Task error message
 */
export interface ErrorMessage extends BaseMessage {
  type: 'error';
  taskId: string;
  error: string;
}

/**
 * Union of all message types
 */
export type WorkerMessage =
  | ExecuteMessage
  | CancelMessage
  | StatusMessage
  | ListMessage
  | ProgressMessage
  | CompleteMessage
  | ErrorMessage;

/**
 * Task status response
 */
export interface TaskStatusResponse {
  tasks: Array<{
    id: string;
    name: string;
    status: string;
    startedAt: string;
    progress?: any;
  }>;
}

/**
 * Available tasks response
 */
export interface AvailableTasksResponse {
  tasks: Array<{
    name: string;
    description?: string;
  }>;
}
