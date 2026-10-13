import type { OutboxClaim, OutboxLease, OutboxRepository } from "@raypx/core";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vite-plus/test";
import { PostgresOutboxRepository } from "../src/outbox.js";
import { outboxEvents } from "../src/schema.js";
import { openTestDatabase } from "./database.js";

let connection: Awaited<ReturnType<typeof openTestDatabase>>;
let outbox: OutboxRepository;
const past = new Date("2026-01-01T00:00:00Z");

beforeAll(async () => {
  connection = await openTestDatabase();
  outbox = new PostgresOutboxRepository(connection.db);
}, 30_000);
afterAll(async () => {
  await connection?.close();
});
beforeEach(async () => {
  await connection.db.execute(sql`TRUNCATE outbox_events`);
});

async function enqueue(events: { id: string; availableAt?: Date; createdAt?: Date }[]) {
  await connection.db.insert(outboxEvents).values(
    events.map((event) => ({
      type: "cloud.notification.created",
      payload: { notificationId: event.id },
      availableAt: past,
      createdAt: past,
      ...event,
    })),
  );
}

function claim(workerId: string, limit = 1) {
  return outbox.claim({ workerId, limit, leaseMs: 60_000 });
}

function lease(item: OutboxClaim, workerId: string): OutboxLease {
  return { id: item.id, workerId, attempts: item.attempts };
}

async function row(id: string) {
  const [event] = await connection.db.select().from(outboxEvents).where(eq(outboxEvents.id, id));
  return event!;
}

describe("PostgreSQL outbox delivery", () => {
  it("lets later healthy work pass a failed oldest batch while retaining it for retry", async () => {
    await enqueue([
      { id: "failed-a" },
      { id: "failed-b" },
      { id: "healthy", createdAt: new Date("2026-01-02T00:00:00Z") },
    ]);
    const failed = await claim("worker-a", 2);
    expect(failed.map((item) => item.id).sort()).toEqual(["failed-a", "failed-b"]);
    await Promise.all(
      failed.map((item) => outbox.release({ ...lease(item, "worker-a"), retryDelayMs: 60_000 })),
    );

    const healthy = await claim("worker-b", 2);
    expect(healthy.map((item) => item.id)).toEqual(["healthy"]);
    await outbox.acknowledge(lease(healthy[0]!, "worker-b"));
    expect(await claim("worker-b", 2)).toEqual([]);
    for (const item of failed)
      expect(await row(item.id)).toMatchObject({
        deliveredAt: null,
        leaseOwner: null,
        leasedUntil: null,
        attempts: 1,
        payload: { notificationId: item.id },
      });
  });

  it("selects due work by availability, creation time and id", async () => {
    await enqueue([
      { id: "created-first", availableAt: new Date("2026-01-04T00:00:00Z") },
      { id: "created-later", createdAt: new Date("2026-01-03T00:00:00Z") },
      { id: "b", createdAt: new Date("2026-01-02T00:00:00Z") },
      { id: "a", createdAt: new Date("2026-01-02T00:00:00Z") },
    ]);

    const selected: string[] = [];
    for (let index = 0; index < 4; index++) selected.push((await claim("worker"))[0]!.id);
    expect(selected).toEqual(["a", "b", "created-later", "created-first"]);
  });

  it("waits until a released event is due and increments its durable attempt on retry", async () => {
    await enqueue([{ id: "retry" }]);
    const [first] = await claim("worker-a");
    await outbox.release({ ...lease(first!, "worker-a"), retryDelayMs: 60_000 });
    expect(await claim("worker-b")).toEqual([]);

    await connection.db
      .update(outboxEvents)
      .set({ availableAt: past })
      .where(eq(outboxEvents.id, "retry"));
    const [second] = await claim("worker-b");
    expect(second).toMatchObject({ id: "retry", attempts: 2 });
    await outbox.acknowledge(lease(second!, "worker-b"));
    expect((await row("retry")).deliveredAt).toBeInstanceOf(Date);
    expect(await claim("worker-c")).toEqual([]);
  });

  it("skips locked rows and claims disjoint batches across concurrent workers", async () => {
    await enqueue(["locked", "a", "b", "c", "d"].map((id) => ({ id })));
    await connection.db.transaction(async (tx) => {
      await tx.execute(sql`SELECT id FROM outbox_events WHERE id = 'locked' FOR UPDATE`);
      const batches = await Promise.all([claim("worker-a", 2), claim("worker-b", 2)]);
      expect(batches.map((items) => items.length)).toEqual([2, 2]);
      const claimed = batches.flat();
      expect(claimed.map((item) => item.id).sort()).toEqual(["a", "b", "c", "d"]);
      expect(claimed.every((item) => item.attempts === 1)).toBe(true);
    });
    expect((await claim("worker-c"))[0]).toMatchObject({ id: "locked", attempts: 1 });
  });

  it.each([
    { operation: "acknowledge", nextOwner: "worker-a" },
    { operation: "release", nextOwner: "worker-a" },
    { operation: "acknowledge", nextOwner: "worker-b" },
    { operation: "release", nextOwner: "worker-b" },
  ] as const)(
    "rejects stale $operation after an expired lease is reclaimed by $nextOwner",
    async ({ operation, nextOwner }) => {
      await enqueue([{ id: "reclaimed" }]);
      const [first] = await claim("worker-a");
      await connection.db
        .update(outboxEvents)
        .set({ leasedUntil: past })
        .where(eq(outboxEvents.id, "reclaimed"));
      const [second] = await claim(nextOwner);
      const current = await row("reclaimed");

      if (operation === "release")
        await outbox.release({ ...lease(first!, "worker-a"), retryDelayMs: 60_000 });
      else await outbox.acknowledge(lease(first!, "worker-a"));

      expect(await row("reclaimed")).toEqual(current);
      expect(second).toMatchObject({ id: "reclaimed", attempts: 2 });
      await outbox.acknowledge(lease(second!, nextOwner));
      expect((await row("reclaimed")).deliveredAt).toBeInstanceOf(Date);
      expect(await claim("worker-c")).toEqual([]);
    },
  );
});
