import type { AgentTask, HumanRequest, TaskInput } from "@raypx/core/tasks";
import type { OrchestrationEvent } from "./events.ts";

/** The records a task's committed history reconstructs. */
export interface FoldedTask {
  task: AgentTask | undefined;
  sessionId: string | null;
  requests: HumanRequest[];
  inputs: TaskInput[];
}

/**
 * Fold a task's events, oldest first, into its task, request and input records.
 * This is the read side of event sourcing: it must agree with the projection
 * tables for any task whose history was recorded from creation.
 */
export function fold(events: readonly OrchestrationEvent[]): FoldedTask {
  let task: AgentTask | undefined;
  let sessionId: string | null = null;
  const requests = new Map<string, HumanRequest>();
  const inputs = new Map<string, TaskInput>();
  for (const event of events)
    switch (event.type) {
      case "task.accepted":
      case "task.statusChanged":
      case "task.modeChanged":
      case "task.sessionBound":
      case "task.tokenUsage":
        task = event.task;
        sessionId = event.sessionId;
        break;
      case "request.opened":
      case "request.decided":
      case "request.applied":
      case "request.expired":
        // Re-inserting keeps the latest write last, matching REPLACE's rowid order.
        requests.delete(event.request.id);
        requests.set(event.request.id, event.request);
        break;
      case "input.queued":
      case "input.statusChanged":
        if (event.entry.kind === "input") inputs.set(event.entry.id, event.entry);
        break;
      case "activity.recorded":
        break;
    }
  return { task, sessionId, requests: [...requests.values()], inputs: [...inputs.values()] };
}
