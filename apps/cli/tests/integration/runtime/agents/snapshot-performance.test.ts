import { profileStorage, removeProfileDirectory } from "../../../helpers/sqlite";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { Database } from "bun:sqlite";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { HumanRequest, TaskActivity } from "@raypx/core/tasks";
import { AgentRuntime } from "../../../../src/runtime/agents";
import { AgentStore, type LocalAgentTask } from "../../../../src/runtime/agents/store";
import { StateStore } from "../../../../src/runtime/state";

const uuid = (index: number) => `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
const now = "2026-10-31T00:00:00.000Z";
// Inspect plans independently of Drizzle's quoting, case and whitespace choices.
const normalizedSql = (statement: string) =>
  statement.replaceAll('"', "").toLowerCase().replace(/\s+/g, " ");
function task(
  index: number,
  binding = "relay",
  status: LocalAgentTask["task"]["status"] = "succeeded",
): LocalAgentTask {
  return {
    binding,
    sessionId: null,
    task: {
      id: uuid(index),
      deviceId: uuid(1),
      projectId: uuid(2),
      provider: "codex",
      mode: "run",
      prompt: "Short task",
      summary: "Done",
      status,
      parentTaskId: null,
      createdAt: now,
      updatedAt: now,
    },
  };
}
function activity(
  index: number,
  taskId: string,
  text = "done",
  status: "complete" | "streaming" = "complete",
): TaskActivity {
  return {
    id: uuid(1_000_000 + index),
    taskId,
    kind: "message",
    text,
    status,
    truncated: false,
    createdAt: now,
    updatedAt: now,
    order: index + 1,
    revision: 1,
  };
}
function request(index: number, taskId: string, body = "Confirm"): HumanRequest {
  return {
    id: uuid(2_000_000 + index),
    taskId,
    kind: "permission",
    title: "Permission",
    body,
    questions: [],
    expiresAt: now,
    status: "pending",
    decision: null,
  };
}
function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "raypx-snapshot-performance-"));
  const store = new AgentStore(profileStorage(directory).database);
  const database = new Database(join(directory, "profile.sqlite"));
  return {
    directory,
    store,
    database,
    put: database.query("INSERT OR REPLACE INTO tasks VALUES (?,?)"),
    activity: database.query("INSERT INTO activity VALUES (?,?,?,?)"),
    request: database.query("INSERT INTO requests VALUES (?,?,?)"),
    close() {
      database.close();
      removeProfileDirectory(directory, { recursive: true, force: true });
    },
  };
}
afterEach(() => vi.restoreAllMocks());

it("bounds local pages, task approvals and startup work among 10,000 historical records", async () => {
  const f = fixture();
  const state = new StateStore(profileStorage(f.directory));
  let runtime: AgentRuntime | undefined;
  const binding = "desktop:performance";
  try {
    f.database.transaction(() => {
      for (let index = 1; index <= 10_000; index++) {
        const local = task(index, index % 2 ? "desktop:other" : binding);
        f.put.run(local.task.id, JSON.stringify(local));
        const value = { ...request(index, local.task.id), status: "applied" };
        f.request.run(value.id, binding, JSON.stringify(value));
      }
    })();
    const parse = vi.spyOn(JSON, "parse");
    const queries = vi.spyOn(Database.prototype, "query");
    runtime = new AgentRuntime(state, () => {});
    expect(parse).not.toHaveBeenCalled();
    for (let index = 10_001; index <= 10_002; index++) {
      f.store.put({ ...task(index, binding, "waiting"), sessionId: `live-${index}` });
      const value = request(index, uuid(index));
      f.request.run(value.id, binding, JSON.stringify(value));
    }
    f.store.put(task(1, "desktop:other", "waiting"));
    // Pending requests for finished or foreign tasks must not enter this inbox.
    for (const index of [1, 2]) {
      const value = request(20_000 + index, uuid(index));
      f.request.run(value.id, binding, JSON.stringify(value));
    }
    parse.mockClear();
    const started = performance.now();
    expect(runtime.localTasks("performance", 100)).toHaveLength(100);
    expect(parse).toHaveBeenCalledTimes(100);
    parse.mockClear();
    const before = `${now}:${uuid(8_000)}`;
    expect(runtime.localTasks("performance", 100, before).map((value) => value.id)).toEqual(
      Array.from({ length: 100 }, (_, index) => uuid(7_998 - index * 2)),
    );
    expect(parse).toHaveBeenCalledTimes(100);
    parse.mockClear();
    expect(runtime.localTasks("missing", 100)).toEqual([]);
    expect(parse).not.toHaveBeenCalled();
    expect(runtime.localTask("performance", uuid(2), 0).requests).toHaveLength(2);
    expect(parse).toHaveBeenCalledTimes(3);
    parse.mockClear();
    expect(runtime.localApprovals("performance").map((value) => value.taskId)).toEqual([
      uuid(10_001),
      uuid(10_002),
    ]);
    expect(parse).toHaveBeenCalledTimes(2);
    parse.mockClear();
    expect(runtime.managesSession("codex", "live-10001")).toBe(true);
    expect(runtime.managesSession("claude", "live-10001")).toBe(false);
    expect(parse).not.toHaveBeenCalled();
    const sql = queries.mock.calls.map(([statement]) => statement);
    queries.mockRestore();
    parse.mockRestore();
    const startup = sql.find((statement) =>
      normalizedSql(statement).startsWith(
        "select value from tasks where json_extract(tasks.value,'$.task.status') in",
      ),
    )!;
    expect(JSON.stringify(f.database.query(`EXPLAIN QUERY PLAN ${startup}`).all())).toMatch(
      /USING INDEX tasks_(active_session|binding_active)/,
    );
    const page = sql.find((statement) =>
      normalizedSql(statement).includes("|| ':' || tasks.id < ?"),
    )!;
    const plan = JSON.stringify(
      f.database.query(`EXPLAIN QUERY PLAN ${page}`).all(binding, before, 100),
    );
    expect(plan).toContain("tasks_binding_cursor");
    expect(plan).not.toContain("TEMP B-TREE");
    const pending = sql.find((statement) => normalizedSql(statement).includes("exists (select"))!;
    expect(
      JSON.stringify(f.database.query(`EXPLAIN QUERY PLAN ${pending}`).all(binding)),
    ).toContain("requests_binding_pending");
    const approvals = sql.find(
      (statement) =>
        normalizedSql(statement).startsWith("select value from requests") &&
        normalizedSql(statement).includes("json_extract(requests.value,'$.taskid') = ?"),
    )!;
    expect(
      JSON.stringify(f.database.query(`EXPLAIN QUERY PLAN ${approvals}`).all(binding, uuid(2))),
    ).toContain("requests_binding_task");
    console.info(
      JSON.stringify({
        benchmark: "local-agent-reads",
        taskRows: 10_002,
        requestRows: 10_004,
        pageDecodedRows: 100,
        detailDecodedRows: 3,
        inboxDecodedRows: 2,
        startupDecodedRows: 0,
        elapsedMs: performance.now() - started,
      }),
    );
  } finally {
    vi.restoreAllMocks();
    await runtime?.close();
    f.close();
  }
});

it("bounds decoded activity among 10,000 historical entries while retaining old active work", () => {
  const f = fixture();
  try {
    f.store.put(task(1));
    f.database.transaction(() => {
      for (let index = 0; index < 10_000; index++) {
        const entry = activity(
          index,
          uuid(1),
          `Activity ${index}`,
          index === 0 ? "streaming" : "complete",
        );
        f.activity.run(entry.id, "relay", entry.taskId, JSON.stringify(entry));
        const other = activity(10_000 + index, uuid(1), "Other binding");
        f.activity.run(other.id, "other-binding", other.taskId, JSON.stringify(other));
      }
    })();
    const parse = vi.spyOn(JSON, "parse");
    const started = performance.now();
    const snapshot = f.store.snapshot("relay");
    const elapsedMs = performance.now() - started;
    const decodedRows = parse.mock.calls.length;
    parse.mockRestore();
    const entries = snapshot.records.flatMap((record) =>
      record.kind === "activity" ? [record.entry] : [],
    );
    expect(entries.map((entry) => entry.id)).toEqual([
      activity(0, uuid(1)).id,
      ...Array.from({ length: 64 }, (_, index) => activity(9_999 - index, uuid(1)).id),
    ]);
    expect(snapshot.records[0]).toMatchObject({ kind: "task", task: { activityIncomplete: true } });
    expect(decodedRows).toBe(66);
    console.info(
      JSON.stringify({
        benchmark: "agent-snapshot-activity",
        activityRows: 10_000,
        otherBindingRows: 10_000,
        decodedRows,
        elapsedMs,
      }),
    );
  } finally {
    f.close();
  }
});

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

it("rejects unmanaged JSON-only task profiles without repairing indexes or rewriting rows", () => {
  const f = fixture();
  try {
    const local = task(1);
    const original = JSON.stringify(local, null, 2);
    f.put.run(local.task.id, original);
    f.database.exec(
      "DROP INDEX tasks_binding_created; DROP INDEX tasks_binding_active; DROP INDEX tasks_binding_cursor; DROP INDEX tasks_active_session; DROP INDEX requests_binding_task; DROP INDEX requests_binding_pending; DROP INDEX activity_task_active; DROP INDEX commands_binding;",
    );
    f.database.exec("DROP TABLE __drizzle_migrations;");
    expect(() => new AgentStore(profileStorage(f.directory).database)).toThrow(
      "unsupported SQLite schema",
    );
    expect(f.database.query("SELECT value FROM tasks WHERE id=?").get(uuid(1))).toEqual({
      value: original,
    });
    expect(
      f.database
        .query(
          "SELECT name FROM sqlite_master WHERE name IN ('tasks_binding_created','tasks_binding_active','tasks_binding_cursor','tasks_active_session','requests_binding_task','requests_binding_pending','activity_task_active','commands_binding')",
        )
        .all(),
    ).toHaveLength(0);
  } finally {
    f.database.close();
    removeProfileDirectory(f.directory, { recursive: true, force: true });
  }
});

it("reads task rows and watermark from one frozen WAL transaction while another owner advances", () => {
  const f = fixture();
  const writer = new AgentStore(profileStorage(f.directory).database);
  try {
    const local = task(1);
    writer.put(local);
    writer.event("relay", {
      id: uuid(3),
      taskId: uuid(1),
      kind: "status",
      status: "succeeded",
      summary: "Before",
    });
    const previous = writer.sequence("relay");
    const sequence = f.store.sequence.bind(f.store);
    vi.spyOn(f.store, "sequence").mockImplementation((binding) => {
      writer.put({ ...local, task: { ...local.task, summary: "After" } });
      writer.event("relay", {
        id: uuid(4),
        taskId: uuid(1),
        kind: "status",
        status: "succeeded",
        summary: "After",
      });
      return sequence(binding);
    });
    const snapshot = f.store.snapshot("relay");
    expect(snapshot.sequence).toBe(previous);
    expect(snapshot.records).toMatchObject([{ task: { summary: "Done" } }]);
    expect(writer.sequence("relay")).toBeGreaterThan(snapshot.sequence);
    expect(writer.get(uuid(1))?.task.summary).toBe("After");
  } finally {
    f.close();
  }
});

it("admits activity in fair rounds before decoding and stays within the 32 MiB checkpoint budget", () => {
  const f = fixture();
  try {
    f.database.transaction(() => {
      for (let index = 0; index < 100; index++) {
        const local = task(index + 1);
        f.put.run(local.task.id, JSON.stringify(local));
        for (let entry = 0; entry < 16; entry++) {
          const value = activity(
            index * 16 + entry,
            local.task.id,
            "x".repeat(32_000),
            "streaming",
          );
          f.activity.run(value.id, "relay", local.task.id, JSON.stringify(value));
        }
      }
    })();
    const parse = vi.spyOn(JSON, "parse");
    const snapshot = f.store.snapshot("relay");
    const entries = snapshot.records.filter((record) => record.kind === "activity");
    expect(parse).toHaveBeenCalledTimes(100 + entries.length);
    expect(entries.length).toBeGreaterThan(100);
    expect(entries.length).toBeLessThan(1600);
    expect(new Set(entries.slice(0, 100).map((record) => record.entry.taskId)).size).toBe(100);
    const counts = new Map<string, number>();
    for (const record of entries)
      counts.set(record.entry.taskId, (counts.get(record.entry.taskId) ?? 0) + 1);
    expect(Math.max(...counts.values()) - Math.min(...counts.values())).toBeLessThanOrEqual(1);
    expect(Buffer.byteLength(JSON.stringify(snapshot.records))).toBeLessThan(
      32 * 1024 * 1024 - 64 * 1024,
    );
    expect(
      snapshot.records
        .filter((record) => record.kind === "task")
        .every((record) => record.task.activityIncomplete),
    ).toBe(true);
  } finally {
    f.close();
  }
});

it("keeps old active entries plus a bounded recent page, deduplicates them and marks omitted history", () => {
  const f = fixture();
  try {
    f.store.put(task(1));
    f.store.put(task(2));
    f.store.put(task(3));
    f.database.transaction(() => {
      for (let index = 0; index < 80; index++) {
        const value = activity(
          index,
          uuid(1),
          "界".repeat(32_000),
          index === 0 ? "streaming" : "complete",
        );
        f.activity.run(value.id, "relay", uuid(1), JSON.stringify(value));
      }
      const value = activity(100, uuid(2), "done", "streaming");
      f.activity.run(value.id, "relay", uuid(2), JSON.stringify(value));
    })();
    const parse = vi.spyOn(JSON, "parse");
    const snapshot = f.store.snapshot("relay");
    const entries = snapshot.records.filter((record) => record.kind === "activity");
    expect(entries.map((record) => record.entry.id)).toEqual([
      uuid(1_000_000),
      uuid(1_000_100),
      uuid(1_000_079),
      uuid(1_000_078),
    ]);
    expect(parse).toHaveBeenCalledTimes(7);
    expect(
      snapshot.records
        .filter((record) => record.kind === "task")
        .map((record) => record.task.activityIncomplete),
    ).toEqual([true, false, false]);
  } finally {
    f.close();
  }
});

it("freezes paged records across live writes, caps pages at ten rows and 384 KiB, and expires cursors", async () => {
  const directory = mkdtempSync(join(tmpdir(), "raypx-snapshot-pages-"));
  const state = new StateStore(profileStorage(directory));
  const runtime = new AgentRuntime(state, () => {});
  const writer = new AgentStore(profileStorage(directory).database);
  const database = new Database(join(directory, "profile.sqlite"));
  try {
    for (let index = 1; index <= 21; index++) writer.put(task(index));
    const insert = database.query("INSERT INTO requests VALUES (?,?,?)");
    for (let index = 0; index < 5; index++) {
      const value = request(index, uuid(1), "x".repeat(128_000));
      insert.run(value.id, "relay", JSON.stringify(value));
    }
    const first = runtime.snapshot("relay");
    expect(first.records).toHaveLength(10);
    writer.put({ ...task(11), task: { ...task(11).task, summary: "Changed after snapshot" } });
    writer.event("relay", {
      id: uuid(40),
      taskId: uuid(11),
      kind: "status",
      status: "succeeded",
      summary: "Changed after snapshot",
    });
    let page = first;
    const records = [...first.records];
    do {
      page = runtime.snapshot("relay", first.id, page.next);
      expect(page.records.length).toBeLessThanOrEqual(10);
      expect(Buffer.byteLength(JSON.stringify(page.records))).toBeLessThan(384 * 1024);
      expect(page.sequence).toBe(first.sequence);
      records.push(...page.records);
    } while (!page.done);
    expect(records).toHaveLength(26);
    expect(
      records.find((record) => record.kind === "task" && record.task.id === uuid(11)),
    ).toMatchObject({ task: { summary: "Done" } });
    expect(() => runtime.snapshot("other-binding", first.id)).toThrow("Snapshot unavailable");
    vi.spyOn(Date, "now").mockReturnValue(Date.now() + 120_001);
    expect(() => runtime.snapshot("relay", first.id)).toThrow("Snapshot unavailable");
  } finally {
    vi.restoreAllMocks();
    database.close();
    await runtime.close();
    removeProfileDirectory(directory, { recursive: true, force: true });
  }
});
