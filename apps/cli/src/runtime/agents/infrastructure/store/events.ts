import { and, asc, eq } from "drizzle-orm";
import type { LocalDatabase } from "../../../sqlite/index.ts";
import { storedRecord } from "../../../sqlite/records.ts";
import { taskEvents } from "../../../sqlite/schema.ts";
import {
  isActivityEvent,
  orchestrationEventSchema,
  type OrchestrationEvent,
} from "../../domain/events.ts";

/**
 * Durable orchestration history. Every non-activity domain event the sink commits
 * is appended here in the same transaction. Activity is a latest-value
 * projection and is never stored, so Desktop history keeps its current size.
 */
export class TaskEventLog {
  constructor(private readonly database: LocalDatabase) {}

  append(event: OrchestrationEvent) {
    if (isActivityEvent(event)) return;
    this.database
      .insert(taskEvents)
      .values({
        id: event.id,
        binding: event.binding,
        taskId: event.taskId,
        type: event.type,
        value: JSON.stringify(event),
      })
      .onConflictDoNothing()
      .run();
  }

  /** A task's events in commit order. */
  list(binding: string, taskId: string): OrchestrationEvent[] {
    return this.database
      .select({ value: taskEvents.value })
      .from(taskEvents)
      .where(and(eq(taskEvents.binding, binding), eq(taskEvents.taskId, taskId)))
      .orderBy(asc(taskEvents.sequence))
      .all()
      .map((row) => storedRecord(orchestrationEventSchema, row.value));
  }
}
