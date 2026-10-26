import type {
  TaskContextSelection,
  TaskContextSnapshot,
  TaskContextTarget,
} from "@raypx/core/tasks";
import type {
  ContextArchiveInput,
  ContextDeleteInput,
  ContextDeleteResult,
  ContextCreateInput,
  ContextDocument,
  ContextDocumentSummary,
  ContextHistoryInput,
  ContextRestoreInput,
  ContextUpdateInput,
  ContextVersion,
} from "../model.js";
export interface MemoryReadOptions {
  signal?: AbortSignal | undefined;
}
/** Browser views receive use cases; transports and authentication stay in apps. */
export interface MemoryClientPort {
  list(input?: {}, options?: MemoryReadOptions): Promise<ContextDocumentSummary[]>;
  get(input: { id: string }, options?: MemoryReadOptions): Promise<ContextDocument>;
  create(input: ContextCreateInput, options?: MemoryReadOptions): Promise<ContextDocument>;
  update(input: ContextUpdateInput, options?: MemoryReadOptions): Promise<ContextDocument>;
  archive(input: ContextArchiveInput, options?: MemoryReadOptions): Promise<ContextDocument>;
  delete(input: ContextDeleteInput, options?: MemoryReadOptions): Promise<ContextDeleteResult>;
  history(input: ContextHistoryInput, options?: MemoryReadOptions): Promise<ContextVersion[]>;
  restore(input: ContextRestoreInput, options?: MemoryReadOptions): Promise<ContextDocument>;
  resolve(
    input: { selection: TaskContextSelection; target: TaskContextTarget; prompt?: string },
    options?: MemoryReadOptions,
  ): Promise<TaskContextSnapshot>;
}
export interface MemoryProjectsPort {
  list(options?: MemoryReadOptions): Promise<(TaskContextTarget & { name: string })[]>;
}
export interface MemoryUsagePort {
  scheduledPlans(
    input: { id: string },
    options?: MemoryReadOptions,
  ): Promise<{ id: string; name: string; enabled: boolean }[]>;
}
