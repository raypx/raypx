import type { OutboxEvent, OutboxRepository } from "@voidmix/core";
import { sql } from "drizzle-orm";

import type { DatabaseConnection } from "./postgres.js";

type Database = DatabaseConnection["db"];
type OutboxRow = {
  id: string;
  type: string;
  payload: Record<string, unknown>;
};

export class PostgresOutboxRepository implements OutboxRepository {
  constructor(private readonly db: Database) {}

  async claim(input: { workerId: string; limit: number; leaseMs: number }): Promise<OutboxEvent[]> {
    const rows = await this.db.execute<OutboxRow>(sql`
      WITH candidates AS (
        SELECT id
        FROM outbox_events
        WHERE delivered_at IS NULL
          AND available_at <= now()
          AND (leased_until IS NULL OR leased_until < now())
        ORDER BY created_at, id
        FOR UPDATE SKIP LOCKED
        LIMIT ${input.limit}
      )
      UPDATE outbox_events AS events
      SET lease_owner = ${input.workerId},
          leased_until = now() + (${input.leaseMs} * interval '1 millisecond'),
          attempts = events.attempts + 1
      FROM candidates
      WHERE events.id = candidates.id
      RETURNING events.id, events.type, events.payload
    `);
    return [...rows].map((row) => ({ id: row.id, type: row.type, payload: row.payload }));
  }

  async acknowledge(input: { id: string; workerId: string }): Promise<void> {
    await this.db.execute(sql`
      UPDATE outbox_events
      SET delivered_at = now(), lease_owner = NULL, leased_until = NULL
      WHERE id = ${input.id} AND lease_owner = ${input.workerId} AND delivered_at IS NULL
    `);
  }

  async release(input: { id: string; workerId: string }): Promise<void> {
    await this.db.execute(sql`
      UPDATE outbox_events
      SET lease_owner = NULL, leased_until = NULL, available_at = now()
      WHERE id = ${input.id} AND lease_owner = ${input.workerId} AND delivered_at IS NULL
    `);
  }
}
