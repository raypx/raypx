import { afterAll, beforeAll, expect, it } from "vitest";
import { connectDatabase, migrateDatabase } from "@raypx/database";
import {
  computers,
  conversations,
  conversationEvents,
  agents,
  spaces,
  user,
} from "@raypx/database/schema";
import { eq, inArray } from "drizzle-orm";
import { createSpaceAccess } from "@raypx/spaces/server/postgres";
import { createMemoryComputerProvider } from "@raypx/providers/computer";
import { createComputersRepository } from "../../src/server/postgres.js";
import { createComputersService } from "../../src/server.js";

const url = process.env.TEST_DATABASE_URL;
if (!url || !/_test(?:_[a-z0-9]+)?$/.test(new URL(url).pathname))
  throw new Error("A freshly created disposable *_test or *_test_<lane> database is required");
const connection = connectDatabase(url);
const other = connectDatabase(url);
const access = createSpaceAccess(connection.db);
const account = `computer-${crypto.randomUUID()}`;
const owned: string[] = [];
beforeAll(async () => {
  await migrateDatabase(url);
  await connection.db
    .insert(user)
    .values({ id: account, name: "Computer fixture", email: `${account}@example.test` });
});
afterAll(async () => {
  try {
    await connection.db
      .delete(conversationEvents)
      .where(inArray(conversationEvents.spaceId, owned));
    await connection.db.delete(computers).where(inArray(computers.spaceId, owned));
    await connection.db.delete(spaces).where(inArray(spaces.id, owned));
    await connection.db.delete(user).where(eq(user.id, account));
  } finally {
    await Promise.all([connection.close(), other.close()]);
  }
});
async function fixture() {
  const { space } = await access.create(account, { name: "Computer fixture" });
  owned.push(space.id);
  return access.resolve(account, space.id);
}
it("serializes lazy creation across connections and emits states transactionally", async () => {
  const scope = await fixture();
  await connection.db.insert(agents).values({
    spaceId: scope.spaceId,
    id: "agent",
    name: "Helper",
    instructions: "",
    modelId: "none",
  });
  await connection.db
    .insert(conversations)
    .values({ spaceId: scope.spaceId, id: "conversation", agentId: "agent", kind: "direct" });
  const a = createComputersRepository(connection.db);
  const b = createComputersRepository(other.db);
  expect(await a.get(scope)).toBeNull();
  const results = await Promise.allSettled([
    a.claim(scope, "start", "memory"),
    b.claim(scope, "start", "memory"),
  ]);
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect(
    await connection.db.select().from(computers).where(eq(computers.spaceId, scope.spaceId)),
  ).toHaveLength(1);
  const claim = await a.get(scope);
  await a.complete(scope, claim!, { state: "running", homeRevision: null, failureCode: null });
  const events = await connection.db
    .select()
    .from(conversationEvents)
    .where(eq(conversationEvents.spaceId, scope.spaceId))
    // Without an order the planner may return rows through any index.
    .orderBy(conversationEvents.sequence);
  expect(events.map((e) => [e.kind, (e.data as { state: string }).state])).toEqual([
    ["computer.state", "starting"],
    ["computer.state", "running"],
  ]);
  await expect(
    a.complete(scope, claim!, { state: "stopped", homeRevision: null, failureCode: null }),
  ).rejects.toThrow("COMPUTER_BUSY");
});
it("rejects a private Agent and an event computer reference from another Space in PostgreSQL", async () => {
  const a = await fixture();
  const b = await fixture();
  await connection.db.insert(agents).values({
    spaceId: a.spaceId,
    id: "only-a",
    name: "Helper",
    instructions: "",
    modelId: "none",
  });
  await expect(
    connection.db.insert(computers).values({
      spaceId: b.spaceId,
      id: crypto.randomUUID(),
      scope: "private",
      agentId: "only-a",
      createdByAccountId: account,
      provider: "memory",
    }),
  ).rejects.toThrow(/foreign key|Failed query/i);
  const service = createComputersService(
    createComputersRepository(connection.db),
    createMemoryComputerProvider(),
    "memory",
  );
  await service.start(a);
  const computer = await createComputersRepository(connection.db).get(a);
  await connection.db.insert(agents).values({
    spaceId: b.spaceId,
    id: "b-agent",
    name: "Helper",
    instructions: "",
    modelId: "none",
  });
  await connection.db
    .insert(conversations)
    .values({ spaceId: b.spaceId, id: "b-conversation", agentId: "b-agent", kind: "direct" });
  await expect(
    connection.db.insert(conversationEvents).values({
      spaceId: b.spaceId,
      conversationId: "b-conversation",
      sequence: 1,
      kind: "computer.state",
      computerId: computer!.id,
      data: { state: "running", generation: 1, homeRevision: null },
    }),
  ).rejects.toThrow(/foreign key|Failed query/i);
});
it("preserves homes across stop/start and enforces deployment quotas", async () => {
  const scope = await fixture();
  const repository = createComputersRepository(connection.db, { perSpace: 1, perMember: 100 });
  const provider = createMemoryComputerProvider();
  const service = createComputersService(repository, provider, "memory");
  await service.start(scope);
  // The provider accepts only a reference, never the stored record.
  const reference = async () => {
    const { id, generation } = (await repository.get(scope))!;
    return { id, generation };
  };
  await provider.write(await reference(), "saved", "Z29vZA==");
  await service.stop(scope);
  await service.start(scope);
  expect(await provider.read(await reference(), "saved", 10)).toEqual({ bytes: "Z29vZA==" });
  const otherScope = await fixture();
  await expect(
    createComputersRepository(connection.db, { perSpace: 1, perMember: 1 }).claim(
      otherScope,
      "start",
      "memory",
    ),
  ).rejects.toThrow("COMPUTER_LIMIT");
});
it("keeps a completed lifecycle generation when another service proceeds from a stale read", async () => {
  const scope = await fixture();
  const first = createComputersRepository(connection.db);
  const second = createComputersRepository(other.db);
  const provider = createMemoryComputerProvider();
  let provisions = 0;
  let stops = 0;
  const originalProvision = provider.provision.bind(provider);
  const originalStop = provider.stop.bind(provider);
  provider.provision = async (ref) => {
    provisions += 1;
    return originalProvision(ref);
  };
  provider.stop = async (ref) => {
    stops += 1;
    return originalStop(ref);
  };
  const a = createComputersService(first, provider, "memory");
  async function staleCaller(operation: "start" | "stop") {
    let read!: () => void;
    let complete!: () => void;
    const reading = new Promise<void>((resolve) => {
      read = resolve;
    });
    const completed = new Promise<void>((resolve) => {
      complete = resolve;
    });
    const delayed = createComputersService(
      {
        ...second,
        async get(current) {
          const stale = await second.get(current);
          read();
          await completed;
          return stale;
        },
      },
      provider,
      "memory",
    );
    const pending = delayed[operation](scope);
    await reading;
    const result = await a[operation](scope);
    complete();
    expect(await pending).toEqual(result);
    return result;
  }
  const started = await staleCaller("start");
  expect(started).toMatchObject({
    status: "available",
    computer: { state: "running", generation: 1 },
  });
  expect(provisions).toBe(1);
  const stopped = await staleCaller("stop");
  expect(stopped).toMatchObject({
    status: "available",
    computer: { state: "stopped", generation: 1 },
  });
  expect(stops).toBe(1);
});

it("reconciles supervisor stops under the Space/generation/fence and emits normal lifecycle state", async () => {
  const scope = await fixture();
  const provider = createMemoryComputerProvider();
  const repository = createComputersRepository(connection.db);
  const service = createComputersService(repository, provider);
  const started = await service.start(scope);
  if (started.status !== "available" || !started.computer)
    throw new Error("Missing fixture computer");
  const original = started.computer;
  await provider.stop({ id: original.id, generation: original.generation });
  expect(await service.get(scope)).toMatchObject({
    status: "available",
    computer: { state: "stopped" },
  });
  const next = await service.start(scope);
  expect(next).toMatchObject({
    status: "available",
    computer: { state: "running", generation: original.generation + 1 },
  });
  await expect(
    repository.observe!(scope, original, {
      state: "stopped",
      homeRevision: null,
      failureCode: null,
    }),
  ).rejects.toMatchObject({ code: "COMPUTER_BUSY" });
  const elsewhere = await fixture();
  await expect(
    repository.observe!(elsewhere, original, {
      state: "stopped",
      homeRevision: null,
      failureCode: null,
    }),
  ).rejects.toMatchObject({ code: "COMPUTER_BUSY" });
});
