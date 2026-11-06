import { profileStorage } from "../../../helpers/sqlite";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { Database } from "bun:sqlite";
import { AgentRuntime } from "../../../../src/runtime/agents";
import { StateStore } from "../../../../src/runtime/state";
import { uuid, now, normalizedSql, task, request, fixture } from "../../../helpers/agent-snapshot";

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
