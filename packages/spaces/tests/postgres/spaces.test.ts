import { afterAll, beforeAll, expect, it } from "vitest";
import { connectDatabase, migrateDatabase } from "@raypx/database";
import { spaceMembers, spaces, user } from "@raypx/database/schema";
import { and, eq, inArray } from "drizzle-orm";
import { createSpaceAccess, createSpacesRepository } from "../../src/server/postgres.js";

const url = process.env.TEST_DATABASE_URL;
if (!url || !new URL(url).pathname.endsWith("_test"))
  throw new Error("An isolated *_test database is required");
const connection = connectDatabase(url);
const otherConnection = connectDatabase(url);
const access = createSpaceAccess(connection.db);
const repository = createSpacesRepository(connection.db);
const owner = `spaces-${crypto.randomUUID()}`;
const stranger = `spaces-${crypto.randomUUID()}`;
const owned: string[] = [];
beforeAll(async () => {
  await migrateDatabase(url);
  await connection.db
    .insert(user)
    .values(
      [owner, stranger].map((id) => ({ id, name: "Space fixture", email: `${id}@example.test` })),
    );
});
afterAll(async () => {
  try {
    for (const id of owned) await connection.db.delete(spaces).where(eq(spaces.id, id));
    await connection.db.delete(user).where(inArray(user.id, [owner, stranger]));
  } finally {
    await Promise.all([connection.close(), otherConnection.close()]);
  }
});

it("creates a single private owner Space under concurrent first use, independently of other memberships", async () => {
  const shared = await access.create(stranger, { name: "Shared before first use" });
  owned.push(shared.space.id);
  await connection.db
    .insert(spaceMembers)
    .values({ spaceId: shared.space.id, accountId: owner, role: "member" });
  const results = await Promise.all([
    access.list(owner),
    createSpaceAccess(otherConnection.db).list(owner),
  ]);
  expect(results[0]).toEqual(results[1]);
  expect(results[0].filter((entry) => entry.member.role === "owner")).toHaveLength(1);
  expect(results[0].filter((entry) => entry.member.role === "member")).toHaveLength(1);
  expect(
    await connection.db.select().from(spaces).where(eq(spaces.privateFor, owner)),
  ).toHaveLength(1);
});

it("reads Space and member records only through the selected scope and revokes on the next resolution", async () => {
  const a = await access.create(owner, { name: "Only owner" });
  const b = await access.create(stranger, { name: "Only stranger" });
  owned.push(a.space.id, b.space.id);
  const scopeA = await access.resolve(owner, a.space.id);
  const scopeB = await access.resolve(stranger, b.space.id);
  expect((await repository.get(scopeA)).id).toBe(a.space.id);
  expect((await repository.get(scopeB)).id).toBe(b.space.id);
  await expect(repository.getMember(scopeB, owner)).rejects.toThrow("not found");
  await expect(repository.getMember(scopeA, stranger)).rejects.toThrow("not found");
  await expect(access.resolve(stranger, a.space.id)).rejects.toThrow("not found");
  expect((await access.list(stranger)).map((entry) => entry.space.id)).not.toContain(a.space.id);
  await connection.db
    .insert(spaceMembers)
    .values({ spaceId: a.space.id, accountId: stranger, role: "member" });
  expect((await access.resolve(stranger, a.space.id)).member.role).toBe("member");
  await connection.db
    .delete(spaceMembers)
    .where(and(eq(spaceMembers.spaceId, a.space.id), eq(spaceMembers.accountId, stranger)));
  await expect(access.resolve(stranger, a.space.id)).rejects.toThrow("not found");
});
