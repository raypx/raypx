import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { and, eq, inArray, sql } from "drizzle-orm";
import { connectDatabase, migrateDatabase } from "@raypx/database";
import {
  computerScreenControls,
  computerScreenViewers,
  computers,
  spaceAudit,
  spaceMembers,
  spaces,
  user,
} from "@raypx/database/schema";
import { createSpaceAccess } from "@raypx/spaces/server/postgres";
import type { SpaceScope } from "@raypx/spaces/server";
import type { ComputerRef } from "@raypx/providers/computer";
import { createMemoryComputerProvider } from "@raypx/providers/computer";
import {
  createComputerScreenRepository,
  createComputersRepository,
  revokeComputerScreenControl,
} from "../../src/server/postgres.js";
import {
  createComputerScreensService,
  createComputersService,
  type ComputerScreenRepository,
} from "../../src/server.js";

const url = process.env.TEST_DATABASE_URL;
if (!url || !/_test(?:_[a-z0-9]+)?$/.test(new URL(url).pathname))
  throw new Error("A disposable *_test or *_test_<lane> database is required");
const connection = connectDatabase(url);
const other = connectDatabase(url);
const access = createSpaceAccess(connection.db);
const owner = `screen-owner-${crypto.randomUUID()}`;
const member = `screen-member-${crypto.randomUUID()}`;
const owned: string[] = [];
beforeAll(async () => {
  await migrateDatabase(url);
  await connection.db.insert(user).values([
    { id: owner, name: "Owner", email: `${owner}@example.test` },
    { id: member, name: "Other member", email: `${member}@example.test` },
  ]);
});
afterAll(async () => {
  try {
    await connection.db
      .delete(computerScreenControls)
      .where(inArray(computerScreenControls.spaceId, owned));
    await connection.db.delete(computers).where(inArray(computers.spaceId, owned));
    await connection.db.delete(spaces).where(inArray(spaces.id, owned));
    await connection.db.delete(user).where(inArray(user.id, [owner, member]));
  } finally {
    await connection.close();
    await other.close();
  }
});
async function fixture() {
  const { space } = await access.create(owner, { name: "Screen fixture" });
  owned.push(space.id);
  await connection.db
    .insert(spaceMembers)
    .values({ spaceId: space.id, accountId: member, role: "member" });
  const a = await access.resolve(owner, space.id);
  const b = await access.resolve(member, space.id);
  const repository = createComputersRepository(connection.db, { perSpace: 1, perMember: 100 });
  const provider = createMemoryComputerProvider();
  await createComputersService(repository, provider, "memory").start(a);
  const computer = (await repository.get(a))!;
  const ref = { id: computer.id, generation: computer.generation };
  await provider.startScreen!(ref);
  const controls = createComputerScreenRepository(connection.db);
  return { a, b, ref, controls, repository, provider };
}
async function acquire(
  controls: ComputerScreenRepository,
  scope: SpaceScope,
  ref: ComputerRef,
  viewerId: string,
) {
  await controls.openViewer(scope, ref, viewerId);
  return controls.acquire(scope, ref, viewerId);
}
it("records one exclusive control grant across connections and audits both boundaries", async () => {
  const f = await fixture();
  const second = createComputerScreenRepository(other.db);
  const results = await Promise.allSettled([
    acquire(f.controls, f.a, f.ref, crypto.randomUUID()),
    acquire(second, f.b, f.ref, crypto.randomUUID()),
  ]);
  expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
  expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
  const [row] = await connection.db
    .select()
    .from(computerScreenControls)
    .where(eq(computerScreenControls.spaceId, f.a.spaceId));
  expect(row).toMatchObject({ computerId: f.ref.id, generation: f.ref.generation });
  await f.controls.forceRelease(f.a, f.ref);
  expect(await second.control(f.b, f.ref)).toBeNull();
  const audit = await connection.db
    .select()
    .from(spaceAudit)
    .where(and(eq(spaceAudit.spaceId, f.a.spaceId), eq(spaceAudit.outcome, "succeeded")));
  expect(audit.filter((entry) => entry.action === "computer.takeover.started")).toHaveLength(1);
  expect(audit.filter((entry) => entry.action === "computer.takeover.ended")).toMatchObject([
    { code: "forced" },
  ]);
});
it("requires the exact grant holder for renewal/input and a current owner for forced release", async () => {
  const f = await fixture();
  const grant = await acquire(f.controls, f.a, f.ref, crypto.randomUUID());
  await expect(f.controls.renew(f.b, f.ref, grant.id)).rejects.toMatchObject({
    code: "SCREEN_CONTROL_REQUIRED",
  });
  const operation = vi.fn(async () => "input");
  await expect(f.controls.withMemberInput(f.b, f.ref, grant.id, operation)).rejects.toMatchObject({
    code: "SCREEN_CONTROL_REQUIRED",
  });
  expect(operation).not.toHaveBeenCalled();
  await expect(f.controls.forceRelease(f.b, f.ref)).rejects.toMatchObject({
    code: "SCREEN_OWNER_REQUIRED",
  });
  expect(await f.controls.withMemberInput(f.a, f.ref, grant.id, operation)).toBe("input");
  expect((await f.controls.renew(f.a, f.ref, grant.id)).id).toBe(grant.id);
  await f.controls.release(f.a, f.ref, grant.id);
  expect(await f.controls.control(f.a, f.ref)).toBeNull();
});
it("persists expiry and its audit even when renewal is refused, then admits another member", async () => {
  const f = await fixture();
  let time = Date.now();
  const controls = createComputerScreenRepository(connection.db, { now: () => new Date(time) });
  const grant = await acquire(controls, f.a, f.ref, crypto.randomUUID());
  time += 30_001;
  await expect(controls.renew(f.a, f.ref, grant.id)).rejects.toMatchObject({
    code: "SCREEN_CONTROL_REQUIRED",
  });
  expect(
    await connection.db
      .select()
      .from(computerScreenControls)
      .where(eq(computerScreenControls.spaceId, f.a.spaceId)),
  ).toHaveLength(0);
  const audit = await connection.db
    .select()
    .from(spaceAudit)
    .where(
      and(
        eq(spaceAudit.spaceId, f.a.spaceId),
        eq(spaceAudit.action, "computer.takeover.ended"),
        eq(spaceAudit.outcome, "succeeded"),
      ),
    );
  expect(audit).toMatchObject([{ code: "expired" }]);
  expect((await acquire(controls, f.b, f.ref, crypto.randomUUID())).accountId).toBe(member);
});
it("waits for in-flight Agent input before takeover and blocks all further Agent input", async () => {
  const f = await fixture();
  let entered!: () => void;
  let finish!: () => void;
  const admission = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const executing = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const first = f.controls.withAgentInput(f.a, f.ref, async () => {
    entered();
    await executing;
    return "done";
  });
  await admission;
  const second = createComputerScreenRepository(other.db);
  const acquiring = acquire(second, f.b, f.ref, crypto.randomUUID());
  expect(
    await Promise.race([
      acquiring.then(() => "acquired"),
      new Promise<string>((resolve) => setTimeout(() => resolve("waiting"), 25)),
    ]),
  ).toBe("waiting");
  finish();
  expect(await first).toBe("done");
  await acquiring;
  const operation = vi.fn(async () => "must not run");
  await expect(f.controls.withAgentInput(f.a, f.ref, operation)).rejects.toMatchObject({
    code: "SCREEN_CONTROL_HELD",
  });
  expect(operation).not.toHaveBeenCalled();
  await second.release(f.b, f.ref, (await second.control(f.b, f.ref))!.id);
  expect(await f.controls.withAgentInput(f.a, f.ref, operation)).toBe("must not run");
});
it("keeps grants and their references inside one Space and fences replaced generations", async () => {
  const f = await fixture();
  const g = await fixture();
  await acquire(f.controls, f.a, f.ref, crypto.randomUUID());
  await expect(f.controls.control(g.a, f.ref)).rejects.toMatchObject({
    code: "SCREEN_NOT_RUNNING",
  });
  expect(await f.controls.control(g.a, g.ref)).toBeNull();
  await expect(
    connection.db.insert(computerScreenControls).values({
      spaceId: g.a.spaceId,
      computerId: f.ref.id,
      generation: 1,
      id: crypto.randomUUID(),
      accountId: owner,
      viewerId: crypto.randomUUID(),
      displayName: "Owner",
      expiresAt: new Date(Date.now() + 30_000),
    }),
  ).rejects.toThrow(/foreign key|Failed query/i);
  await expect(
    f.controls.withAgentInput(
      f.a,
      { ...f.ref, generation: f.ref.generation + 1 },
      async () => "bad",
    ),
  ).rejects.toMatchObject({ code: "SCREEN_NOT_RUNNING" });
});
it("releases only the bound viewer and atomically audits membership revocation", async () => {
  const f = await fixture();
  const viewerId = crypto.randomUUID();
  const grant = await acquire(f.controls, f.b, f.ref, viewerId);
  await f.controls.releaseViewer(f.b, f.ref, crypto.randomUUID());
  expect((await f.controls.control(f.a, f.ref))?.id).toBe(grant.id);
  await connection.db.transaction(async (tx) => {
    await tx.select().from(spaces).where(eq(spaces.id, f.a.spaceId)).for("update");
    await revokeComputerScreenControl(tx, f.a.spaceId, member);
    await tx
      .update(spaceMembers)
      .set({ removedAt: new Date(), removalReason: "removed" })
      .where(and(eq(spaceMembers.spaceId, f.a.spaceId), eq(spaceMembers.accountId, member)));
  });
  expect(await f.controls.control(f.a, f.ref)).toBeNull();
  await expect(acquire(f.controls, f.b, f.ref, viewerId)).rejects.toThrow("Space record not found");
  const audit = await connection.db
    .select()
    .from(spaceAudit)
    .where(
      and(
        eq(spaceAudit.spaceId, f.a.spaceId),
        eq(spaceAudit.action, "computer.takeover.ended"),
        eq(spaceAudit.outcome, "succeeded"),
      ),
    );
  expect(audit).toMatchObject([{ code: "membership_lost" }]);
});
it("closes a live view on fresh PostgreSQL membership loss with its precise reason", async () => {
  const f = await fixture();
  const service = createComputerScreensService(f.repository, f.controls, f.provider);
  const viewerId = crypto.randomUUID();
  const iterable = service.stream(f.b, {
    viewerId,
    recheck: () => access.resolve(member, f.a.spaceId),
  });
  const stream = iterable[Symbol.asyncIterator]();
  expect((await stream.next()).value).toMatchObject({ kind: "state" });
  expect((await stream.next()).value).toMatchObject({ kind: "frame" });
  await service.acquire(f.b, viewerId);
  await connection.db.transaction(async (tx) => {
    await tx.select().from(spaces).where(eq(spaces.id, f.a.spaceId)).for("update");
    await revokeComputerScreenControl(tx, f.a.spaceId, member);
    await tx
      .update(spaceMembers)
      .set({ removedAt: new Date(), removalReason: "left" })
      .where(and(eq(spaceMembers.spaceId, f.a.spaceId), eq(spaceMembers.accountId, member)));
  });
  const events = [];
  for (let i = 0; i < 6; i += 1) {
    const next = await stream.next();
    if (next.done) break;
    events.push(next.value);
  }
  expect(events.at(-1)).toEqual({ kind: "closed", reason: "SPACE_MEMBER_LEFT" });
  expect(await f.controls.control(f.a, f.ref)).toBeNull();
});
it("does not let an old generation's disconnect release a replacement grant", async () => {
  const f = await fixture();
  const viewerId = crypto.randomUUID();
  await acquire(f.controls, f.a, f.ref, viewerId);
  const lifecycle = createComputersService(f.repository, f.provider, "memory");
  await lifecycle.stop(f.a);
  await lifecycle.start(f.a);
  const current = (await f.repository.get(f.a))!;
  const newRef = { id: current.id, generation: current.generation };
  await f.provider.startScreen!(newRef);
  const control = await acquire(f.controls, f.a, newRef, viewerId);
  await f.controls.releaseViewer(f.a, f.ref, viewerId);
  expect((await f.controls.control(f.a, newRef))?.id).toBe(control.id);
});
it("ends control and its pause on screen stop and computer lifecycle stop", async () => {
  const f = await fixture();
  const service = createComputerScreensService(f.repository, f.controls, f.provider);
  const viewerId = crypto.randomUUID();
  await f.controls.openViewer(f.a, f.ref, viewerId);
  await service.acquire(f.a, viewerId);
  expect(await service.stop(f.a)).toMatchObject({
    status: "available",
    running: false,
    agentInputPaused: false,
  });
  await service.start(f.a);
  const nextViewerId = crypto.randomUUID();
  await f.controls.openViewer(f.a, f.ref, nextViewerId);
  await service.acquire(f.a, nextViewerId);
  await createComputersService(f.repository, f.provider, "memory").stop(f.a);
  expect(
    await connection.db
      .select()
      .from(computerScreenControls)
      .where(eq(computerScreenControls.spaceId, f.a.spaceId)),
  ).toHaveLength(0);
  const ended = await connection.db
    .select()
    .from(spaceAudit)
    .where(
      and(
        eq(spaceAudit.spaceId, f.a.spaceId),
        eq(spaceAudit.action, "computer.takeover.ended"),
        eq(spaceAudit.outcome, "succeeded"),
      ),
    );
  expect(ended.map((entry) => entry.code).sort((a, b) => (a ?? "").localeCompare(b ?? ""))).toEqual(
    ["computer_stopped", "screen_stopped"],
  );
});
it("refuses takeover without audit storage and rolls back its grant", async () => {
  const f = await fixture();
  // A test-owned constraint injects a storage refusal without dropping evidence.
  const constraint = sql.identifier(
    "screen_audit_fixture_" + crypto.randomUUID().replaceAll("-", ""),
  );
  await connection.db.execute(
    sql`alter table space_audit add constraint ${constraint} check (action <> 'computer.takeover.started') not valid`,
  );
  try {
    await expect(acquire(f.controls, f.a, f.ref, crypto.randomUUID())).rejects.toMatchObject({
      code: "SPACE_AUDIT_UNAVAILABLE",
    });
    expect(
      await connection.db
        .select()
        .from(computerScreenControls)
        .where(eq(computerScreenControls.spaceId, f.a.spaceId)),
    ).toHaveLength(0);
  } finally {
    await connection.db.execute(sql`alter table space_audit drop constraint ${constraint}`);
  }
});
it("refuses a delayed acquire or heartbeat after disconnect on another API instance", async () => {
  const f = await fixture();
  const second = createComputerScreenRepository(other.db);
  const viewerId = crypto.randomUUID();
  await expect(f.controls.acquire(f.a, f.ref, viewerId)).rejects.toMatchObject({
    code: "SCREEN_CONTROL_REQUIRED",
  });
  await f.controls.openViewer(f.a, f.ref, viewerId);
  await f.controls.acquire(f.a, f.ref, viewerId);
  await second.releaseViewer(f.a, f.ref, viewerId);
  await expect(f.controls.acquire(f.a, f.ref, viewerId)).rejects.toMatchObject({
    code: "SCREEN_CONTROL_REQUIRED",
  });
  await expect(f.controls.touchViewer(f.a, f.ref, viewerId)).rejects.toMatchObject({
    code: "SCREEN_CONTROL_REQUIRED",
  });
  expect(await second.control(f.a, f.ref)).toBeNull();
  expect(
    await connection.db
      .select()
      .from(computerScreenViewers)
      .where(eq(computerScreenViewers.spaceId, f.a.spaceId)),
  ).toHaveLength(0);
});
it("expires a takeover when its stream heartbeat expires without allowing renewal", async () => {
  const f = await fixture();
  let time = Date.now();
  const controls = createComputerScreenRepository(connection.db, { now: () => new Date(time) });
  const viewerId = crypto.randomUUID();
  const control = await acquire(controls, f.a, f.ref, viewerId);
  time += 10_001;
  await expect(controls.renew(f.a, f.ref, control.id)).rejects.toMatchObject({
    code: "SCREEN_CONTROL_REQUIRED",
  });
  expect(await controls.control(f.a, f.ref)).toBeNull();
  await expect(controls.touchViewer(f.a, f.ref, viewerId)).rejects.toMatchObject({
    code: "SCREEN_CONTROL_REQUIRED",
  });
  const ended = await connection.db
    .select()
    .from(spaceAudit)
    .where(
      and(
        eq(spaceAudit.spaceId, f.a.spaceId),
        eq(spaceAudit.action, "computer.takeover.ended"),
        eq(spaceAudit.outcome, "succeeded"),
      ),
    );
  expect(ended).toMatchObject([{ code: "disconnected" }]);
});
it("keeps viewing and heartbeats live during a long Agent command without bypassing audited expiry", async () => {
  const f = await fixture();
  let time = Date.now();
  const gate = createComputerScreenRepository(connection.db, { now: () => new Date(time) });
  const viewer = createComputerScreenRepository(other.db, { now: () => new Date(time) });
  await acquire(gate, f.a, f.ref, crypto.randomUUID());
  time += 30_001;
  let entered!: () => void;
  let finish!: () => void;
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const held = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const command = gate.withAgentInput(f.a, f.ref, async () => {
    entered();
    await held;
  });
  await started;
  const viewerId = crypto.randomUUID();
  let completed = false;
  const observing = (async () => {
    // The expired grant is still visible through MVCC until the command commits.
    // A peek must refuse it without waiting on the command's exclusive gate.
    expect(await viewer.control(f.b, f.ref)).toBeNull();
    await viewer.openViewer(f.b, f.ref, viewerId);
    for (let step = 0; step < 4; step += 1) {
      time += 4_000;
      await viewer.touchViewer(f.b, f.ref, viewerId);
      expect(await viewer.control(f.b, f.ref)).toBeNull();
    }
    completed = true;
  })();
  void observing.catch(() => undefined);
  try {
    await expect.poll(() => completed, { timeout: 1_000 }).toBe(true);
  } finally {
    finish();
    await command;
    await observing;
  }
  // Four heartbeats span more than the original ten-second viewer lifetime.
  expect((await viewer.acquire(f.b, f.ref, viewerId)).accountId).toBe(member);
  await viewer.releaseViewer(f.b, f.ref, viewerId);
  const expired = await connection.db
    .select()
    .from(spaceAudit)
    .where(
      and(
        eq(spaceAudit.spaceId, f.a.spaceId),
        eq(spaceAudit.action, "computer.takeover.ended"),
        eq(spaceAudit.outcome, "succeeded"),
        eq(spaceAudit.code, "expired"),
      ),
    );
  expect(expired).toHaveLength(1);
});
