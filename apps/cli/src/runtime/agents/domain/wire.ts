import type { AgentEvent } from "@raypx/core/tasks";
import type { OrchestrationEvent } from "./events.js";
import { isDesktopBinding } from "./state.js";

/**
 * Wire projection: one domain event becomes the `AgentEvent` the relay journal,
 * relay outbox, Desktop bindings and snapshots already understand. Identities are
 * supplied by the event where it already carries the wire identity, so a replay
 * of the same event produces the same record.
 *
 * Activity is journaled only for relay bindings; local Desktop history keeps the
 * latest activity projection and never a cloud copy.
 */
export function toWireEvents(event: OrchestrationEvent): AgentEvent[] {
  switch (event.type) {
    case "task.accepted":
      // Acceptance itself is not a relay event; the first status follows it.
      return [];
    case "task.statusChanged":
      return [
        {
          id: event.id,
          taskId: event.taskId,
          kind: "status",
          status: event.task.status,
          summary: event.task.summary,
          task: event.task,
        },
      ];
    case "task.sessionBound":
    case "task.tokenUsage":
    case "task.modeChanged":
      // Session, usage and plan-to-run transitions reach the wire through the
      // status and activity events that follow them.
      return [];
    case "request.opened":
    case "request.decided":
    case "request.applied":
    case "request.expired":
      return [
        {
          id: event.id,
          taskId: event.taskId,
          kind: "request",
          request: event.request,
        },
      ];
    case "input.queued":
    case "input.statusChanged":
    case "activity.recorded": {
      if (isDesktopBinding(event.binding)) return [];
      if (event.type === "activity.recorded" && event.delta)
        return [
          {
            id: event.id,
            taskId: event.taskId,
            kind: "activity_delta",
            entryId: event.delta.entryId,
            baseRevision: event.delta.baseRevision,
            revision: event.delta.revision,
            append: event.delta.append,
            updatedAt: event.entry.updatedAt,
            truncated: event.delta.truncated,
          },
        ];
      return [
        {
          id: event.id,
          taskId: event.taskId,
          kind: "activity",
          entry: event.entry,
        },
      ];
    }
  }
}
