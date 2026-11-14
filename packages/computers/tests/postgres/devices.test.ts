import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import { connectDatabase, migrateDatabase } from "@raypx/database";
import {
  agents,
  computers,
  conversations,
  conversationMessages,
  conversationRuns,
  deviceComputers,
  deviceDirectoryGrants,
  deviceSpaceDevices,
  spaceAudit,
  spaceMembers,
  spaces,
  user,
} from "@raypx/database/schema";
import { createSpaceAccess } from "@raypx/spaces/server/postgres";
import type { DeviceConnectorRequest } from "@raypx/contracts/device-connector";
import { createDeviceComputersRepository } from "../../src/server/devices-postgres.js";
import { createDeviceMemberFilesRepository } from "../../src/server/member-files.js";

const url = process.env.TEST_DATABASE_URL;
if (!url || !/_test(?:_[a-z0-9]+)?$/.test(new URL(url).pathname))
  throw new Error("A freshly created disposable test database is required");
const connection = connectDatabase(url);
const access = createSpaceAccess(connection.db);
const owner = `device-owner-${crypto.randomUUID()}`;
const other = `device-other-${crypto.randomUUID()}`;
const owned: string[] = [];
let clock = Date.now();
const origin = "http://127.0.0.1:4010";
const repository = createDeviceComputersRepository(connection.db, origin, () => new Date(clock));
beforeEach(() => {
  clock = Date.now();
});
beforeAll(async () => {
  await migrateDatabase(url);
  await connection.db
    .insert(user)
    .values(
      [owner, other].map((id) => ({ id, name: "Device fixture", email: `${id}@example.test` })),
    );
});
afterAll(async () => {
  try {
    await connection.db.delete(computers).where(inArray(computers.spaceId, owned));
    await connection.db.delete(spaces).where(inArray(spaces.id, owned));
    await connection.db.delete(user).where(inArray(user.id, [owner, other]));
  } finally {
    await connection.close();
  }
});
async function createSpace() {
  const { space } = await access.create(owner, { name: "Device fixture" });
  owned.push(space.id);
  return access.resolve(owner, space.id);
}
async function fixture() {
  const scope = await createSpace();
  await connection.db
    .insert(spaceMembers)
    .values({ spaceId: scope.spaceId, accountId: other, role: "member" });
  const pair = await repository.createPairing(scope);
  const claim = await repository.claim({
    code: pair.code,
    deviceName: "Fixture machine",
    platform: "darwin",
  });
  const credential = await repository.confirm(claim);
  const identity = await repository.authenticate(credential.credential);
  const connected = await repository.connect(identity, "fixture-node");
  await repository.ready(connected, "fixture-node");
  const grant = await repository.grant(connected, {
    spaceId: scope.spaceId,
    directory: "/fixture/workspace",
  });
  const conversationId = crypto.randomUUID();
  const agentId = crypto.randomUUID();
  await connection.db.insert(agents).values({
    spaceId: scope.spaceId,
    id: agentId,
    name: "Device helper",
    modelId: "fixture",
    instructions: "",
  });
  await connection.db
    .insert(conversations)
    .values({ spaceId: scope.spaceId, id: conversationId, agentId, kind: "direct" });
  await repository.select(scope, conversationId, {
    deviceId: connected.deviceId,
    grantId: grant.id,
  });
  let messageSequence = 0;
  async function run(
    memberAccountId = owner,
    parentRunId?: string,
    trigger = "message",
    state: "running" | "succeeded" = "running",
  ) {
    const id = crypto.randomUUID();
    const messageId = crypto.randomUUID();
    const sequence = ++messageSequence;
    await connection.db.insert(conversationMessages).values({
      spaceId: scope.spaceId,
      conversationId,
      id: messageId,
      sequence,
      authorAccountId: memberAccountId,
      idempotencyKey: id,
      text: "Fixture request",
    });
    const [row] = await connection.db
      .insert(conversationRuns)
      .values({
        spaceId: scope.spaceId,
        conversationId,
        id,
        agentId,
        messageId,
        messageSequence: sequence,
        memberAccountId,
        modelId: "fixture",
        instructions: "",
        trigger,
        ...(parentRunId ? { parentRunId } : {}),
        state,
        fence: 1,
        leaseOwner: "fixture-node",
        leaseExpiresAt: new Date(clock + 60_000),
        computerId: grant.id,
        computerGeneration: 1,
        startedAt: new Date(clock),
      })
      .returning();
    return row!;
  }
  return { scope, connected, grant, conversationId, run, credential };
}
it("admits only owner member reads, rechecks grants after the response and rejects offline devices", async () => {
  const f = await fixture();
  const files = createDeviceMemberFilesRepository(connection.db, origin);
  const selection = { deviceId: f.connected.deviceId, grantId: f.grant.id };
  const read = await files.prepare(f.scope, selection, {
    kind: "read",
    path: "notes.txt",
    maxBytes: 64,
  });
  expect(read.request).toMatchObject({
    accountId: owner,
    grantRevision: f.grant.revision,
    operation: { kind: "read", maxBytes: 64 },
  });
  expect(read.request).not.toHaveProperty("runId");
  await files.complete(f.connected, read.request.id, {
    kind: "read",
    bytes: "YQ==",
    size: 1,
    truncated: false,
  });
  expect(await files.take(f.scope, read.request.id)).toMatchObject({ kind: "read", bytes: "YQ==" });
  const otherScope = await access.resolve(other, f.scope.spaceId);
  await expect(
    files.prepare(otherScope, selection, { kind: "list", path: ".", limit: 100 }),
  ).rejects.toThrow("ACCESS_DENIED");
  await expect(
    files.prepare(f.scope, selection, { kind: "read", path: "../secret", maxBytes: 64 }),
  ).rejects.toThrow("INVALID_INPUT");
  await repository.revokeGrant(f.connected, f.scope.spaceId, f.grant.id);
  await expect(files.take(f.scope, read.request.id)).rejects.toThrow("DEVICE_REVOKED");
  await files.remove(f.scope, read.request.id);
  const offline = await fixture();
  await repository.disconnect(offline.connected, "fixture-node");
  await expect(
    files.prepare(
      offline.scope,
      { deviceId: offline.connected.deviceId, grantId: offline.grant.id },
      { kind: "list", path: ".", limit: 100 },
    ),
  ).rejects.toThrow("DEVICE_OFFLINE");
});
it("expires one-time pairing codes and rejects claim and confirmation replay", async () => {
  const scope = await createSpace();
  const pair = await repository.createPairing(scope);
  clock += 300_001;
  await expect(repository.claim({ code: pair.code, deviceName: "Late" })).rejects.toThrow(
    "PAIRING_EXPIRED",
  );
  clock = Date.now();
  const live = await repository.createPairing(scope);
  const claim = await repository.claim({ code: live.code, deviceName: "Fixture" });
  await expect(repository.claim({ code: live.code, deviceName: "Replay" })).rejects.toThrow(
    "PAIRING_USED",
  );
  await repository.confirm(claim);
  await expect(repository.confirm(claim)).rejects.toThrow("PAIRING_USED");
});
it("rotates credentials at connection readiness and fences old connections", async () => {
  const f = await fixture();
  await expect(repository.authenticate(f.credential.credential)).rejects.toThrow("ACCESS_DENIED");
  const identity = await repository.authenticate(f.connected.credential.credential);
  const next = await repository.connect(identity, "replacement");
  expect(next.connectionFence).toBeGreaterThan(f.connected.connectionFence);
  await repository.ready(next, "replacement");
  await expect(repository.heartbeat(f.connected, "fixture-node")).rejects.toThrow("DEVICE_REVOKED");
  await repository.disconnect(f.connected, "fixture-node");
  expect((await repository.list(f.scope))[0]?.connected).toBe(true);
  clock += 15_001;
  await expect(repository.heartbeat(next, "replacement")).rejects.toThrow("DEVICE_REVOKED");
});
it("preserves the actually presented credential across repeated lost rotation welcomes", async () => {
  const scope = await createSpace();
  const pair = await repository.createPairing(scope);
  const claim = await repository.claim({ code: pair.code, deviceName: "Rotation fixture" });
  const initial = await repository.confirm(claim);
  const first = await repository.connect(
    await repository.authenticate(initial.credential),
    "lost-first",
  );
  const second = await repository.connect(
    await repository.authenticate(initial.credential),
    "lost-second",
  );
  const third = await repository.connect(
    await repository.authenticate(initial.credential),
    "received",
  );
  expect([first.connectionFence, second.connectionFence, third.connectionFence]).toEqual([1, 2, 3]);
  await expect(repository.authenticate(second.credential.credential)).rejects.toThrow(
    "ACCESS_DENIED",
  );
  await repository.ready(third, "received");
  await expect(repository.authenticate(initial.credential)).rejects.toThrow("ACCESS_DENIED");
  await expect(repository.authenticate(third.credential.credential)).resolves.toMatchObject({
    deviceId: initial.deviceId,
    accountId: owner,
  });
});
it("isolates members, Spaces and server origins, including direct same-Space foreign keys", async () => {
  const f = await fixture();
  const second = await createSpace();
  const otherScope = await access.resolve(other, f.scope.spaceId);
  expect(await repository.list(otherScope)).toEqual([]);
  await expect(
    repository.select(otherScope, f.conversationId, {
      deviceId: f.connected.deviceId,
      grantId: f.grant.id,
    }),
  ).rejects.toThrow("NOT_FOUND");
  const elsewhere = createDeviceComputersRepository(connection.db, "http://127.0.0.1:4999");
  expect(await elsewhere.list(f.scope)).toEqual([]);
  await expect(elsewhere.authenticate(f.connected.credential.credential)).rejects.toThrow(
    "ACCESS_DENIED",
  );
  await expect(
    connection.db.insert(deviceDirectoryGrants).values({
      spaceId: second.spaceId,
      id: crypto.randomUUID(),
      deviceId: f.connected.deviceId,
      accountId: owner,
      directory: "/escape",
    }),
  ).rejects.toThrow(/foreign key|Failed query/i);
  expect(await repository.list(second)).toEqual([]);
});
it.each(["message", "routine"])("refuses another member's %s Run", async (trigger) => {
  const f = await fixture();
  const run = await f.run(other, undefined, trigger);
  await expect(
    repository.admit({
      spaceId: f.scope.spaceId,
      conversationId: f.conversationId,
      runId: run.id,
      runFence: 1,
      requesterAccountId: owner,
      deviceId: f.connected.deviceId,
      grantId: f.grant.id,
    }),
  ).rejects.toThrow("ACCESS_DENIED");
});
it("validates the delegated root requester and every current lease fence", async () => {
  const f = await fixture();
  const root = await f.run(other, undefined, "message", "succeeded");
  const child = await f.run(owner, root.id);
  const context = {
    spaceId: f.scope.spaceId,
    conversationId: f.conversationId,
    runId: child.id,
    runFence: 1,
    requesterAccountId: owner,
    deviceId: f.connected.deviceId,
    grantId: f.grant.id,
  };
  await expect(repository.admit(context)).rejects.toThrow("ACCESS_DENIED");
  await connection.db
    .update(conversationRuns)
    .set({ memberAccountId: owner })
    .where(and(eq(conversationRuns.spaceId, f.scope.spaceId), eq(conversationRuns.id, root.id)));
  await expect(repository.admit(context)).resolves.toMatchObject({ id: f.grant.id });
  await expect(repository.admit({ ...context, runFence: 2 })).rejects.toThrow("STALE_FENCE");
  await connection.db
    .update(conversationRuns)
    .set({ leaseExpiresAt: new Date(clock - 1) })
    .where(and(eq(conversationRuns.spaceId, f.scope.spaceId), eq(conversationRuns.id, child.id)));
  await expect(repository.admit(context)).rejects.toThrow("STALE_FENCE");
});
it("refuses a device for initial untrusted provenance and keeps revoked selection unavailable", async () => {
  const f = await fixture();
  const run = await f.run();
  await expect(
    repository.resolveRun(f.scope, {
      ...run,
      computerId: null,
      startedAt: null,
      untrustedInput: true,
    }),
  ).rejects.toThrow("ACCESS_DENIED");
  await repository.revokeGrant(f.connected, f.scope.spaceId, f.grant.id);
  expect(await repository.getSelection(f.scope, f.conversationId)).toEqual({
    deviceId: f.connected.deviceId,
    grantId: f.grant.id,
  });
  await expect(
    repository.resolveRun(f.scope, { ...run, startedAt: run.startedAt?.toISOString() ?? null }),
  ).rejects.toThrow("ACCESS_DENIED");
});
it("journals command admission, exact event cursors and revocation without credentials in audit", async () => {
  const f = await fixture();
  const run = await f.run();
  const context = {
    spaceId: f.scope.spaceId,
    conversationId: f.conversationId,
    runId: run.id,
    runFence: 1,
    requesterAccountId: owner,
    deviceId: f.connected.deviceId,
    grantId: f.grant.id,
  };
  const request: DeviceConnectorRequest = {
    operationId: crypto.randomUUID(),
    payloadHash: "a".repeat(64),
    deviceId: context.deviceId,
    accountId: owner,
    requesterAccountId: owner,
    spaceId: context.spaceId,
    grantId: context.grantId,
    grantRevision: f.grant.revision,
    connectionFence: f.connected.connectionFence,
    runId: run.id,
    runFence: 1,
    expiresAt: new Date(clock + 60_000).toISOString(),
    operation: {
      kind: "execute",
      executable: "echo",
      argv: ["hello"],
      cwd: ".",
      environment: {},
      outputBudget: 1000,
      approved: true,
    },
  };
  await repository.beginOperation(context, request);
  await expect(repository.beginOperation(context, request)).rejects.toThrow("OUTCOME_UNKNOWN");
  await expect(
    repository.event(f.connected, 2, request.operationId, { kind: "accepted" }),
  ).rejects.toThrow("STALE_FENCE");
  expect(await repository.event(f.connected, 1, request.operationId, { kind: "accepted" })).toBe(
    true,
  );
  expect(await repository.event(f.connected, 1, request.operationId, { kind: "accepted" })).toBe(
    false,
  );
  await expect(
    repository.event(f.connected, 1, request.operationId, {
      kind: "error",
      code: "OUTCOME_UNKNOWN",
    }),
  ).rejects.toThrow("STALE_FENCE");
  await repository.event(f.connected, 2, request.operationId, {
    kind: "exit",
    status: 0,
    cancelled: false,
    truncated: false,
  });
  expect(await repository.operationEvents(context, request.operationId, 1)).toEqual([
    { sequence: 2, event: { kind: "exit", status: 0, cancelled: false, truncated: false } },
  ]);
  await repository.revoke(f.connected);
  await expect(repository.authenticate(f.connected.credential.credential)).rejects.toThrow(
    "ACCESS_DENIED",
  );
  await expect(repository.admit(context)).rejects.toThrow("ACCESS_DENIED");
  const audit = await connection.db
    .select()
    .from(spaceAudit)
    .where(eq(spaceAudit.spaceId, f.scope.spaceId));
  expect(audit.map((entry) => entry.action)).toEqual(
    expect.arrayContaining([
      "device.pairing.created",
      "device.paired",
      "device.directory.granted",
      "device.command",
      "device.revoked",
    ]),
  );
  const serialized = JSON.stringify(audit);
  expect(serialized).not.toContain(f.credential.credential);
  expect(serialized).not.toContain(f.connected.credential.credential);
  expect(serialized).not.toContain("/fixture/workspace");
  expect(
    (
      await connection.db
        .select()
        .from(deviceComputers)
        .where(eq(deviceComputers.id, f.connected.deviceId))
    )[0]?.revokedAt,
  ).not.toBeNull();
  expect(
    await connection.db
      .select()
      .from(deviceSpaceDevices)
      .where(eq(deviceSpaceDevices.spaceId, f.scope.spaceId)),
  ).toHaveLength(1);
});

it("keeps inherited team computer pins outside device provenance policy", async () => {
  const f = await fixture();
  const run = await f.run();
  const teamId = crypto.randomUUID();
  await connection.db.insert(computers).values({
    spaceId: f.scope.spaceId,
    id: teamId,
    scope: "team",
    provider: "memory",
    createdByAccountId: owner,
    state: "running",
  });
  for (const untrustedInput of [false, true]) {
    await expect(
      repository.resolveRun(f.scope, {
        ...run,
        computerId: teamId,
        startedAt: null,
        untrustedInput,
      }),
    ).resolves.toBeNull();
  }
  await expect(
    repository.resolveRun(f.scope, {
      ...run,
      computerId: f.grant.id,
      startedAt: null,
      untrustedInput: true,
    }),
  ).rejects.toThrow("ACCESS_DENIED");
});
