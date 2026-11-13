import type {
  TaskContextSelection,
  TaskContextSnapshot,
  TaskContextTarget,
} from "@raypx/core/tasks";
import type {
  ContextDocument,
  ContextDocumentSummary,
  ContextHistoryInput,
  ContextVersion,
} from "@raypx/core/memory";
export interface MemoryReadOptions {
  signal?: AbortSignal | undefined;
}
/** Browser views receive use cases; transports and authentication stay in apps. */
export interface MemoryClientPort {
  list(input?: {}, options?: MemoryReadOptions): Promise<ContextDocumentSummary[]>;
  get(input: { id: string }, options?: MemoryReadOptions): Promise<ContextDocument>;
  history(input: ContextHistoryInput, options?: MemoryReadOptions): Promise<ContextVersion[]>;
  resolve(
    input: { selection: TaskContextSelection; target: TaskContextTarget; prompt?: string },
    options?: MemoryReadOptions,
  ): Promise<TaskContextSnapshot>;
}
