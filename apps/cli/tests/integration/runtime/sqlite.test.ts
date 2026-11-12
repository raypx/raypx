import { profileStorage, removeProfileDirectory } from "../../helpers/sqlite.js";
import { afterEach, expect, it } from "vitest";
import { Database } from "bun:sqlite";
import { copyFileSync, mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle, migrateLocalDatabase } from "../../../src/runtime/sqlite/index.js";
import migrations from "../../../src/runtime/sqlite/migrations.generated.json";
import { InstanceRuntime } from "../../../src/runtime/instances/index.js";
import { instanceKeys } from "../../../src/runtime/instances/keys.js";
import { StateStore } from "../../../src/runtime/state/index.js";
import { AgentStore } from "../../../src/runtime/agents/store.js";
import { TerminalStore } from "../../../src/runtime/terminal/store.js";
import { SqliteContextRepository } from "../../../src/runtime/memory/repository.js";
import { SqlitePiContextStore } from "../../../src/runtime/agents/harness/context/sqlite.js";

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

it("applies each embedded profile migration once and reopens the recorded schema", () => {
  const f = fixture();
  migrateLocalDatabase(f.db);
  const applied = f.client.query("SELECT * FROM __drizzle_migrations").all();
  expect(applied).toHaveLength(migrations.length);
  const reopened = new Database(f.path);
  try {
    migrateLocalDatabase(drizzle({ client: reopened }));
    expect(reopened.query("SELECT * FROM __drizzle_migrations").all()).toEqual(applied);
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
  expect(f.client.query("SELECT count(*) AS count FROM task_events").get()).toEqual({ count: 0 });
  expect(f.client.query("SELECT count(*) AS count FROM task_effects").get()).toEqual({ count: 0 });
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
      count: migrations.length,
    });
  } finally {
    for (const child of children) child.kill();
    await Promise.all(children.map((child) => child.exited));
    for (const reader of readers) reader.releaseLock();
  }
}, 15_000);

for (const baseline of ["baseline", "node-baseline"]) {
  it(`opens and preserves the ${baseline} profile through Bun writes, rollback and reopen`, async () => {
    const target = directory();
    copyFileSync(
      fileURLToPath(new URL(`../../fixtures/sqlite/${baseline}/profile.sqlite`, import.meta.url)),
      join(target, "profile.sqlite"),
    );
    if (baseline === "node-baseline")
      for (const name of ["instance-id", "instance.json"])
        copyFileSync(
          fileURLToPath(new URL(`../../fixtures/sqlite/node-baseline/${name}`, import.meta.url)),
          join(target, name),
        );
    const snapshot = (client: Database) =>
      Object.fromEntries(
        [
          "__drizzle_migrations",
          "roots",
          "tasks",
          "instance_credentials",
          "host_authorizations",
        ].map((table) => [table, client.query(`SELECT * FROM "${table}" ORDER BY rowid`).all()]),
      );
    const before = new Database(join(target, "profile.sqlite"), { readwrite: true, create: false });
    let expected: ReturnType<typeof snapshot>;
    try {
      // WAL snapshots may need writable auxiliary files; keep SQL reads only.
      before.exec("PRAGMA query_only = ON");
      expected = snapshot(before);
    } finally {
      before.close();
    }
    const storage = profileStorage(target);
    const migratedLedger = storage.database.$client
      .query<
        { id: number; name: string; hash: string; created_at: number; applied_at: string },
        []
      >("SELECT * FROM __drizzle_migrations ORDER BY id")
      .all();
    // A current schema may append migrations to the immutable baseline. Every
    // old ledger row and business record must remain byte-for-byte unchanged.
    expect(migratedLedger.slice(0, expected.__drizzle_migrations!.length)).toEqual(
      expected.__drizzle_migrations,
    );
    expect(migratedLedger).toEqual(
      migrations.map((migration, index) => ({
        id: index + 1,
        name: migration.name,
        hash: "",
        created_at: migration.timestamp,
        applied_at: expect.any(String),
      })),
    );
    expect(storage.database.$client.query("SELECT * FROM desktop_sessions").all()).toEqual([]);
    expected = { ...expected, __drizzle_migrations: migratedLedger };
    expect(snapshot(storage.database.$client)).toEqual(expected);
    if (baseline === "node-baseline") {
      const instance = new InstanceRuntime(target, { keys: instanceKeys(storage.database) });
      await instance.assert();
    }
    const state = new StateStore(storage);
    expect(() =>
      storage.database.transaction(() => {
        state.putRoot({
          id: "00000000-0000-4000-8000-000000000010",
          name: "Rollback",
          path: target,
          createdAt: new Date().toISOString(),
        });
        throw new Error("rollback");
      }),
    ).toThrow("rollback");
    expect(snapshot(storage.database.$client)).toEqual(expected);
    state.putRoot({
      id: "00000000-0000-4000-8000-000000000010",
      name: "Bun write",
      path: target,
      createdAt: new Date().toISOString(),
    });
    storage.close();
    const reopened = profileStorage(target);
    const actual = snapshot(reopened.database.$client);
    expect(reopened.database.$client.query("SELECT * FROM desktop_sessions").all()).toEqual([]);
    expect(actual.__drizzle_migrations).toEqual(expected.__drizzle_migrations);
    expect(actual.tasks).toEqual(expected.tasks);
    expect(actual.instance_credentials).toEqual(expected.instance_credentials);
    expect(actual.host_authorizations).toEqual(expected.host_authorizations);
    expect(actual.roots).toHaveLength((expected.roots?.length ?? 0) + 1);
    expect(actual.roots).toEqual(expect.arrayContaining(expected.roots!));
    if (baseline === "node-baseline")
      await new InstanceRuntime(target, { keys: instanceKeys(reopened.database) }).assert();
    reopened.close();
  });
}
