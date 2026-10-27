import { afterAll, afterEach, beforeAll, expect, it } from "vite-plus/test";
import { connectDatabase, migrateDatabase } from "@raypx/database";
import { controlCommand, controlTask, user } from "@raypx/database/schema";
import { and, eq, inArray, sql } from "drizzle-orm";
import {
  contextCommandPrune,
  createControlRepository,
} from "../../../server/control/repository.js";
import { cleanupExpired } from "../../../server/jobs/cleanup.js";

const url = process.env.TEST_DATABASE_URL;
if (!url || !new URL(url).pathname.endsWith("_test"))
  throw new Error("An isolated *_test database is required");
const connection = connectDatabase(url, { max: 1 });
const repository = createControlRepository(connection.db);
const owners: string[] = [];
const now = new Date();
const expired = new Date(now.getTime() - 2 * 86_400_000).toISOString();
const hash = "a".repeat(64);
const deviceId = "11111111-1111-4111-8111-111111111111";
function command(capturedAt = now.toISOString(), content = "Private reference") {
  const id = crypto.randomUUID();
  return {
    id,
    deviceId,
    capturedAt,
    requestHash: hash,
    request: {
      method: "tasks.create",
      input: {
        id,
        deviceId,
        projectId: crypto.randomUUID(),
        provider: "codex",
        mode: "run",
        prompt: "Private prompt",
      },
    },
    context: {
      capturedAt,
      sources: [
        {
          id: crypto.randomUUID(),
          revision: 1,
          kind: "memory",
          name: "Private name",
          content,
          scope: "account",
          project: null,
        },
      ],
    },
  };
}
async function fixture() {
  const owner = `commands-${crypto.randomUUID()}`;
  owners.push(owner);
  await connection.db
    .insert(user)
    .values({ id: owner, name: "Commands fixture", email: `${owner}@example.test` });
  return owner;
}
async function save(owner: string, record: object & { id: string }) {
  await connection.db
    .insert(controlCommand)
    .values({ id: record.id, userId: owner, deviceId, body: record });
}
async function body(owner: string, id: string) {
  return (
    await connection.db
      .select({ body: controlCommand.body })
      .from(controlCommand)
      .where(and(eq(controlCommand.userId, owner), eq(controlCommand.id, id)))
  )[0]?.body;
}
async function window(owner: string) {
  const [row] = await connection.db.execute<{
    count: number;
    bytes: number;
  }>(sql`select count(*)::integer as count,coalesce(sum(octet_length(body::text)),0)::integer as bytes
    from ${controlCommand} where user_id=${owner} and jsonb_typeof(body->'context')='object'`);
  return row!;
}
beforeAll(() => migrateDatabase(url));
afterEach(async () => {
  if (owners.length) await connection.db.delete(user).where(inArray(user.id, owners.splice(0)));
});
afterAll(() => connection.close());

it("compacts only this owner's expired full context and preserves unknown delivery receipts", async () => {
  const owner = await fixture(),
    stranger = await fixture();
  const old = command(expired),
    recent = command(),
    foreign = command(expired);
  const { capturedAt: _captured, requestHash: _hash, ...legacy } = command(expired);
  const unrelated = {
    id: crypto.randomUUID(),
    deviceId,
    request: { private: "Unrelated command" },
  };
  await save(owner, old);
  await save(owner, recent);
  await save(owner, legacy);
  await save(owner, unrelated);
  await save(stranger, foreign);
  await connection.db.insert(controlTask).values({
    id: old.id,
    userId: owner,
    deviceId,
    body: { id: old.id, context: { sources: [] } },
  });
  await repository.transaction(owner, (tx) => tx.pruneCommands(now));
  expect(await body(owner, old.id)).toEqual({
    id: old.id,
    deviceId,
    capturedAt: expired,
    requestHash: hash,
    compacted: true,
  });
  expect(await body(owner, legacy.id)).toEqual({
    id: legacy.id,
    deviceId,
    capturedAt: expired,
    compacted: true,
  });
  expect(await body(owner, recent.id)).toEqual(recent);
  expect(await body(owner, unrelated.id)).toEqual(unrelated);
  expect(await body(stranger, foreign.id)).toEqual(foreign);
  expect(
    await connection.db.select().from(controlTask).where(eq(controlTask.id, old.id)),
  ).toHaveLength(1);
  await repository.transaction(owner, (tx) => tx.pruneCommands(now));
  expect(await body(owner, old.id)).toEqual({
    id: old.id,
    deviceId,
    capturedAt: expired,
    requestHash: hash,
    compacted: true,
  });
});

it("keeps at most 4096 recent full commands after ordinary acceptance", async () => {
  const owner = await fixture(),
    sample = command();
  await connection.db.execute(sql`insert into ${controlCommand} (id,user_id,device_id,body)
    select 'count-'||lpad(n::text,5,'0'),${owner},${deviceId},${sample}::jsonb || jsonb_build_object('id','count-'||lpad(n::text,5,'0')) from generate_series(1,4097)n`);
  await repository.transaction(owner, (tx) => tx.pruneCommands(now));
  expect((await window(owner)).count).toBe(4096);
  expect(await body(owner, "count-00001")).toMatchObject({ compacted: true, requestHash: hash });
  await save(owner, { ...sample, id: "count-04098" });
  await repository.transaction(owner, (tx) => tx.pruneCommands(now));
  expect((await window(owner)).count).toBe(4096);
});

it("bounds real UTF-8 JSONB replay bytes as well as row count", async () => {
  const owner = await fixture(),
    sample = command(now.toISOString(), "界".repeat(6000));
  await connection.db.execute(sql`insert into ${controlCommand} (id,user_id,device_id,body)
    select 'bytes-'||n,${owner},${deviceId},${sample}::jsonb || jsonb_build_object('id','bytes-'||n) from generate_series(1,500)n`);
  expect((await window(owner)).bytes).toBeGreaterThan(8_388_608);
  await repository.transaction(owner, (tx) => tx.pruneCommands(now));
  const retained = await window(owner);
  expect(retained.bytes).toBeLessThanOrEqual(8_388_608);
  expect(retained.count).toBeLessThan(500);
});

it("drains legacy overflow in at most 1000 body changes per call, keeping each compact receipt", async () => {
  const owner = await fixture(),
    sample = command(expired);
  await connection.db.execute(sql`insert into ${controlCommand} (id,user_id,device_id,body)
    select 'legacy-'||n,${owner},${deviceId},${sample}::jsonb || jsonb_build_object('id','legacy-'||n) from generate_series(1,1001)n`);
  const [first] = await connection.db.execute<{ count: number }>(contextCommandPrune(now, owner));
  expect(first!.count).toBe(1000);
  expect((await window(owner)).count).toBe(1);
  const [second] = await connection.db.execute<{ count: number }>(contextCommandPrune(now, owner));
  expect(second!.count).toBe(1);
  const rows = await connection.db
    .select()
    .from(controlCommand)
    .where(eq(controlCommand.userId, owner));
  expect(rows).toHaveLength(1001);
  expect(rows.every((row) => Object.keys(row.body as object).length === 5)).toBe(true);
});

it("background cleanup counts only compacted old bodies and leaves active replay and receipts intact", async () => {
  const owner = await fixture(),
    sample = command(expired),
    active = command();
  await connection.db.execute(sql`insert into ${controlCommand} (id,user_id,device_id,body)
    select 'background-'||n,${owner},${deviceId},${sample}::jsonb || jsonb_build_object('id','background-'||n) from generate_series(1,1001)n`);
  await save(owner, active);
  expect((await cleanupExpired(connection.db)).contextCommands).toBe(1000);
  expect((await cleanupExpired(connection.db)).contextCommands).toBe(1);
  expect((await cleanupExpired(connection.db)).contextCommands).toBe(0);
  expect(await body(owner, active.id)).toEqual(active);
  expect(
    await connection.db.select().from(controlCommand).where(eq(controlCommand.userId, owner)),
  ).toHaveLength(1002);
});

it("uses partial indexes instead of scanning thousands of compact receipts", async () => {
  const owner = await fixture();
  await connection.db.execute(sql`insert into ${controlCommand} (id,user_id,device_id,body)
    select 'receipt-'||n,${owner},${deviceId},jsonb_build_object('id','receipt-'||n,'deviceId',${deviceId}::text,'compacted',true,'requestHash',${hash}::text,'capturedAt',${expired}::text) from generate_series(1,6000)n`);
  await save(owner, command(expired));
  await connection.db.execute(sql`analyze ${controlCommand}`);
  const plan = JSON.stringify(
    (
      await connection.db.execute<{ "QUERY PLAN": unknown }>(
        sql`explain (analyze,format json) ${contextCommandPrune(now, owner)}`,
      )
    )[0]?.["QUERY PLAN"],
  );
  expect(plan).toContain("control_command_context_owner_idx");
  expect(plan).not.toContain('"Node Type":"Seq Scan"');
  await save(owner, command(expired));
  await connection.db.execute(sql`analyze ${controlCommand}`);
  const background = JSON.stringify(
    (
      await connection.db.execute<{ "QUERY PLAN": unknown }>(
        sql`explain (analyze,format json) ${contextCommandPrune(sql`transaction_timestamp()`)}`,
      )
    )[0]?.["QUERY PLAN"],
  );
  expect(background).toMatch(/control_command_context_(owner|expiry)_idx/);
  expect(background).not.toContain('"Node Type":"Seq Scan"');
});
