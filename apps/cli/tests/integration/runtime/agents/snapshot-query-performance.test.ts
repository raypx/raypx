import { afterEach, expect, it, vi } from "vite-plus/test";
import { Database } from "bun:sqlite";
import { uuid, normalizedSql, task, request, fixture } from "../../../helpers/agent-snapshot.js";

afterEach(() => vi.restoreAllMocks());

it.each([10_000, 100_000])(
  "decodes only selected task rows among %i short tasks and uses indexed queries",
  (count) => {
    const f = fixture();
    try {
      f.database.transaction(() => {
        for (let index = count; index > 0; index--) {
          const local = task(index, index % 2 ? "other-binding" : "relay");
          f.put.run(local.task.id, JSON.stringify(local));
        }
        const active = task(count + 1, "relay", "waiting");
        active.task.createdAt = "2020-01-01T00:00:00.000Z";
        f.put.run(active.task.id, JSON.stringify(active));
        const recentActive = task(2, "relay", "running");
        f.put.run(recentActive.task.id, JSON.stringify(recentActive));
        for (const [index, binding, taskId] of [
          [1, "relay", uuid(2)],
          [2, "relay", uuid(count)],
          [3, "other-binding", uuid(2)],
        ] as const)
          f.request.run(uuid(2_000_000 + index), binding, JSON.stringify(request(index, taskId)));
      })();
      const parse = vi.spyOn(JSON, "parse");
      const queries = vi.spyOn(Database.prototype, "query");
      const prepares = vi.spyOn(Database.prototype, "prepare");
      const memoryBefore = process.memoryUsage().heapUsed;
      const started = performance.now();
      const snapshot = f.store.snapshot("relay");
      const elapsedMs = performance.now() - started;
      const heapDeltaBytes = process.memoryUsage().heapUsed - memoryBefore;
      expect(
        snapshot.records.filter((row) => row.kind === "task").map((row) => row.task.id),
      ).toEqual([
        ...Array.from({ length: 100 }, (_, index) => uuid((index + 1) * 2)),
        uuid(count + 1),
      ]);
      expect(
        snapshot.records.filter((row) => row.kind === "request").map((row) => row.request.id),
      ).toEqual([uuid(2_000_001)]);
      expect(parse).toHaveBeenCalledTimes(102);
      const sql = [...queries.mock.calls, ...prepares.mock.calls].map(([statement]) => statement);
      parse.mockRestore();
      queries.mockRestore();
      prepares.mockRestore();
      console.info(
        JSON.stringify({
          benchmark: "agent-snapshot",
          taskRows: count,
          decodedRows: 102,
          records: snapshot.records.length,
          elapsedMs,
          heapDeltaBytes,
        }),
      );
      const taskQuery = sql.find((statement) =>
        normalizedSql(statement).startsWith("with selected as"),
      )!;
      const plan = JSON.stringify(
        f.database.query(`EXPLAIN QUERY PLAN ${taskQuery}`).all("relay", 100, "relay"),
      );
      expect(plan).toContain("tasks_binding_created");
      expect(plan).toContain("tasks_binding_active");
      expect(plan).not.toMatch(/SCAN tasks(?:"| )/);
      const activeQuery = sql.find(
        (statement) =>
          /^select id,\s*value from activity/.test(normalizedSql(statement)) &&
          statement.includes("json_extract"),
      )!;
      expect(
        JSON.stringify(
          f.database.query(`EXPLAIN QUERY PLAN ${activeQuery}`).all("relay", uuid(2), 64),
        ),
      ).toContain("activity_task_active");
      const requestsQuery = sql.find((statement) =>
        normalizedSql(statement).startsWith("select value from requests"),
      )!;
      expect(
        JSON.stringify(
          f.database
            .query(`EXPLAIN QUERY PLAN ${requestsQuery}`)
            .all("relay", JSON.stringify([uuid(2)])),
        ),
      ).toContain("requests_binding_task");
      const countsQuery = sql.find((statement) =>
        /^select task_id,\s*count\(\*\)/.test(normalizedSql(statement)),
      )!;
      expect(
        JSON.stringify(
          f.database
            .query(`EXPLAIN QUERY PLAN ${countsQuery}`)
            .all("relay", JSON.stringify([uuid(2)])),
        ),
      ).toContain("COVERING INDEX activity_task");
    } finally {
      f.close();
    }
  },
);
