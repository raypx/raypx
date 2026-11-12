import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { profileStorage, removeProfileDirectory } from "../../../helpers/sqlite.js";
import { afterEach, expect, it, vi } from "vitest";
import { Database } from "bun:sqlite";
import { join } from "node:path";
import { AgentRuntime } from "../../../../src/runtime/agents/index.js";
import { AgentStore } from "../../../../src/runtime/agents/store.js";
import { StateStore } from "../../../../src/runtime/state/index.js";
import { uuid, task, request, fixture } from "../../../helpers/agent-snapshot.js";

afterEach(() => vi.restoreAllMocks());

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
