import type { AgentTask, HumanRequest, TaskActivity } from "@raypx/core/tasks";
import type { OrchestrationEvent } from "./events.js";
import type { TokenUsage } from "./state.js";

interface TaskWrite {
  taskId: string;
  binding: string;
  /** The full aggregate to write; `sessionId` is the provider session to continue. */
  task: AgentTask;
  sessionId: string | null;
}

interface RequestWrite {
  request: HumanRequest;
}

interface ActivityWrite {
  entry: TaskActivity;
}

interface UsageWrite {
  taskId: string;
  binding: string;
  /** The aggregate to write alongside the usage totals. */
  task: AgentTask;
  sessionId: string | null;
  totals: TokenUsage;
}

/**
 * What a sink must persist for one event, in this order: the task row, then the
 * request or activity row, then usage metadata. `undefined` means no write.
 */
export interface Projection {
  task: TaskWrite | undefined;
  request: RequestWrite | undefined;
  activity: ActivityWrite | undefined;
  usage: UsageWrite | undefined;
}

const empty: Projection = {
  task: undefined,
  request: undefined,
  activity: undefined,
  usage: undefined,
};

/**
 * Pure projection of a domain event onto durable writes. It performs no I/O and
 * validates no stored JSON: the sink applies each write inside its transaction,
 * and the record families validate on read as they always have.
 */
export function apply(event: OrchestrationEvent): Projection {
  switch (event.type) {
    case "task.accepted":
      return {
        ...empty,
        task: {
          taskId: event.taskId,
          binding: event.binding,
          task: event.task,
          sessionId: event.sessionId,
        },
      };
    case "task.statusChanged":
    case "task.modeChanged":
      return {
        ...empty,
        task: {
          taskId: event.taskId,
          binding: event.binding,
          task: event.task,
          sessionId: event.sessionId,
        },
      };
    case "task.sessionBound":
      return {
        ...empty,
        task: {
          taskId: event.taskId,
          binding: event.binding,
          task: event.task,
          sessionId: event.sessionId,
        },
      };
    case "task.tokenUsage":
      return {
        ...empty,
        usage: {
          taskId: event.taskId,
          binding: event.binding,
          task: event.task,
          sessionId: event.sessionId,
          totals: event.totals,
        },
      };
    case "request.opened":
    case "request.decided":
    case "request.applied":
    case "request.expired":
      return { ...empty, request: { request: event.request } };
    case "input.queued":
    case "input.statusChanged":
    case "activity.recorded":
      return { ...empty, activity: { entry: event.entry } };
  }
}
