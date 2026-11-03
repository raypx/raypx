import { and, eq, gt, inArray, notInArray, or, sql } from "drizzle-orm";
import type { SequencedEvent } from "@raypx/contracts/tasks";
import { agentEventSchema, type AgentEvent } from "@raypx/core/tasks";
import { normalizeTaskJson } from "@raypx/core/task-text";
import type { LocalDatabase } from "../../../sqlite";
import { storedRecord } from "../../../sqlite/records";
import { agentMeta, journal, outbox } from "../../../sqlite/schema";
import { isDesktopBinding } from "../../model";
import { journalTaskId } from "./queries";

/** Ordered task events per binding, the relay outbox and its rolling replay window. */
export class EventJournal {
  readonly streamId: string;
  // Relay replay keeps a rolling window per binding; tests pass a small window.
  constructor(
    private readonly database: LocalDatabase,
    private readonly retained: number,
    private readonly retainedBytes: number,
  ) {
    database
      .insert(agentMeta)
      .values({ id: "stream", value: crypto.randomUUID() })
      .onConflictDoNothing()
      .run();
    this.streamId = database
      .select({ value: agentMeta.value })
      .from(agentMeta)
      .where(eq(agentMeta.id, "stream"))
      .get()!.value;
    for (const row of database
      .selectDistinct({ binding: journal.binding })
      .from(journal)
      .where(sql`${journal.binding} NOT GLOB 'desktop:*'`)
      .all())
      this.compact(row.binding);
  }

  append(binding: string, event: AgentEvent) {
    this.database.transaction(() => {
      const value = JSON.stringify(normalizeTaskJson(event)),
        local = isDesktopBinding(binding);
      if (!local) this.database.insert(outbox).values({ id: event.id, binding, value: "" }).run();
      this.database.insert(journal).values({ id: event.id, binding, value }).run();
      // Local history has no cloud copy; only relay replay is a rolling cache.
      if (!local) this.compact(binding);
    });
  }
  private compact(binding: string) {
    this.database.transaction(() => {
      const window = this.database
        .select({
          sequence: journal.sequence,
          position: sql<number>`row_number() OVER (ORDER BY ${journal.sequence} DESC)`.as(
            "position",
          ),
          bytes:
            sql<number>`sum(length(CAST(${journal.value} AS BLOB))) OVER (ORDER BY ${journal.sequence} DESC)`.as(
              "bytes",
            ),
        })
        .from(journal)
        .where(eq(journal.binding, binding))
        .as("replay_window");
      this.database
        .delete(journal)
        .where(
          and(
            eq(journal.binding, binding),
            inArray(
              journal.sequence,
              this.database
                .select({ sequence: window.sequence })
                .from(window)
                .where(
                  or(gt(window.position, this.retained), gt(window.bytes, this.retainedBytes)),
                ),
            ),
          ),
        )
        .run();
      this.database
        .delete(outbox)
        .where(
          and(
            eq(outbox.binding, binding),
            notInArray(
              outbox.id,
              this.database
                .select({ id: journal.id })
                .from(journal)
                .where(eq(journal.binding, binding)),
            ),
          ),
        )
        .run();
    });
  }
  sequence(binding: string) {
    return this.database
      .select({ value: sql<number>`COALESCE(MAX(${journal.sequence}),0)` })
      .from(journal)
      .where(eq(journal.binding, binding))
      .get()!.value;
  }
  replay(binding: string, after: number) {
    const floor = this.database
      .select({ value: sql<number>`COALESCE(MIN(${journal.sequence}),0)` })
      .from(journal)
      .where(eq(journal.binding, binding))
      .get()!.value;
    const rows = this.database
      .select({ sequence: journal.sequence, value: journal.value })
      .from(journal)
      .where(and(eq(journal.binding, binding), gt(journal.sequence, after)))
      .orderBy(journal.sequence)
      .limit(50)
      .all();
    const events: SequencedEvent[] = [];
    let bytes = 0;
    for (const row of rows) {
      bytes += Buffer.byteLength(row.value);
      if (bytes > 768 * 1024) break;
      events.push({ sequence: row.sequence, event: storedRecord(agentEventSchema, row.value) });
    }
    return { streamId: this.streamId, sequence: this.sequence(binding), floor, events };
  }
  /** Task-scoped events after a cursor, excluding activity that pages read separately. */
  taskEvents(binding: string, id: string, after: number) {
    const rows = this.database
      .select({ sequence: journal.sequence, value: journal.value })
      .from(journal)
      .where(
        and(
          eq(journal.binding, binding),
          gt(journal.sequence, after),
          eq(journalTaskId, id),
          notInArray(sql`json_extract(${journal.value},'$.kind')`, ["activity", "activity_delta"]),
        ),
      )
      .orderBy(journal.sequence)
      .limit(100)
      .all();
    return rows.map((row) => ({
      cursor: row.sequence,
      event: storedRecord(agentEventSchema, row.value),
    }));
  }
  checkpoint(binding: string, sequence: number) {
    this.database
      .delete(outbox)
      .where(
        and(
          eq(outbox.binding, binding),
          or(
            inArray(
              outbox.id,
              this.database
                .select({ id: journal.id })
                .from(journal)
                .where(and(eq(journal.binding, binding), sql`${journal.sequence}<=${sequence}`)),
            ),
            notInArray(
              outbox.id,
              this.database
                .select({ id: journal.id })
                .from(journal)
                .where(eq(journal.binding, binding)),
            ),
          ),
        ),
      )
      .run();
  }
  /** The next bounded batch of events the relay has not acknowledged. */
  unsent(binding: string): AgentEvent[] {
    const values = this.database
      .select({ value: journal.value })
      .from(outbox)
      .innerJoin(journal, and(eq(journal.id, outbox.id), eq(journal.binding, outbox.binding)))
      .where(eq(outbox.binding, binding))
      .orderBy(journal.sequence)
      .limit(50)
      .all()
      .map((row) => storedRecord(agentEventSchema, row.value));
    const batch: AgentEvent[] = [];
    let bytes = 0;
    for (const value of values) {
      const size = Buffer.byteLength(JSON.stringify(normalizeTaskJson(value)));
      if (bytes + size > 256 * 1024) break;
      bytes += size;
      batch.push(value);
    }
    return batch;
  }
  ack(binding: string, ids: string[]) {
    this.database.transaction(() => {
      for (const id of ids)
        this.database
          .delete(outbox)
          .where(and(eq(outbox.binding, binding), eq(outbox.id, id)))
          .run();
    });
  }
}
