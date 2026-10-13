import { afterAll, beforeAll, describe, expect, it } from "vite-plus/test";
import { sql } from "drizzle-orm";
import { DatabaseDiagnosticError, explainDatabaseQuery } from "../src/diagnostics.js";
import { openTestDatabase, testDatabaseUrl } from "./database.js";

let connection: Awaited<ReturnType<typeof openTestDatabase>>;
beforeAll(async () => {
  connection = await openTestDatabase();
}, 30_000);
afterAll(async () => {
  await connection?.close();
});

describe("PostgreSQL read diagnostics", { concurrent: false }, () => {
  it("plans every catalog query and excludes bound values and raw predicates", async () => {
    const privateId = "diagnostic-private-account";
    const from = new Date("2026-10-01T00:00:00Z");
    const until = new Date("2026-11-01T00:00:00Z");
    const requests = [
      { query: "queued-runs" as const, limit: 2 },
      { query: "expired-runs" as const, now: until, limit: 2 },
      { query: "account-usage" as const, accountId: privateId, from, until },
      { query: "visible-projects" as const, actorId: privateId, limit: 2 },
    ];
    for (const request of requests) {
      const result = await explainDatabaseQuery(testDatabaseUrl(), request);
      expect(result.query).toBe(request.query);
      expect(result.analyze).toBe(false);
      expect(result.nodes.length).toBeGreaterThan(0);
      expect(result.planCost).toBeGreaterThanOrEqual(0);
      expect(result).not.toHaveProperty("executionTimeMs");
      const serialized = JSON.stringify(result);
      expect(serialized).not.toContain(privateId);
      expect(serialized).not.toContain("Filter");
      expect(serialized).not.toContain("Index Cond");
      expect(serialized).not.toContain("2026-10-01");
    }
  });

  it("executes only explicitly analyzed reads and returns actual metrics", async () => {
    const result = await explainDatabaseQuery(testDatabaseUrl(), {
      query: "queued-runs",
      limit: 2,
      analyze: true,
      buffers: true,
    });
    expect(result.analyze).toBe(true);
    expect(result.executionTimeMs).toBeGreaterThanOrEqual(0);
    expect(result.nodes[0]?.actualRows).toBeGreaterThanOrEqual(0);
    expect(result.nodes[0]?.sharedHitBlocks).toBeGreaterThanOrEqual(0);
  });

  it("uses PostgreSQL lock cancellation and releases the diagnostic connection", async () => {
    let locked!: () => void;
    let release!: () => void;
    const acquired = new Promise<void>((resolve) => {
      locked = resolve;
    });
    const released = new Promise<void>((resolve) => {
      release = resolve;
    });
    const holder = connection.db.transaction(async (tx) => {
      await tx.execute(sql`LOCK TABLE cloud_runs IN ACCESS EXCLUSIVE MODE`);
      locked();
      await released;
    });
    await acquired;
    try {
      await expect(
        explainDatabaseQuery(testDatabaseUrl(), {
          query: "queued-runs",
          statementTimeoutMs: 1_000,
          lockTimeoutMs: 20,
        }),
      ).rejects.toEqual(new DatabaseDiagnosticError("QUERY_TIMEOUT"));
    } finally {
      release();
      await holder;
    }
    expect(
      (await explainDatabaseQuery(testDatabaseUrl(), { query: "queued-runs" })).nodes.length,
    ).toBeGreaterThan(0);
  });
});
