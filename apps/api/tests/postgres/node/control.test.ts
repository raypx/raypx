import { afterAll, beforeAll, expect, it } from "vite-plus/test";
import { connectDatabase, migrateDatabase } from "@raypx/database";
import { user, session } from "@raypx/database/schema";
import { eq } from "drizzle-orm";
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
