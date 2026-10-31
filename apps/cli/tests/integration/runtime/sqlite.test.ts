import { profileStorage, removeProfileDirectory } from "../../helpers/sqlite";
import { afterEach, expect, it } from "vite-plus/test";
import { Database } from "bun:sqlite";
import { mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle, migrateLocalDatabase } from "../../../src/runtime/sqlite";
import migrations from "../../../src/runtime/sqlite/migrations.generated.json";
import { StateStore } from "../../../src/runtime/state";
import { AgentStore } from "../../../src/runtime/agents/store";
import { TerminalStore } from "../../../src/runtime/terminal/store";
import { SqliteContextRepository } from "../../../src/runtime/memory/repository";
import { SqlitePiContextStore } from "../../../src/runtime/agents/harness/context/sqlite";

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
  const client = new Database(path, { create: true, strict: true });
  cleanups.push(() => client.close());
  return { directory: root, path, client, db: drizzle({ client }) };
}

it("initializes the single profile migration once and reopens the recorded schema", () => {
  const f = fixture();
  migrateLocalDatabase(f.db);
  const applied = f.client.query("SELECT * FROM __drizzle_migrations").all();
  expect(applied).toHaveLength(1);
  const reopened = new Database(f.path);
  try {
    migrateLocalDatabase(drizzle({ client: reopened }));
    expect(reopened.query("SELECT * FROM __drizzle_migrations").all()).toEqual(applied);
  } finally {
    reopened.close();
  }
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
    expect(f.client.query("SELECT id FROM terminal_project").all()).toEqual([]);
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
    expect(f.client.query("SELECT id FROM terminal_project").get()).toEqual({ id: projectId });
    expect(f.client.query("SELECT id FROM documents").get()).toEqual({ id });
    expect(f.client.query("SELECT value FROM agent_meta WHERE id='stream'").get()).toEqual({
      value: agents.streamId,
    });
    expect(f.client.query("SELECT context_id FROM pi_contexts").get()).toEqual({
      context_id: "shared",
    });
    expect(f.client.query("SELECT count(*) AS count FROM __drizzle_migrations").get()).toEqual({
      count: 1,
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
  client.query("INSERT INTO roots VALUES (?,?)").run("invalid", JSON.stringify({ id: "invalid" }));
  client
    .query("INSERT INTO tasks VALUES (?,?)")
    .run(
      "invalid",
      JSON.stringify({ task: { id: "invalid" }, binding: "desktop:local", sessionId: null }),
    );
  expect(() => state.roots()).toThrow("Profile contains invalid stored data");
  expect(() => agents.get("invalid")).toThrow("Profile contains invalid stored data");
  expect(client.query("SELECT value FROM roots WHERE id='invalid'").get()).toEqual({
    value: JSON.stringify({ id: "invalid" }),
  });
});

it("rejects an unmanaged database without adopting or changing its data", () => {
  const f = fixture();
  f.client.exec("CREATE TABLE existing (value TEXT); INSERT INTO existing VALUES ('preserved');");
  expect(() => migrateLocalDatabase(f.db)).toThrow("unsupported SQLite schema");
  expect(f.client.query("SELECT * FROM existing").all()).toEqual([{ value: "preserved" }]);
  expect(f.client.query("SELECT name FROM sqlite_schema WHERE type='table'").all()).toEqual([
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
      .query<{ name: string }, []>("PRAGMA table_info('__drizzle_migrations')")
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
      .query("INSERT INTO __drizzle_migrations (hash,created_at,name) VALUES ('',0,?)")
      .run(name);
    const before = f.client.query("SELECT * FROM __drizzle_migrations").all();
    expect(() => migrateLocalDatabase(f.db)).toThrow("unsupported SQLite schema");
    expect(f.client.query("SELECT * FROM __drizzle_migrations").all()).toEqual(before);
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
    expect(() => f.client.query("INSERT INTO pi_contexts VALUES (?,?,?)").run(...params)).toThrow(
      /constraint/i,
    );
});

it("serializes fresh initialization across independent CLI processes", async () => {
  const f = fixture();
  const script = fileURLToPath(new URL("../../fixtures/sqlite/migrate.ts", import.meta.url));
  const children = Array.from({ length: 6 }, () =>
    Bun.spawn([process.execPath, script, f.directory], {
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
    expect(f.client.query("SELECT count(*) AS count FROM __drizzle_migrations").get()).toEqual({
      count: 1,
    });
  } finally {
    for (const child of children) child.kill();
    await Promise.all(children.map((child) => child.exited));
    for (const reader of readers) reader.releaseLock();
  }
}, 15_000);
