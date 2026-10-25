import { afterAll, beforeAll, expect, it } from "vite-plus/test";
import { connectDatabase, migrateDatabase } from "@raypx/database";
import { user, session } from "@raypx/database/schema";
import { eq, sql } from "drizzle-orm";
import { createControlRepository } from "../../../server/control/repository.js";
import { ControlService } from "../../../server/control/service.js";
import { connected, controlAuth, humanRequest, running } from "../../helpers/control.js";
import { createApiApp } from "../../../server/api.js";
import { createApiClient } from "@raypx/client";

const url = process.env.TEST_DATABASE_URL;
if (!url || !new URL(url).pathname.endsWith("_test"))
  throw new Error("An isolated *_test database is required");
const connection = connectDatabase(url, { max: 1 });
const repository = createControlRepository(connection.db);
const service = new ControlService(repository);
const auth = controlAuth(`control-${crypto.randomUUID()}`);
const otherAuth = controlAuth(`other-${crypto.randomUUID()}`);
it("reads committed projections while a different connection holds the account write lock", async () => {
  const f = await connected(service, auth),
    task = await running(service, f);
  const otherConnection = connectDatabase(url, { max: 1 });
  let unlock!: () => void, acquired!: () => void;
  const held = new Promise<void>((resolve) => {
    unlock = resolve;
  });
  const ready = new Promise<void>((resolve) => {
    acquired = resolve;
  });
  const writer = otherConnection.db.transaction(async (tx) => {
    await tx.execute(
      sql`select user_id from raypx_foundation.control_owner where user_id=${auth.user.id} for update`,
    );
    acquired();
    await held;
  });
  await ready;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const result = await Promise.race([
      service.getTask(auth.user.id, task.id, 0),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error("Read waited for the owner write lock")), 3000);
      }),
    ]);
    expect(result.task.id).toBe(task.id);
  } finally {
    clearTimeout(timer);
    unlock();
    await writer;
    await otherConnection.close();
  }
});
it("uses bounded task indexes with thousands of unrelated conversation entries", async () => {
  const f = await connected(service, auth),
    task = await running(service, f);
  await connection.db
    .execute(sql`insert into raypx_foundation.control_event (id,user_id,device_id,body)
    select 'history-' || ${f.grant.deviceId} || '-' || n, ${auth.user.id}, ${f.grant.deviceId},
      jsonb_build_object('id', 'history-' || n, 'deviceId', ${f.grant.deviceId}::text, 'taskId', 'unrelated-' || n,
        'streamId', ${f.announce.streamId}::text, 'cursor', n, 'event', jsonb_build_object('kind','activity',
          'entry',jsonb_build_object('order',n,'text',repeat('x',1024))))
    from generate_series(1,6000) n`);
  const now = new Date().toISOString();
  const entry = {
    id: crypto.randomUUID(),
    taskId: task.id,
    kind: "message" as const,
    order: 1,
    revision: 1,
    text: "Target",
    status: "complete" as const,
    truncated: false,
    createdAt: now,
    updatedAt: now,
  };
  try {
    await service.events(f.actor, f.announce.streamId, [
      { sequence: 2, event: { id: crypto.randomUUID(), taskId: task.id, kind: "activity", entry } },
    ]);
    expect((await service.getTask(auth.user.id, task.id, 0)).activity).toEqual([entry]);
    await connection.db.execute(sql`analyze raypx_foundation.control_event`);
    const rows = await connection.db
      .execute(sql`explain (analyze, format json) select body from raypx_foundation.control_event
      where user_id=${auth.user.id} and device_id=${f.grant.deviceId} and body->>'taskId'=${task.id}
      and body->'event'->>'kind'='activity' order by ((body->'event'->'entry'->>'order')::bigint) desc limit 65`);
    const plan = JSON.stringify(rows[0]?.["QUERY PLAN"]);
    expect(plan).toContain("control_event_activity_idx");
    expect(plan).toContain('"Actual Rows":1');
    expect(plan).not.toContain('"Node Type":"Seq Scan"');
  } finally {
    await connection.db.execute(
      sql`delete from raypx_foundation.control_event where user_id=${auth.user.id} and device_id=${f.grant.deviceId}`,
    );
  }
});
beforeAll(async () => {
  await migrateDatabase(url);
  await connection.db.insert(user).values([auth.user, otherAuth.user]);
  await connection.db.insert(session).values({
    id: auth.session.id,
    userId: auth.user.id,
    token: crypto.randomUUID(),
    expiresAt: auth.session.expiresAt,
  });
});
afterAll(async () => {
  await connection.db.delete(user).where(eq(user.id, auth.user.id));
  await connection.db.delete(user).where(eq(user.id, otherAuth.user.id));
  await connection.close();
});
it("persists host projections across API instances and invalidates the device session", async () => {
  const f = await connected(service, auth),
    task = await running(service, f),
    request = humanRequest(task);
  const event = { id: crypto.randomUUID(), taskId: task.id, kind: "request" as const, request };
  await service.events(f.actor, f.announce.streamId, [{ sequence: 2, event }]);
  const otherInstance = new ControlService(createControlRepository(connection.db));
  expect((await otherInstance.listApprovals(auth.user.id))[0]?.id).toBe(request.id);
  await otherInstance.events(f.actor, f.announce.streamId, [{ sequence: 2, event }]);
  expect((await service.getTask(auth.user.id, task.id, 0)).events).toHaveLength(2);
  await expect(otherInstance.getTask(otherAuth.user.id, task.id, 0)).rejects.toMatchObject({
    code: "NOT_FOUND",
  });
  await connection.db.delete(session).where(eq(session.id, auth.session.id));
  await expect(service.validate(f.actor)).rejects.toMatchObject({ code: "AUTH_REQUIRED" });
});
it("uses real HTTP contracts for one-time relay tickets and rejects anonymous reads", async () => {
  await connection.db
    .insert(session)
    .values({
      id: auth.session.id,
      userId: auth.user.id,
      token: crypto.randomUUID(),
      expiresAt: auth.session.expiresAt,
    })
    .onConflictDoNothing();
  const app = createApiApp({
    control: service,
    authHandler: async () => new Response(null),
    readSession: async (headers) => (headers.get("cookie") === "signed-in" ? auth : null),
    allowedOrigins: [],
  });
  const client = createApiClient({
    baseUrl: "https://api.example.com",
    headers: { cookie: "signed-in" },
    fetch: async (input, init) => app.fetch(new Request(input, init)),
  });
  expect((await client.devices.list({})).length).toBeGreaterThan(0);
  const ticket = await client.relay.ticket({});
  await service.authenticate("viewer", ticket.token, crypto.randomUUID());
  await expect(
    service.authenticate("viewer", ticket.token, crypto.randomUUID()),
  ).rejects.toMatchObject({ code: "AUTH_REQUIRED" });
});

it("accepts malformed legacy Unicode at the repository boundary and continues acknowledging events", async () => {
  const f = await connected(service, auth),
    task = await running(service, f),
    now = new Date().toISOString();
  const entry = {
    id: crypto.randomUUID(),
    taskId: task.id,
    kind: "message" as const,
    order: 1,
    revision: 1,
    text: "x".repeat(31999) + "\ud83d",
    status: "streaming" as const,
    truncated: true,
    createdAt: now,
    updatedAt: now,
  };
  expect(
    await service.events(f.actor, f.announce.streamId, [
      { sequence: 2, event: { id: crypto.randomUUID(), taskId: task.id, kind: "activity", entry } },
    ]),
  ).toBe(2);
  expect((await service.getTask(auth.user.id, task.id, 0)).activity[0]).toMatchObject({
    text: "x".repeat(31999) + "�",
  });
  expect(
    await service.events(f.actor, f.announce.streamId, [
      {
        sequence: 3,
        event: {
          id: crypto.randomUUID(),
          taskId: task.id,
          kind: "status",
          status: "succeeded",
          summary: "\ude00\0",
        },
      },
    ]),
  ).toBe(3);
  expect((await service.getTask(auth.user.id, task.id, 0)).task.summary).toBe("��");
});

it("prunes the actual SQL replay window without evicting activity and pages tasks/approvals in SQL", async () => {
  const { eventWindowPrune } = await import("../../../server/control/repository.js");
  const f = await connected(service, auth),
    task = await running(service, f);
  const now = new Date().toISOString();
  const entry = {
    id: crypto.randomUUID(),
    taskId: task.id,
    kind: "message" as const,
    order: 1,
    revision: 1,
    text: "Preserved conversation",
    status: "complete" as const,
    truncated: false,
    createdAt: now,
    updatedAt: now,
  };
  await service.events(f.actor, f.announce.streamId, [
    { sequence: 2, event: { id: crypto.randomUUID(), taskId: task.id, kind: "activity", entry } },
  ]);
  await connection.db
    .execute(sql`insert into raypx_foundation.control_event (id,user_id,device_id,body)
    select 'review-window-' || ${f.grant.deviceId} || '-' || n, ${auth.user.id}, ${f.grant.deviceId},
      jsonb_build_object('id','window-' || n,'deviceId',${f.grant.deviceId}::text,'taskId',${task.id}::text,'streamId',${f.announce.streamId}::text,'cursor',n,'event',jsonb_build_object('kind','status','summary',repeat('x',2048))) from generate_series(2,5002) n`);
  const rows = await connection.db.execute(
    sql`explain (analyze, buffers, format json) ${eventWindowPrune(auth.user.id, f.grant.deviceId, f.announce.streamId)}`,
  );
  expect(JSON.stringify(rows)).toContain("WindowAgg");
  const plan = rows[0]!["QUERY PLAN"] as { "Execution Time": number; Plan: unknown }[];
  const windows: Record<string, unknown>[] = [];
  function visit(value: unknown) {
    if (!value || typeof value !== "object") return;
    if ("Node Type" in value && value["Node Type"] === "WindowAgg") windows.push(value);
    for (const child of Object.values(value)) visit(child);
  }
  visit(plan);
  expect(windows).toHaveLength(1);
  expect(windows[0]!["Actual Loops"]).toBe(1);
  console.info(
    "Replay prune EXPLAIN",
    JSON.stringify({
      milliseconds: plan[0]!["Execution Time"],
      rows: windows[0]!["Actual Rows"],
      loops: windows[0]!["Actual Loops"],
    }),
  );
  const remaining = await connection.db.execute(
    sql`select count(*)::int as count,coalesce(sum(octet_length(body::text)),0)::int as bytes from raypx_foundation.control_event where user_id=${auth.user.id} and device_id=${f.grant.deviceId} and body->'event'->>'kind' not in ('activity','activity_delta')`,
  );
  expect(Number(remaining[0]!.count)).toBeLessThanOrEqual(4096);
  expect(Number(remaining[0]!.bytes)).toBeLessThanOrEqual(8388608);
  // Independently exercise the row bound with tiny replay events.
  await connection.db.execute(
    sql`delete from raypx_foundation.control_event where user_id=${auth.user.id} and device_id=${f.grant.deviceId} and body->'event'->>'kind'='status'`,
  );
  await connection.db.execute(
    sql`insert into raypx_foundation.control_event (id,user_id,device_id,body) select 'row-window-' || ${f.grant.deviceId} || '-' || n,${auth.user.id},${f.grant.deviceId},jsonb_build_object('streamId',${f.announce.streamId}::text,'cursor',n,'event',jsonb_build_object('kind','status')) from generate_series(3,5003) n`,
  );
  await connection.db.execute(
    eventWindowPrune(auth.user.id, f.grant.deviceId, f.announce.streamId),
  );
  const count = await connection.db.execute(
    sql`select count(*)::int as count from raypx_foundation.control_event where user_id=${auth.user.id} and device_id=${f.grant.deviceId} and body->'event'->>'kind'='status'`,
  );
  expect(count[0]!.count).toBe(4096);
  expect((await service.getTask(auth.user.id, task.id, 5003)).activity).toEqual([entry]);
  const first = await service.listTasks(auth.user.id, { limit: 1 });
  expect(first).toHaveLength(1);
  expect(
    (
      await service.listTasks(auth.user.id, {
        limit: 1,
        before: `${first[0]!.createdAt}:${first[0]!.id}`,
      })
    ).every((item) => `${item.createdAt}:${item.id}` < `${first[0]!.createdAt}:${first[0]!.id}`),
  ).toBe(true);
  const request = humanRequest(task);
  await repository.transaction(auth.user.id, (tx) =>
    tx.put("request", { ...request, deviceId: task.deviceId }),
  );
  expect((await service.listApprovals(auth.user.id)).some((item) => item.id === request.id)).toBe(
    true,
  );
});
