import { spawnProcess } from "@raypx/runtime-node/process";
import { profileStorage, removeProfileDirectory } from "../../helpers/sqlite.ts";
import { afterEach, expect, it } from "vite-plus/test";
import { DatabaseSync as Database } from "node:sqlite";
import { copyFileSync, mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle, migrateLocalDatabase } from "../../../src/runtime/sqlite/index.ts";
import migrations from "../../../src/runtime/sqlite/migrations.generated.json";
import { StateStore } from "../../../src/runtime/state/index.ts";
import { AgentStore } from "../../../src/runtime/agents/store.ts";
import { TerminalStore } from "../../../src/runtime/terminal/store.ts";
import { SqliteContextRepository } from "../../../src/runtime/memory/repository.ts";
import { SqlitePiContextStore } from "../../../src/runtime/agents/harness/context/sqlite.ts";

const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0).reverse()) cleanup();
});
function directory() {
  const path = mkdtempSync(join(tmpdir(), "raypx-sqlite-migrations-"));
  cleanups.push(() => removeProfileDirectory(path, { recursive: true, force: true }));
  return path;
}
function fixture() {
  const root = directory(),
    path = join(root, "profile.sqlite");
  const client = new Database(path, {});
  cleanups.push(() => client.close());
  return { directory: root, path, client, db: drizzle({ client }) };
}

it("applies each embedded profile migration once and reopens the recorded schema", () => {
  const f = fixture();
  migrateLocalDatabase(f.db);
  const applied = f.client.prepare("SELECT * FROM __drizzle_migrations").all();
  expect(applied).toHaveLength(migrations.length);
  const reopened = new Database(f.path);
  try {
    migrateLocalDatabase(drizzle({ client: reopened }));
    expect(reopened.prepare("SELECT * FROM __drizzle_migrations").all()).toEqual(applied);
  } finally {
    reopened.close();
  }
});

it("adds orchestration tables in a second migration without backfilling existing tasks", () => {
  const f = fixture();
  // Apply only the initial migration and record a task, as a profile from before.
  const initial = drizzle({ client: f.client });
  migrateLocalDatabase(initial);
  const statement = migrations.find((entry) =>
    entry.sql.includes("CREATE TABLE `task_events`"),
  )!.sql;
  expect(migrations.at(-1)!.name).not.toBe(migrations[0]!.name);
  expect(statement).toContain("CREATE TABLE `task_events`");
  expect(statement).toContain("CREATE TABLE `task_effects`");
  // Tables only: the migration never copies or rewrites existing task rows.
  expect(statement).not.toMatch(/\bINSERT\b|\bUPDATE\b|\bDELETE\b/i);
  expect(f.client.prepare("SELECT count(*) AS count FROM task_events").get()).toEqual({ count: 0 });
  expect(f.client.prepare("SELECT count(*) AS count FROM task_effects").get()).toEqual({
    count: 0,
  });
});

it("shares one profile writer and transaction across every repository", async () => {
  const f = fixture(),
    storage = profileStorage(f.directory),
    state = new StateStore(storage),
    agents = new AgentStore(storage.database),
    terminal = new TerminalStore(storage.database),
    memory = new SqliteContextRepository(storage.database),
    pi = new SqlitePiContextStore(storage.database, "shared");
  try {
    const revision = state.revision();
    expect(() =>
      storage.database.transaction(() => {
        state.putRoot({
          id: crypto.randomUUID(),
          name: "Rollback",
          path: f.directory,
          createdAt: new Date().toISOString(),
        });
        terminal.projectId("rolled-back");
        throw new Error("rollback");
      }),
    ).toThrow("rollback");
    expect(state.roots()).toEqual([]);
    expect(state.revision()).toBe(revision);
    expect(f.client.prepare("SELECT id FROM terminal_project").all()).toEqual([]);
    const projectId = terminal.projectId(f.directory),
      id = crypto.randomUUID();
    await memory.create("device", id, {
      kind: "memory",
      name: "Shared",
      category: "Test",
      content: "Reference",
      project: null,
    });
    await pi.commit(0, { status: "idle", messages: [] });
    expect(f.client.prepare("SELECT id FROM terminal_project").get()).toEqual({ id: projectId });
    expect(f.client.prepare("SELECT id FROM documents").get()).toEqual({ id });
    expect(f.client.prepare("SELECT value FROM agent_meta WHERE id='stream'").get()).toEqual({
      value: agents.streamId,
    });
    expect(f.client.prepare("SELECT context_id FROM pi_contexts").get()).toEqual({
      context_id: "shared",
    });
    expect(f.client.prepare("SELECT count(*) AS count FROM __drizzle_migrations").get()).toEqual({
      count: migrations.length,
    });
    expect(terminal.projectId(f.directory)).toBe(projectId);
    expect((await memory.get("device", id)).content).toBe("Reference");
    expect((await pi.load()).revision).toBe(1);
    expect(
      readdirSync(f.directory).filter(
        (name) => name.endsWith(".sqlite") && !name.endsWith("lock.sqlite"),
      ),
    ).toEqual(["profile.sqlite"]);
  } finally {
    pi.close();
    storage.close();
  }
});

it("keeps repositories borrowed until the profile owner closes them", () => {
  const root = directory();
  const storage = profileStorage(root);
  const state = new StateStore(storage);
  const agents = new AgentStore(storage.database);
  const terminal = new TerminalStore(storage.database);
  terminal.projectId(root);
  expect(state.roots()).toEqual([]);
  expect(agents.projects()).toEqual([]);
  storage.close();
  storage.close();
  expect(() => state.roots()).toThrow(/closed|finalized|query|database/i);
  expect(() => agents.projects()).toThrow(/closed|finalized|query|database/i);
  expect(() => terminal.projectId(root)).toThrow(/closed|finalized|query|database/i);
});

it("rejects corrupted persisted records before they enter runtime state", () => {
  const storage = profileStorage(directory());
  const state = new StateStore(storage);
  const agents = new AgentStore(storage.database);
  const client = storage.database.$client;
  client
    .prepare("INSERT INTO roots VALUES (?,?)")
    .run("invalid", JSON.stringify({ id: "invalid" }));
  client
    .prepare("INSERT INTO tasks VALUES (?,?)")
    .run(
      "invalid",
      JSON.stringify({ task: { id: "invalid" }, binding: "desktop:local", sessionId: null }),
    );
  expect(() => state.roots()).toThrow("Profile contains invalid stored data");
  expect(() => agents.get("invalid")).toThrow("Profile contains invalid stored data");
  expect(client.prepare("SELECT value FROM roots WHERE id='invalid'").get()).toEqual({
    value: JSON.stringify({ id: "invalid" }),
  });
});

it("rejects an unmanaged database without adopting or changing its data", () => {
  const f = fixture();
  f.client.exec("CREATE TABLE existing (value TEXT); INSERT INTO existing VALUES ('preserved');");
  expect(() => migrateLocalDatabase(f.db)).toThrow("unsupported SQLite schema");
  expect(f.client.prepare("SELECT * FROM existing").all()).toEqual([{ value: "preserved" }]);
  expect(f.client.prepare("SELECT name FROM sqlite_schema WHERE type='table'").all()).toEqual([
    { name: "existing" },
  ]);
});

it("rejects a retired Drizzle ledger before the ORM can upgrade it", () => {
  const f = fixture();
  f.client.exec(
    "CREATE TABLE __drizzle_migrations (id INTEGER PRIMARY KEY, hash TEXT NOT NULL, created_at NUMERIC)",
  );
  expect(() => migrateLocalDatabase(f.db)).toThrow("unsupported SQLite schema");
  expect(
    f.client
      .prepare("PRAGMA table_info('__drizzle_migrations')")
      .all()
      .map((column) => column.name),
  ).toEqual(["id", "hash", "created_at"]);
});

it.each(["unknown-migration", migrations[0]!.name])(
  "rejects unknown or duplicated migration records: %s",
  (name) => {
    const f = fixture();
    migrateLocalDatabase(f.db);
    f.client
      .prepare("INSERT INTO __drizzle_migrations (hash,created_at,name) VALUES ('',0,?)")
      .run(name);
    const before = f.client.prepare("SELECT * FROM __drizzle_migrations").all();
    expect(() => migrateLocalDatabase(f.db)).toThrow("unsupported SQLite schema");
    expect(f.client.prepare("SELECT * FROM __drizzle_migrations").all()).toEqual(before);
  },
);

it("keeps Pi context identifiers, revisions and bodies constrained by SQLite", () => {
  const f = fixture();
  migrateLocalDatabase(f.db);
  for (const params of [
    ["one", 1.5, "{}"],
    ["two", 0, "{}"],
    [null, 1, "{}"],
    ["three", 1, new Uint8Array([1])],
  ])
    expect(() => f.client.prepare("INSERT INTO pi_contexts VALUES (?,?,?)").run(...params)).toThrow(
      /constraint/i,
    );
});

it("serializes fresh initialization across independent CLI processes", async () => {
  const f = fixture();
  const script = fileURLToPath(new URL("../../fixtures/sqlite/migrate.ts", import.meta.url));
  const children = Array.from({ length: 6 }, () =>
    spawnProcess([process.execPath, "--import", import.meta.resolve("tsx"), script, f.directory], {
      // The runner forces colors while CI may also set NO_COLOR; Node warns on that combination.
      env: { ...process.env, FORCE_COLOR: undefined },
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
    }),
  );
  const readers = children.map((child) => child.stdout.getReader());
  try {
    await Promise.all(
      readers.map(async (reader) => {
        expect(new TextDecoder().decode((await reader.read()).value)).toBe("ready\n");
      }),
    );
    await Promise.all(children.map((child) => Promise.resolve(child.stdin.end())));
    const results = await Promise.all(
      children.map(async (child, index) => {
        const output = async () => {
          const decoder = new TextDecoder();
          let text = "";
          for (;;) {
            const chunk = await readers[index]!.read();
            if (chunk.done) return text + decoder.decode();
            text += decoder.decode(chunk.value, { stream: true });
          }
        };
        const [stdout, stderr, code] = await Promise.all([
          output(),
          new Response(child.stderr).text(),
          child.exited,
        ]);
        expect(stderr).toBe("");
        expect(code).toBe(0);
        return JSON.parse(stdout) as { streamId: string; revision: number };
      }),
    );
    expect(new Set(results.map((result) => result.streamId)).size).toBe(1);
    expect(results.every((result) => result.revision === 0)).toBe(true);
    expect(f.client.prepare("SELECT count(*) AS count FROM __drizzle_migrations").get()).toEqual({
      count: migrations.length,
    });
  } finally {
    for (const child of children) child.kill();
    await Promise.all(children.map((child) => child.exited));
    for (const reader of readers) reader.releaseLock();
  }
}, 15_000);

it("opens the Bun baseline without changing its journal, projects, task history or instance key", () => {
  const root = directory(),
    path = join(root, "profile.sqlite");
  copyFileSync(
    fileURLToPath(new URL("../../fixtures/sqlite/baseline/profile.sqlite", import.meta.url)),
    path,
  );
  const client = new Database(path);
  try {
    const tables = [
      "__drizzle_migrations",
      "roots",
      "projects",
      "tasks",
      "meta",
      "agent_meta",
      "instance_credentials",
    ];
    const snapshot = () =>
      Object.fromEntries(
        tables.map((table) => [table, client.prepare(`SELECT * FROM ${table} ORDER BY 1`).all()]),
      );
    const before = snapshot();
    const database = drizzle({ client });
    migrateLocalDatabase(database);
    expect(snapshot()).toEqual(before);
    expect(before.__drizzle_migrations).toHaveLength(3);
    const agents = new AgentStore(database);
    expect(agents.get("00000000-0000-4000-8000-000000000002")?.task).toMatchObject({
      status: "succeeded",
      summary: "保留的任务结果",
    });
    expect(snapshot()).toEqual(before);
  } finally {
    client.close();
  }
});

it("rolls back nested writes to savepoints and rejects asynchronous transaction callbacks", () => {
  const { client, db } = fixture();
  client.exec("CREATE TABLE savepoint_probe(value TEXT)");
  db.transaction(() => {
    client.prepare("INSERT INTO savepoint_probe VALUES ('outer')").run();
    expect(() =>
      db.transaction(() => {
        client.prepare("INSERT INTO savepoint_probe VALUES ('nested')").run();
        throw new Error("nested failure");
      }),
    ).toThrow("nested failure");
    expect(client.prepare("SELECT value FROM savepoint_probe").all()).toEqual([{ value: "outer" }]);
  });
  expect(() =>
    // @ts-expect-error Exercise the runtime guard against untyped async callers.
    db.transaction(() => {
      client.prepare("INSERT INTO savepoint_probe VALUES ('async')").run();
      return Promise.resolve();
    }),
  ).toThrow("must be synchronous");
  expect(client.prepare("SELECT value FROM savepoint_probe").all()).toEqual([{ value: "outer" }]);
});
