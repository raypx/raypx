import type { AgentEvent, TaskActivity } from "@raypx/core/tasks";
import type { LocalDatabase } from "../../../sqlite/index.js";
import { apply } from "../../domain/projector.js";
import { toWireEvents } from "../../domain/wire.js";
import type { OrchestrationEvent } from "../../domain/events.js";
import type { Clock, Ids } from "../../domain/ports.js";
import type { ActivityDraft, LocalAgentTask, TokenUsage } from "../../domain/state.js";
import type { ActivityLog } from "./activity.js";
import type { CommandReceipts } from "./commands.js";
import type { EventJournal } from "./journal.js";
import type { RequestRecords } from "./requests.js";
import type { TaskRecords } from "./tasks.js";
import type { TaskEventLog } from "./events.js";

export interface SinkPorts {
  database: LocalDatabase;
  journal: EventJournal;
  tasks: TaskRecords;
  requests: RequestRecords;
  activity: ActivityLog;
  commands: CommandReceipts;
  events: TaskEventLog;
  clock: Clock;
  ids: Ids;
}

/**
 * The single commit boundary for orchestration. One transaction writes the
 * command receipt (idempotent delivery), each event's task, request or activity
 * projection, and the relay journal and outbox rows the wire projection produces.
 * Any failure rolls all of them back together.
 *
 * Activity events carry an entry that is already stored: the revision and delta
 * shape depend on the previous row, so `ActivityLog.record` supplies them before
 * the commit.
 */
export class OrchestrationSink {
  constructor(private readonly ports: SinkPorts) {}

  /** Commit a decision. `receiptId` makes a redelivered command a no-op. */
  commit(events: readonly OrchestrationEvent[], receiptId?: string) {
    return this.ports.database.transaction(() => {
      if (receiptId) this.ports.commands.receipt(receiptId);
      for (const event of events) this.apply(event);
    });
  }

  /**
   * Upsert an activity draft and commit its event in one transaction. Returns the
   * stored entry so callers observe the assigned order and revision.
   */
  recordActivity(binding: string, draft: ActivityDraft): TaskActivity {
    return this.ports.database.transaction(() => {
      const at = this.ports.clock.now().toISOString();
      const written = this.ports.activity.record(binding, draft, this.ports.ids.generate(), at);
      // Inputs are durable history; other activity is a latest-value projection only.
      if (written.entry.kind === "input")
        this.ports.events.append({
          type: written.entry.revision === 1 ? "input.queued" : "input.statusChanged",
          id: this.ports.ids.generate(),
          binding,
          taskId: written.entry.taskId,
          at,
          entry: written.entry,
        });
      for (const wire of toWireEvents(written.event)) this.ports.journal.append(binding, wire);
      return written.entry;
    });
  }

  /** Upsert a request and commit its event in one transaction. */
  recordRequest(binding: string, request: Parameters<RequestRecords["record"]>[1]) {
    return this.ports.database.transaction(() => {
      const opened = this.ports.requests.record(
        binding,
        request,
        this.ports.ids.generate(),
        this.ports.clock.now().toISOString(),
      );
      // The row is written once; the history row names the state it reached.
      const event = requestEvent(opened);
      this.ports.events.append(event);
      for (const wire of toWireEvents(event)) this.ports.journal.append(binding, wire);
    });
  }

  /** Save a task change and settle the work an inactive status ends. */
  transition(task: LocalAgentTask, event: Extract<AgentEvent, { kind: "status" }>) {
    return this.ports.database.transaction(() => {
      this.ports.tasks.put(task);
      this.ports.journal.append(task.binding, event);
    });
  }

  /** Persist usage totals on the task and remember them for the provider session. */
  tokenUsage(task: LocalAgentTask, totals: TokenUsage) {
    return this.ports.database.transaction(() => this.ports.tasks.recordTokenUsage(task, totals));
  }

  /**
   * Persist a domain event's history row inside the caller's transaction. Store
   * paths that write their own projection use this so every committed decision
   * also lands in `task_events`.
   */
  persist(event: OrchestrationEvent) {
    this.ports.events.append(event);
  }

  private apply(event: OrchestrationEvent) {
    this.ports.events.append(event);
    const projection = apply(event);
    if (projection.task)
      this.ports.tasks.put({
        task: projection.task.task,
        binding: projection.task.binding,
        sessionId: projection.task.sessionId,
      });
    if (projection.request)
      this.ports.requests.record(
        event.binding,
        projection.request.request,
        this.ports.ids.generate(),
        event.at,
      );
    if (projection.usage)
      this.ports.tasks.recordTokenUsage(
        {
          task: projection.usage.task,
          binding: projection.usage.binding,
          sessionId: projection.usage.sessionId,
        },
        projection.usage.totals,
      );
    for (const wire of toWireEvents(event)) this.ports.journal.append(event.binding, wire);
  }
}

/** Name a request write by the state it reached, so history reads as a lifecycle. */
function requestEvent(
  opened: Extract<OrchestrationEvent, { type: "request.opened" }>,
): OrchestrationEvent {
  const { request } = opened;
  if (request.status === "decided") return { ...opened, type: "request.decided" };
  if (request.status === "applied" && request.decision)
    return { ...opened, type: "request.applied", decision: request.decision };
  if (request.status === "expired") return { ...opened, type: "request.expired" };
  return opened;
}
