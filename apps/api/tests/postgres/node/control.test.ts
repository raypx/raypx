import { afterAll, beforeAll, expect, it } from "vite-plus/test";
import { connectDatabase, migrateDatabase } from "@raypx/database";
import { user, session, account, controlEvent, controlOwner } from "@raypx/database/schema";
import { and, count, eq, sql } from "drizzle-orm";
import {
  controlListQuery,
  createControlRepository,
  eventWindowPrune,
} from "../../../server/control/repository.js";
import { ControlService } from "../../../server/control/service.js";
import { connected, controlAuth, humanRequest, running, observed } from "../../helpers/control.js";
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
    await tx
      .select({ userId: controlOwner.userId })
      .from(controlOwner)
      .where(eq(controlOwner.userId, auth.user.id))
      .for("update");
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
  await connection.db.insert(controlEvent).select(
    connection.db
      .select({
        id: sql<string>`'history-' || ${f.grant.deviceId} || '-' || n`.as("id"),
        userId: sql<string>`${auth.user.id}`.as("userId"),
        deviceId: sql<string>`${f.grant.deviceId}`.as("deviceId"),
        body: sql`jsonb_build_object('id', 'history-' || n, 'deviceId', ${f.grant.deviceId}::text, 'taskId', 'unrelated-' || n,
            'streamId', ${f.announce.streamId}::text, 'cursor', n, 'event', jsonb_build_object('kind','activity',
              'entry',jsonb_build_object('order',n,'text',repeat('x',1024))))`.as("body"),
      })
      .from(sql`generate_series(1,6000) n`),
  );
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
    expect((await service.getTask(auth.user.id, task.id, 0, 1)).activity).toEqual([]);
    expect((await service.getTask(auth.user.id, task.id, 0, 2)).activity).toEqual([entry]);
    await connection.db.execute(sql`analyze ${controlEvent}`);
    const activity = controlListQuery(connection.db, "event", auth.user.id, f.grant.deviceId, {
      taskId: task.id,
      activity: true,
      descending: true,
      limit: 65,
    });
    const rows = await connection.db.execute<{
      "QUERY PLAN": unknown;
    }>(sql`explain (analyze, format json) ${activity.getSQL()}`);
    const plan = JSON.stringify(rows[0]?.["QUERY PLAN"]);
    expect(plan).toContain("control_event_activity_idx");
    expect(plan).toContain('"Actual Rows":1');
    expect(plan).not.toContain('"Node Type":"Seq Scan"');
  } finally {
    await connection.db
      .delete(controlEvent)
      .where(
        and(eq(controlEvent.userId, auth.user.id), eq(controlEvent.deviceId, f.grant.deviceId)),
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
it("scopes observed summaries, excludes revoked devices and honors empty ID filters", async () => {
  const active = await connected(service, auth);
  const revoked = await connected(service, auth);
  const foreignDeviceId = crypto.randomUUID();
  const pending = {
    ...observed(active.input.projectId).request,
    id: crypto.randomUUID(),
    deviceId: active.grant.deviceId,
    status: "pending" as const,
    createdAt: "2026-10-27T09:00:00.000Z",
    expiresAt: "2026-10-27T11:00:00.000Z",
    body: "Private tool body",
    questions: [],
    decision: null,
  };
  const expired = {
    ...pending,
    id: crypto.randomUUID(),
    createdAt: "2026-10-27T09:30:00.000Z",
    expiresAt: "2026-10-27T09:45:00.000Z",
  };
  await repository.transaction(auth.user.id, async (tx) => {
    const device = await tx.get("device", revoked.grant.deviceId);
    await tx.put("device", { ...device!, revoked: true });
    await tx.put("observed_request", pending);
    await tx.put("observed_request", expired);
    await tx.put("observed_request", {
      ...pending,
      id: crypto.randomUUID(),
      deviceId: revoked.grant.deviceId,
    });
  });
  const activeDevice = await repository.read(auth.user.id, (tx) =>
    tx.get("device", active.grant.deviceId),
  );
  await repository.transaction(otherAuth.user.id, async (tx) => {
    await tx.put("device", {
      ...activeDevice!,
      id: foreignDeviceId,
      deviceId: foreignDeviceId,
      installationId: crypto.randomUUID(),
      revoked: false,
    });
    await tx.put("observed_request", { ...pending, deviceId: foreignDeviceId });
  });
  await repository.read(auth.user.id, async (tx) => {
    const summaries = await tx.observedSummaries({
      observedAt: "2026-10-27T10:00:00.000Z",
      limit: 2,
    });
    expect(summaries.map((row) => row.id)).toEqual([pending.id, expired.id]);
    for (const row of summaries) {
      expect(row).not.toHaveProperty("body");
      expect(row).not.toHaveProperty("questions");
      expect(row).not.toHaveProperty("decision");
    }
    expect(await tx.list("observed_request", undefined, { ids: [expired.id] })).toEqual([expired]);
    expect(await tx.list("observed_request", undefined, { ids: [] })).toEqual([]);
  });
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
  const f = await connected(service, auth),
    task = await running(service, f);
  const scope = and(
    eq(controlEvent.userId, auth.user.id),
    eq(controlEvent.deviceId, f.grant.deviceId),
  );
  const statusEvents = sql`${controlEvent.body}->'event'->>'kind'='status'`;
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
  await connection.db.insert(controlEvent).select(
    connection.db
      .select({
        id: sql<string>`'review-window-' || ${f.grant.deviceId} || '-' || n`.as("id"),
        userId: sql<string>`${auth.user.id}`.as("userId"),
        deviceId: sql<string>`${f.grant.deviceId}`.as("deviceId"),
        body: sql`jsonb_build_object('id','window-' || n,'deviceId',${f.grant.deviceId}::text,'taskId',${task.id}::text,'streamId',${f.announce.streamId}::text,'cursor',n,'event',jsonb_build_object('kind','status','summary',repeat('x',2048)))`.as(
          "body",
        ),
      })
      .from(sql`generate_series(2,5002) n`),
  );
  const rows = await connection.db.execute<{ "QUERY PLAN": unknown }>(
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
  const [remaining] = await connection.db
    .select({
      count: count(),
      bytes: sql`coalesce(sum(octet_length(${controlEvent.body}::text)),0)`.mapWith(Number),
    })
    .from(controlEvent)
    .where(
      and(scope, sql`${controlEvent.body}->'event'->>'kind' not in ('activity','activity_delta')`),
    );
  expect(remaining!.count).toBeLessThanOrEqual(4096);
  expect(remaining!.bytes).toBeLessThanOrEqual(8388608);
  // Independently exercise the row bound with tiny replay events.
  await connection.db.delete(controlEvent).where(and(scope, statusEvents));
  await connection.db.insert(controlEvent).select(
    connection.db
      .select({
        id: sql<string>`'row-window-' || ${f.grant.deviceId} || '-' || n`.as("id"),
        userId: sql<string>`${auth.user.id}`.as("userId"),
        deviceId: sql<string>`${f.grant.deviceId}`.as("deviceId"),
        body: sql`jsonb_build_object('streamId',${f.announce.streamId}::text,'cursor',n,'event',jsonb_build_object('kind','status'))`.as(
          "body",
        ),
      })
      .from(sql`generate_series(3,5003) n`),
  );
  await connection.db.execute(
    eventWindowPrune(auth.user.id, f.grant.deviceId, f.announce.streamId),
  );
  const [retained] = await connection.db
    .select({ count: count() })
    .from(controlEvent)
    .where(and(scope, statusEvents));
  expect(retained!.count).toBe(4096);
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

it("invalidates actual PostgreSQL credentials after password updates and security revocation", async () => {
  const host = await connected(service, auth);
  const key = await service.authorizeHost(auth, host.grant);
  const grant = await service.hostGrant(key.credential);
  const actor = await service.authenticate("device", grant.grant.token, crypto.randomUUID());
  const id = crypto.randomUUID();
  await connection.db.insert(account).values({
    id,
    accountId: auth.user.id,
    userId: auth.user.id,
    providerId: "credential",
    password: "synthetic-changed-password-hash",
  });
  await expect(service.hostGrant(key.credential)).rejects.toThrow("AUTH_REQUIRED");
  await expect(service.validate(actor)).rejects.toThrow("AUTH_REQUIRED");
  const next = await service.authorizeHost(auth, host.grant);
  await service.revokeHostAuthorizations(auth.user.id);
  await expect(service.hostGrant(next.credential)).rejects.toThrow("AUTH_REQUIRED");
  await expect(service.authorizeHost(auth, host.grant)).rejects.toThrow("AUTH_REQUIRED");
});

it("rejects invalid task projections at the repository boundary without rewriting them", async () => {
  const f = await connected(service, auth),
    task = await running(service, f);
  await connection.db.execute(
    sql`update raypx_foundation.control_task set body = body - 'status' where user_id=${auth.user.id} and id=${task.id}`,
  );
  await expect(repository.read(auth.user.id, (tx) => tx.get("task", task.id))).rejects.toThrow(
    "Invalid stored control data",
  );
  const rows = await connection.db.execute<{ missing: boolean }>(
    sql`select not (body ? 'status') as missing from raypx_foundation.control_task where user_id=${auth.user.id} and id=${task.id}`,
  );
  expect(rows[0]?.missing).toBe(true);
});

it("serializes one device while allowing another device projection for the same account", async () => {
  const first = await connected(service, auth),
    second = await connected(service, auth);
  const concurrent = connectDatabase(url, { max: 4 });
  const repo = createControlRepository(concurrent.db);
  const { promise: held, resolve: release } = Promise.withResolvers<void>();
  const { promise: ready, resolve: acquired } = Promise.withResolvers<void>();
  const writer = repo.deviceTransaction(auth.user.id, first.grant.deviceId, async (tx) => {
    const device = (await tx.get("device", first.grant.deviceId))!;
    acquired();
    await held;
    device.cursor++;
    await tx.put("device", device);
  });
  await ready;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let sameEntered = false;
  const same = repo.deviceTransaction(auth.user.id, first.grant.deviceId, async (tx) => {
    sameEntered = true;
    const device = (await tx.get("device", first.grant.deviceId))!;
    device.cursor++;
    await tx.put("device", device);
  });
  try {
    await Promise.race([
      repo.deviceTransaction(auth.user.id, second.grant.deviceId, async (tx) => {
        const device = (await tx.get("device", second.grant.deviceId))!;
        device.cursor++;
        await tx.put("device", device);
      }),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error("Independent device was serialized")), 3000);
      }),
    ]);
    expect(sameEntered).toBe(false);
  } finally {
    clearTimeout(timer);
    release();
    await Promise.all([writer, same]);
    await concurrent.close();
  }
  const values = await repository.read(auth.user.id, (tx) =>
    Promise.all([tx.get("device", first.grant.deviceId), tx.get("device", second.grant.deviceId)]),
  );
  expect(values.map((device) => device?.cursor)).toEqual([2, 1]);
});

it("keeps account revocation exclusive against device writes and rejects cross-device writes", async () => {
  const first = await connected(service, auth),
    second = await connected(service, auth);
  const concurrent = connectDatabase(url, { max: 4 });
  const repo = createControlRepository(concurrent.db),
    control = new ControlService(repo);
  const { promise: held, resolve: release } = Promise.withResolvers<void>();
  const { promise: ready, resolve: acquired } = Promise.withResolvers<void>();
  const writer = repo.deviceTransaction(auth.user.id, first.grant.deviceId, async (tx) => {
    acquired();
    await held;
    const device = (await tx.get("device", first.grant.deviceId))!;
    await tx.put("device", { ...device, cursor: device.cursor + 1 });
  });
  await ready;
  let revoked = false;
  const revocation = control.revoke(auth.user.id, first.grant).then(() => {
    revoked = true;
  });
  try {
    // A read from an independent connection can finish while the exclusive writer waits.
    const device = await repo.read(auth.user.id, (tx) => tx.get("device", first.grant.deviceId));
    expect(device?.revoked).toBe(false);
    expect(revoked).toBe(false);
  } finally {
    release();
    await Promise.all([writer, revocation]);
  }
  try {
    await expect(control.touch(first.actor)).rejects.toThrow("DEVICE_REVOKED");
    await control.touch(second.actor);
    await expect(
      repo.deviceTransaction(auth.user.id, first.grant.deviceId, async (tx) => {
        const device = (await tx.get("device", second.grant.deviceId))!;
        await tx.put("device", { ...device, revoked: true });
      }),
    ).rejects.toThrow("Device transaction scope mismatch");
    expect(
      (await repo.read(auth.user.id, (tx) => tx.get("device", second.grant.deviceId)))?.revoked,
    ).toBe(false);
  } finally {
    await concurrent.close();
  }
});
