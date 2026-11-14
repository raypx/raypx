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
if (!url || !new URL(url).pathname.endsWith("_test"))
  throw new Error("A freshly created disposable *_test database is required");
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
