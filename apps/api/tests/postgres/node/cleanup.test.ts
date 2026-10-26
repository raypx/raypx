import { afterAll, beforeAll, expect, it } from "vite-plus/test";
import { connectDatabase, migrateDatabase } from "@raypx/database";
import {
  controlDevice,
  controlObservedRequest,
  controlObservedSession,
  controlTask,
  rateLimit,
  session,
  user,
  verification,
} from "@raypx/database/schema";
import { eq, like, sql } from "drizzle-orm";
import { cleanupExpired, cleanupLock } from "../../../server/jobs/cleanup.js";

const url = process.env.TEST_DATABASE_URL;
if (!url || !new URL(url).pathname.endsWith("_test"))
  throw new Error("An isolated *_test database is required");
const connection = connectDatabase(url, { max: 1 });
const other = connectDatabase(url, { max: 1 });
const prefix = `cleanup-${crypto.randomUUID()}`;
const old = new Date(Date.now() - 2 * 86400_000);
const recent = new Date(Date.now() - 3600_000);
const future = new Date(Date.now() + 86400_000);

beforeAll(async () => {
  await migrateDatabase(url);
  await connection.db
    .insert(user)
    .values({ id: prefix, name: "Cleanup fixture", email: `${prefix}@example.test` });
});
afterAll(async () => {
  try {
    await connection.db.delete(user).where(eq(user.id, prefix));
    await connection.db.delete(verification).where(like(verification.id, `${prefix}%`));
    await connection.db.delete(rateLimit).where(like(rateLimit.key, `${prefix}%`));
  } finally {
    await Promise.all([connection.close(), other.close()]);
  }
});

it("deletes only expired records beyond the grace period and can run again", async () => {
  for (const [name, expiresAt] of [
    ["old", old],
    ["recent", recent],
    ["active", future],
  ] as const) {
    await connection.db
      .insert(session)
      .values({ id: `${prefix}-${name}`, userId: prefix, token: `${prefix}-${name}`, expiresAt });
    await connection.db
      .insert(verification)
      .values({ id: `${prefix}-${name}`, identifier: prefix, value: "fixture", expiresAt });
  }
  await connection.db.insert(rateLimit).values([
    { id: `${prefix}-old`, key: `${prefix}-old`, count: 2, lastRequest: old.getTime() },
    { id: `${prefix}-active`, key: `${prefix}-active`, count: 2, lastRequest: Date.now() },
  ]);
  const result = await cleanupExpired(connection.db);
  expect(result.status).toBe("completed");
  expect(result.sessions).toBeGreaterThanOrEqual(1);
  for (const table of [session, verification]) {
    const rows = await connection.db
      .select({ id: table.id })
      .from(table)
      .where(like(table.id, `${prefix}%`));
    expect(rows.map((row) => row.id).sort()).toEqual([`${prefix}-active`, `${prefix}-recent`]);
  }
  expect(
    await connection.db
      .select()
      .from(rateLimit)
      .where(eq(rateLimit.key, `${prefix}-active`)),
  ).toHaveLength(1);
  expect(
    await connection.db
      .select()
      .from(rateLimit)
      .where(eq(rateLimit.key, `${prefix}-old`)),
  ).toHaveLength(0);
  expect(await connection.db.select().from(user).where(eq(user.id, prefix))).toHaveLength(1);
  expect(await cleanupExpired(connection.db)).toEqual({
    status: "completed",
    sessions: 0,
    verifications: 0,
    rateLimits: 0,
    observedRequests: 0,
    observedSessions: 0,
    contextCommands: 0,
  });
});

it("skips while another instance owns the transaction lock, then resumes", async () => {
  await other.db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(${cleanupLock[0]}, ${cleanupLock[1]})`);
    expect((await cleanupExpired(connection.db)).status).toBe("skipped");
  });
  expect((await cleanupExpired(connection.db)).status).toBe("completed");
});
it("drains old revoked terminal data in bounded batches while preserving active and managed data", async () => {
  const revoked = `${prefix}-revoked`,
    active = `${prefix}-online`;
  await connection.db.insert(controlDevice).values(
    [revoked, active].map((id) => ({
      id,
      userId: prefix,
      deviceId: id,
      body: { revoked: id === revoked },
    })),
  );
  for (const table of [controlObservedRequest, controlObservedSession, controlTask])
    await connection.db.insert(table).values(
      [revoked, active].map((deviceId) => ({
        id: `${prefix}-${deviceId}`,
        userId: prefix,
        deviceId,
        body: { body: "sensitive fixture" },
      })),
    );
  await connection.db.insert(controlObservedRequest).values(
    Array.from({ length: 1000 }, (_, index) => ({
      id: `${prefix}-extra-${index}`,
      userId: prefix,
      deviceId: revoked,
      body: { body: "retired request" },
    })),
  );
  const first = await cleanupExpired(connection.db);
  expect(first.observedRequests).toBe(1000);
  expect(first.observedSessions).toBe(1);
  expect((await cleanupExpired(connection.db)).observedRequests).toBe(1);
  for (const table of [controlObservedRequest, controlObservedSession]) {
    const rows = await connection.db.select().from(table).where(eq(table.userId, prefix));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.deviceId).toBe(active);
  }
  expect(
    await connection.db.select().from(controlTask).where(eq(controlTask.userId, prefix)),
  ).toHaveLength(2);
});

it("rolls back earlier deletions when a later table cannot be locked", async () => {
  const id = `${prefix}-rollback`;
  await connection.db.insert(session).values({ id, userId: prefix, token: id, expiresAt: old });
  await other.db.transaction(async (tx) => {
    await tx.execute(sql`lock table ${verification} in access exclusive mode`);
    await expect(cleanupExpired(connection.db)).rejects.toMatchObject({ cause: { code: "55P03" } });
  });
  expect(await connection.db.select().from(session).where(eq(session.id, id))).toHaveLength(1);
  await cleanupExpired(connection.db);
  expect(await connection.db.select().from(session).where(eq(session.id, id))).toHaveLength(0);
});

it("bounds each batch and drains the remaining records on the next run", async () => {
  await connection.db.insert(verification).values(
    Array.from({ length: 1001 }, (_, index) => ({
      id: `${prefix}-batch-${index}`,
      identifier: prefix,
      value: "fixture",
      expiresAt: old,
    })),
  );
  expect((await cleanupExpired(connection.db)).verifications).toBe(1000);
  expect((await cleanupExpired(connection.db)).verifications).toBe(1);
});
