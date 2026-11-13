import { afterAll, beforeAll, expect, it } from "vitest";
import { connectDatabase, migrateDatabase } from "@raypx/database";
import { computers, spaces, spaceMembers, user } from "@raypx/database/schema";
import { and, eq, inArray } from "drizzle-orm";
import { createSpaceAccess } from "@raypx/spaces/server/postgres";
import { createComputersService } from "@raypx/computers/server";
import { createComputersRepository } from "@raypx/computers/server/postgres";
import { createMemoryComputerProvider } from "@raypx/providers/computer";
import { createApiClient } from "@raypx/client/api";
import { createApiApp } from "../../helpers/app.js";
const url = process.env.TEST_DATABASE_URL;
if (!url || !new URL(url).pathname.endsWith("_test"))
  throw new Error("A freshly created disposable *_test database is required");
const connection = connectDatabase(url);
const owner = `computer-api-${crypto.randomUUID()}`;
const stranger = `computer-api-${crypto.randomUUID()}`;
const owned: string[] = [];
const access = createSpaceAccess(connection.db);
const repository = createComputersRepository(connection.db);
const provider = createMemoryComputerProvider();
const service = createComputersService(repository, provider, "memory");
beforeAll(async () => {
  await migrateDatabase(url);
  await connection.db.insert(user).values(
    [owner, stranger].map((id) => ({
      id,
      name: "Computer fixture",
      email: `${id}@example.test`,
      emailVerified: true,
    })),
  );
});
afterAll(async () => {
  try {
    await connection.db.delete(computers).where(inArray(computers.spaceId, owned));
    await connection.db.delete(spaces).where(inArray(spaces.id, owned));
    await connection.db.delete(user).where(inArray(user.id, [owner, stranger]));
  } finally {
    await connection.close();
  }
});
function client(id: string, computerService = service) {
  const app = createApiApp({
    spaces: access,
    computers: computerService,
    allowedOrigins: ["https://web.example.test"],
    readSession: async () => ({
      user: {
        id,
        name: "Fixture",
        email: `${id}@example.test`,
        emailVerified: true,
        role: "admin",
      },
      session: { id: `session-${id}`, userId: id, expiresAt: new Date(Date.now() + 60_000) },
    }),
  });
  return createApiClient({
    baseUrl: "https://api.example.test",
    headers: { origin: "https://web.example.test" },
    fetch: async (requestUrl, init) => app.fetch(new Request(requestUrl, init)),
  });
}
it("admits fresh Space members, provisions once, and refuses outsiders on read/start/stop", async () => {
  const { space } = await access.create(owner, { name: "Computer API fixture" });
  owned.push(space.id);
  for (const procedure of ["get", "start", "stop"] as const)
    await expect(
      client(stranger).computers[procedure]({ spaceId: space.id }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  expect(await client(owner).computers.get({ spaceId: space.id })).toEqual({
    status: "available",
    computer: null,
  });
  expect(await client(owner).computers.start({ spaceId: space.id })).toMatchObject({
    status: "available",
    computer: { state: "running", spaceId: space.id },
  });
  expect(await client(owner).computers.stop({ spaceId: space.id })).toMatchObject({
    status: "available",
    computer: { state: "stopped" },
  });
  expect(
    await connection.db
      .select()
      .from(computers)
      .where(inArray(computers.spaceId, [space.id])),
  ).toHaveLength(1);
});

it("reads bounded workspace files for current members without starting stopped compute", async () => {
  const { space } = await access.create(owner, { name: "Computer files fixture" });
  owned.push(space.id);
  const ownerClient = client(owner);
  expect(await ownerClient.computers.readFile({ spaceId: space.id, path: "file" })).toEqual({
    status: "not-running",
    state: null,
  });
  expect(await repository.get(await access.resolve(owner, space.id))).toBeNull();
  expect(
    await client(owner, createComputersService(repository, null)).computers.listDirectory({
      spaceId: space.id,
    }),
  ).toEqual({ status: "not-configured" });
  await ownerClient.computers.start({ spaceId: space.id });
  const computer = (await repository.get(await access.resolve(owner, space.id)))!;
  const ref = { id: computer.id, generation: computer.generation };
  await provider.write(ref, "a", Buffer.from("hello world").toString("base64"));
  await provider.write(ref, "b", "AA==");
  expect(await ownerClient.computers.listDirectory({ spaceId: space.id, limit: 1 })).toEqual({
    status: "available",
    entries: [{ path: "a", kind: "file" }],
    truncated: true,
  });
  expect(
    await ownerClient.computers.readFile({ spaceId: space.id, path: "a", maxBytes: 5 }),
  ).toEqual({
    status: "available",
    bytes: "aGVsbG8=",
    size: 11,
    truncated: true,
    contentType: "text",
  });
  await expect(
    ownerClient.computers.readFile({ spaceId: space.id, path: "../outside" }),
  ).rejects.toMatchObject({ data: { error: { code: "FILE_PATH_REFUSED" } } });
  await expect(
    client(stranger).computers.readFile({ spaceId: space.id, path: "a" }),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
  await connection.db
    .insert(spaceMembers)
    .values({ spaceId: space.id, accountId: stranger, role: "member" });
  expect(await client(stranger).computers.readFile({ spaceId: space.id, path: "b" })).toMatchObject(
    { status: "available", contentType: "binary" },
  );
  await connection.db
    .delete(spaceMembers)
    .where(and(eq(spaceMembers.spaceId, space.id), eq(spaceMembers.accountId, stranger)));
  await expect(
    client(stranger).computers.listDirectory({ spaceId: space.id }),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
  await ownerClient.computers.stop({ spaceId: space.id });
  expect(await ownerClient.computers.readFile({ spaceId: space.id, path: "a" })).toEqual({
    status: "not-running",
    state: "stopped",
  });
});
