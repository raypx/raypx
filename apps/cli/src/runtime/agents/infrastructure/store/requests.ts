import { and, eq, exists, sql } from "drizzle-orm";
import { humanRequestSchema, type HumanRequest } from "@raypx/core/tasks";
import { normalizeTaskJson } from "@raypx/core/task-text";
import type { LocalDatabase } from "../../../sqlite";
import { storedRecord } from "../../../sqlite/records";
import { requests, tasks } from "../../../sqlite/schema";
import type { RequestOpened } from "../../domain/events";
import { activeTaskFilter, requestTaskId, taskBinding } from "./queries";

const pendingRequestFilter = sql`json_extract(${requests.value},'$.status') IN ('pending','decided')`;

/** Human requests raised by tasks. The caller projects each write as an event. */
export class RequestRecords {
  constructor(private readonly database: LocalDatabase) {}

  list(binding: string, taskId?: string): HumanRequest[] {
    return this.database
      .select({ value: requests.value })
      .from(requests)
      .where(
        and(
          eq(requests.binding, binding),
          taskId === undefined ? undefined : eq(requestTaskId, taskId),
        ),
      )
      .orderBy(sql`rowid`)
      .all()
      .map((row) => storedRecord(humanRequestSchema, row.value));
  }
  get(binding: string, id: string): HumanRequest | undefined {
    const row = this.database
      .select({ value: requests.value })
      .from(requests)
      .where(and(eq(requests.binding, binding), eq(requests.id, id)))
      .get();
    return row ? storedRecord(humanRequestSchema, row.value) : undefined;
  }
  /** Open requests whose task is still active, soonest expiry first. */
  pending(binding: string): HumanRequest[] {
    return this.database
      .select({ value: requests.value })
      .from(requests)
      .where(
        and(
          eq(requests.binding, binding),
          pendingRequestFilter,
          exists(
            this.database
              .select({ id: tasks.id })
              .from(tasks)
              .where(
                and(
                  eq(tasks.id, requestTaskId),
                  eq(taskBinding, requests.binding),
                  activeTaskFilter,
                ),
              ),
          ),
        ),
      )
      .orderBy(sql`json_extract(${requests.value},'$.expiresAt')`, sql`rowid`)
      .all()
      .map((row) => storedRecord(humanRequestSchema, row.value));
  }
  /** Upsert the request and return the event describing the write. */
  record(binding: string, value: HumanRequest, eventId: string, at: string): RequestOpened {
    this.database.transaction(() => {
      // Approval enumeration and snapshot ordering depend on REPLACE's new rowid.
      this.database.run(
        sql`INSERT OR REPLACE INTO ${requests} (id,binding,value) VALUES (${value.id},${binding},${JSON.stringify(normalizeTaskJson(value))})`,
      );
    });
    return {
      type: "request.opened",
      id: eventId,
      binding,
      taskId: value.taskId,
      at,
      request: value,
    };
  }
}
