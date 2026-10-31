import { afterEach, expect, it } from "vite-plus/test";
import { Database } from "bun:sqlite";
import { mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  SqlitePiContextStore,
  PI_CONTEXT_MAX_BYTES,
  PiContextStoreError,
} from "../../../../src/runtime/agents/harness/context/sqlite";
import { PiRunner, type PiContext } from "../../../../src/runtime/agents/harness/providers/pi";
import { piMessage, piModel, piScript, piTool } from "../../../helpers/pi";

const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0).reverse()) cleanup();
});
function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "raypx-pi-store-"));
  cleanups.push(() => rmSync(directory, { recursive: true, force: true }));
  const path = join(directory, "profile.sqlite");
  const open = (id = "one") => {
    const store = new SqlitePiContextStore(directory, id);
    cleanups.push(() => store.close());
    return store;
  };
  return { path, directory, open };
}
const idle = () => ({ status: "idle" as const, messages: [] });

it("isolates context ids, retains revisions on reopen and returns independent snapshots", async () => {
  const f = fixture(),
    first = f.open("one"),
    second = f.open("two");
  expect(await first.load()).toEqual({ revision: 0, ...idle() });
  const message = piMessage([{ type: "text", text: "Completed" }]);
  expect(await first.commit(0, { status: "succeeded", messages: [message] })).toBe(1);
  expect(await second.load()).toEqual({ revision: 0, ...idle() });
  expect(await second.commit(0, { status: "failed", messages: [] })).toBe(1);
  first.close();
  second.close();
  const reopened = f.open("one");
  const snapshot = await reopened.load();
  expect(snapshot).toEqual({ revision: 1, status: "succeeded", messages: [message] });
  snapshot.messages.length = 0;
  expect((await reopened.load()).messages).toHaveLength(1);
  expect((await f.open("two").load()).status).toBe("failed");
});

it.skipIf(process.platform === "win32")(
  "protects the transcript database with private POSIX permissions",
  () => {
    const f = fixture();
    f.open();
    expect(statSync(f.path).mode & 0o777).toBe(0o600);
  },
);

it("atomically rejects stale compare-and-swap writes from a second connection", async () => {
  const f = fixture(),
    left = f.open(),
    right = f.open();
  expect((await left.load()).revision).toBe(0);
  expect((await right.load()).revision).toBe(0);
  const writes = await Promise.allSettled([
    left.commit(0, { status: "running", messages: [] }),
    right.commit(0, { status: "succeeded", messages: [] }),
  ]);
  expect(writes.filter((result) => result.status === "fulfilled")).toHaveLength(1);
  const rejected = writes.find((result) => result.status === "rejected");
  expect(rejected).toMatchObject({
    reason: { code: "PI_STORE_CONFLICT", message: "PI_STORE_CONFLICT" },
  });
  const winner = await left.load();
  expect(winner.revision).toBe(1);
  expect(await right.commit(1, { status: "cancelled", messages: [] })).toBe(2);
  expect((await left.load()).status).toBe("cancelled");
});

it("loads a successful transcript after the writing process exits and continues with a new prompt", async () => {
  const f = fixture();
  const module = fileURLToPath(
    new URL("../../../../src/runtime/agents/harness/context/sqlite.ts", import.meta.url),
  );
  const source = `import { SqlitePiContextStore } from ${JSON.stringify(module)};
    const store = new SqlitePiContextStore(process.argv[1], "restart");
    await store.commit(0, {status:"succeeded",messages:[{role:"user",content:"Previous turn",timestamp:1}]});
    store.close();`;
  const child = Bun.spawn([process.execPath, "-e", source, f.directory], {
    stdout: "ignore",
    stderr: "pipe",
  });
  expect(await child.exited).toBe(0);
  const store = f.open("restart"),
    script = piScript([piMessage([{ type: "text", text: "Continued" }])]);
  expect(await store.load()).toMatchObject({
    revision: 1,
    messages: [{ role: "user", content: "Previous turn" }],
  });
  const runner = new PiRunner({
    model: piModel,
    stream: script.stream,
    tools: [],
    authorize: async () => "allow",
    store,
  });
  expect(await runner.run("Next turn")).toMatchObject({ status: "succeeded", text: "Continued" });
  expect(
    (await store.load()).messages
      .filter((message) => message.role === "user")
      .map((message) =>
        typeof message.content === "string"
          ? message.content
          : message.content
              .filter((part) => part.type === "text")
              .map((part) => part.text)
              .join("\n"),
      ),
  ).toEqual(["Previous turn", "Next turn"]);
  expect(script.calls).toBe(1);
});

it("round-trips the actual SDK system/tool transcript and continues after reopening it", async () => {
  const f = fixture(),
    store = f.open();
  const script = piScript([
    piMessage(
      [{ type: "toolCall", id: "effect-one", name: "fixture_tool", arguments: { value: "one" } }],
      "toolUse",
    ),
    piMessage([{ type: "text", text: "Effect committed" }]),
  ]);
  let effects = 0;
  const tools = [
    piTool(async () => {
      effects++;
      return { content: [{ type: "text" as const, text: "Done" }], details: { recorded: true } };
    }),
  ];
  const runner = new PiRunner({
    model: piModel,
    stream: script.stream,
    tools,
    authorize: async () => "allow",
    store,
  });
  expect(await runner.run("Run tool")).toMatchObject({ status: "succeeded" });
  expect((await store.load()).messages.some((message) => message.role === "system")).toBe(true);
  expect((await store.load()).messages.some((message) => message.role === "toolResult")).toBe(true);
  store.close();
  const resumed = new PiRunner({
    model: piModel,
    store: f.open(),
    tools,
    authorize: async () => "allow",
    stream: piScript([piMessage([{ type: "text", text: "Continued without replay" }])]).stream,
  });
  expect(await resumed.run("Continue")).toMatchObject({
    status: "succeeded",
    text: "Continued without replay",
  });
  expect(effects).toBe(1);
});

it.each([
  { status: "running" as const },
  { status: "uncertain" as const },
  { status: "failed" as const, pendingEffect: { id: "unknown", name: "fixture_tool" } },
])("never replays a persisted $status execution or an unresolved effect", async (state) => {
  const f = fixture(),
    writer = f.open();
  await writer.commit(0, { ...state, messages: [] });
  writer.close();
  const reopened = f.open();
  let calls = 0;
  const runner = new PiRunner({
    model: piModel,
    store: reopened,
    tools: [],
    authorize: async () => "allow",
    stream: () => {
      calls++;
      throw new Error("Inference must not start");
    },
  });
  expect(await runner.run("Continue")).toMatchObject({ code: "PI_RECOVERY_REQUIRED" });
  expect(calls).toBe(0);
  expect(await reopened.load()).toEqual({ ...state, revision: 1, messages: [] });
});

it("checks the UTF-8 JSON budget before changing any persisted state", async () => {
  const f = fixture(),
    store = f.open();
  const record = {
    status: "succeeded" as const,
    messages: [{ role: "user" as const, content: "", timestamp: 1 }],
  };
  const overhead = Buffer.byteLength(JSON.stringify(record));
  record.messages[0]!.content = "x".repeat(PI_CONTEXT_MAX_BYTES - overhead);
  expect(await store.commit(0, record)).toBe(1);
  record.messages[0]!.content += "x";
  await expect(store.commit(1, record)).rejects.toMatchObject({ code: "PI_CONTEXT_TOO_LARGE" });
  record.messages[0]!.content = "中".repeat(Math.floor(PI_CONTEXT_MAX_BYTES / 3));
  await expect(store.commit(1, record)).rejects.toMatchObject({ code: "PI_CONTEXT_TOO_LARGE" });
  expect((await store.load()).revision).toBe(1);
});

it("validates context and message structure without dropping unknown fields or replacing good data", async () => {
  const f = fixture(),
    store = f.open();
  await store.commit(0, idle());
  const invalid: unknown[] = [
    { status: "idle", messages: [], credential: "private" },
    { status: "unknown", messages: [] },
    { status: "idle", messages: [{ role: "user", content: 7, timestamp: 1 }] },
    { status: "idle", messages: [{ role: "user", content: "private", timestamp: NaN }] },
    { status: "idle", messages: [{ ...piMessage([]), usage: { input: 1 } }] },
    { status: "idle", messages: [], pendingEffect: { id: "", name: "tool" } },
  ];
  for (const context of invalid)
    await expect(store.commit(1, context as Omit<PiContext, "revision">)).rejects.toMatchObject({
      code: "PI_CONTEXT_INVALID",
      message: "PI_CONTEXT_INVALID",
    });
  expect(await store.load()).toEqual({ revision: 1, ...idle() });
  for (const revision of [-1, 0.5, NaN, Number.MAX_SAFE_INTEGER])
    await expect(store.commit(revision, idle())).rejects.toMatchObject({
      code: "PI_CONTEXT_INVALID",
    });
});

it.each([
  "invalid json with private detail",
  JSON.stringify({ status: "succeeded", messages: [{ role: "private" }] }),
])("refuses corrupted stored JSON and never overwrites it during commit", async (value) => {
  const f = fixture(),
    store = f.open();
  await store.commit(0, idle());
  store.close();
  const database = new Database(f.path);
  database.query("UPDATE pi_contexts SET value=? WHERE context_id='one'").run(value);
  database.close();
  const reopened = f.open();
  await expect(reopened.load()).rejects.toMatchObject({
    code: "PI_CONTEXT_INVALID",
    message: "PI_CONTEXT_INVALID",
  });
  await expect(reopened.commit(1, idle())).rejects.toMatchObject({ code: "PI_CONTEXT_INVALID" });
});

it("rejects oversized stored JSON before returning its body", async () => {
  const f = fixture(),
    store = f.open();
  await store.commit(0, idle());
  store.close();
  const database = new Database(f.path);
  database
    .query("UPDATE pi_contexts SET value=? WHERE context_id='one'")
    .run("x".repeat(PI_CONTEXT_MAX_BYTES + 1));
  database.close();
  await expect(f.open().load()).rejects.toMatchObject({ code: "PI_CONTEXT_TOO_LARGE" });
});

it("sanitizes real SQLite write failures and preserves the recovery fence", async () => {
  const f = fixture(),
    store = f.open();
  await store.commit(0, {
    status: "running",
    messages: [],
    pendingEffect: { id: "effect", name: "tool" },
  });
  const database = new Database(f.path);
  database.exec(
    "CREATE TRIGGER fail_commit BEFORE UPDATE ON pi_contexts BEGIN SELECT RAISE(ABORT,'private database detail'); END;",
  );
  database.close();
  await expect(store.commit(1, { status: "succeeded", messages: [] })).rejects.toMatchObject({
    code: "PI_STORE_UNAVAILABLE",
    message: "PI_STORE_UNAVAILABLE",
  });
  expect(await store.load()).toMatchObject({
    revision: 1,
    status: "running",
    pendingEffect: { id: "effect" },
  });
});

it("can read the final safe revision and refuses an overflowing write", async () => {
  const f = fixture(),
    store = f.open();
  await store.commit(0, idle());
  const database = new Database(f.path);
  database
    .query("UPDATE pi_contexts SET revision=? WHERE context_id='one'")
    .run(Number.MAX_SAFE_INTEGER - 1);
  database.close();
  expect(await store.commit(Number.MAX_SAFE_INTEGER - 1, idle())).toBe(Number.MAX_SAFE_INTEGER);
  expect((await store.load()).revision).toBe(Number.MAX_SAFE_INTEGER);
  await expect(store.commit(Number.MAX_SAFE_INTEGER, idle())).rejects.toMatchObject({
    code: "PI_CONTEXT_INVALID",
  });
});

it("has an idempotent caller-owned close and sanitized input/open errors", async () => {
  const f = fixture(),
    store = f.open();
  store.close();
  store.close();
  await expect(store.load()).rejects.toMatchObject({ code: "PI_STORE_CLOSED" });
  await expect(store.commit(0, idle())).rejects.toMatchObject({ code: "PI_STORE_CLOSED" });
  expect(() => new SqlitePiContextStore("relative.sqlite", "one")).toThrow(PiContextStoreError);
  expect(() => new SqlitePiContextStore(f.directory, "")).toThrow("PI_CONTEXT_INVALID");
  expect(() => new SqlitePiContextStore(join(f.path, "private", "context.sqlite"), "one")).toThrow(
    "PI_STORE_UNAVAILABLE",
  );
});
