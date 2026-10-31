import type {
  AgentEvent,
  AgentTask,
  HumanRequest,
  TaskActivity,
  TaskInput,
} from "@raypx/core/tasks";
import type { RelayRequest, SyncDevice, TaskChange } from "@raypx/contracts/tasks";
import type { ObservedProjection, TerminalRequest } from "@raypx/contracts/terminal";

export interface TaskReadOptions {
  signal?: AbortSignal | undefined;
}
export interface TaskHistoryPage {
  task: AgentTask;
  events: { cursor: number; event: AgentEvent }[];
  requests: HumanRequest[];
  activity: TaskActivity[];
  activityBefore?: number | undefined;
}
type CommandInput<M extends RelayRequest["method"]> = Extract<RelayRequest, { method: M }>["input"];

export interface TaskChangeSource {
  subscribe(listener: (change?: TaskChange) => void): () => void;
}

/** The view needs task use cases, not an HTTP client or a native transport. */
export interface TaskWorkspacePort extends TaskChangeSource {
  devices: {
    list(input?: {}, options?: TaskReadOptions): Promise<SyncDevice[]>;
  };
  tasks: {
    list(
      input?: { limit?: number | undefined; before?: string | undefined },
      options?: TaskReadOptions,
    ): Promise<AgentTask[]>;
    get(
      input: { id: string; after?: number | undefined; beforeActivity?: number | undefined },
      options?: TaskReadOptions,
    ): Promise<TaskHistoryPage>;
    create(input: CommandInput<"tasks.create">, options?: TaskReadOptions): Promise<AgentTask>;
    followUp(input: CommandInput<"tasks.followUp">, options?: TaskReadOptions): Promise<AgentTask>;
    cancel(input: CommandInput<"tasks.cancel">, options?: TaskReadOptions): Promise<AgentTask>;
    input(input: CommandInput<"tasks.input">, options?: TaskReadOptions): Promise<TaskInput>;
  };
  approvals: {
    list(input?: {}, options?: TaskReadOptions): Promise<HumanRequest[]>;
    decide(
      input: CommandInput<"approvals.decide">,
      options?: TaskReadOptions,
    ): Promise<HumanRequest>;
  };
  observed?: {
    list(input?: {}, options?: TaskReadOptions): Promise<ObservedProjection>;
    get(input: { id: string }, options?: TaskReadOptions): Promise<TerminalRequest>;
    decide(
      input: CommandInput<"observed.decide">,
      options?: TaskReadOptions,
    ): Promise<TerminalRequest>;
  };
}

export interface DeviceManagementPort extends TaskChangeSource {
  devices: TaskWorkspacePort["devices"] & {
    revoke(
      input: { deviceId: string; epoch: number },
      options?: TaskReadOptions,
    ): Promise<{ revoked: true }>;
  };
}
