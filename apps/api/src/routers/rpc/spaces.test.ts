import { expect, it, vi } from "vitest";
import { createApiClient } from "@raypx/client/api";
import { SpaceNotFound, spaceIdSchema, spaceSchema, spaceMemberSchema } from "@raypx/core/spaces";
import { conversationIdSchema, agentIdSchema } from "@raypx/core/agents";
import type { AuthSession } from "@raypx/core/auth";
import type { SpaceAccess } from "@raypx/spaces/server";
import { createApiApp } from "../../../tests/helpers/app.js";

function fixture() {
  let auth: AuthSession | null = {
    user: {
      id: "account",
      name: "Account",
      email: "account@example.test",
      emailVerified: true,
      role: "admin",
    },
    session: { id: "session", userId: "account", expiresAt: new Date(Date.now() + 60_000) },
  };
  const spaceId = spaceIdSchema.parse("space");
  const now = new Date().toISOString();
  let admitted = false;
  const membership = {
    space: spaceSchema.parse({ id: spaceId, name: "Personal", createdAt: now, updatedAt: now }),
    member: spaceMemberSchema.parse({
      spaceId,
      accountId: "account",
      role: "owner",
      createdAt: now,
    }),
  };
  const resolve = vi.fn<SpaceAccess["resolve"]>(async () => {
    if (admitted)
      return { spaceId, member: membership.member } as Awaited<ReturnType<SpaceAccess["resolve"]>>;
    throw new SpaceNotFound();
  });
  const list = vi.fn<SpaceAccess["list"]>(async () => [membership]);
  const create = vi.fn<SpaceAccess["create"]>(async () => membership);
  const readSession = vi.fn(async () => auth);
  const models = vi.fn(async () => [{ modelId: "offered", name: "Offered model" }]);
  const app = createApiApp({
    spaces: { resolve, list, create },
    conversationModels: { list: models },
    readSession,
    allowedOrigins: ["https://web.example.test"],
  });
  function client(origin = "https://web.example.test") {
    return createApiClient({
      baseUrl: "https://api.example.test",
      headers: { origin },
      fetch: async (url, init) => app.fetch(new Request(url, init)),
    });
  }
  return {
    app,
    client,
    spaceId,
    resolve,
    list,
    create,
    readSession,
    models,
    admit() {
      admitted = true;
    },
    signOut() {
      auth = null;
    },
  };
}
const agent = { name: "Helper", instructions: "", model: { modelId: "model" } };

it("resolves membership on every Agent procedure and refuses even deployment administrators", async () => {
  const f = fixture();
  const id = agentIdSchema.parse("agent");
  const conversationId = conversationIdSchema.parse("conversation");
  for (const request of [
    () =>
      f.client().conversations.send({
        spaceId: f.spaceId,
        conversationId,
        message: { text: "Hello", idempotencyKey: "retry" },
      }),
    () => f.client().conversations.events({ spaceId: f.spaceId, conversationId }),
    () => f.client().conversations.snapshot({ spaceId: f.spaceId, conversationId }),
    () => f.client().agents.models({ spaceId: f.spaceId }),
    () => f.client().agents.list({ spaceId: f.spaceId }),
    () => f.client().agents.get({ spaceId: f.spaceId, id }),
    () => f.client().agents.create({ spaceId: f.spaceId, agent }),
    () => f.client().agents.update({ spaceId: f.spaceId, id, agent }),
    () => f.client().agents.delete({ spaceId: f.spaceId, id }),
  ])
    await expect(request()).rejects.toMatchObject({ code: "NOT_FOUND" });
  expect(f.resolve).toHaveBeenCalledTimes(9);
  expect(f.readSession).toHaveBeenCalledTimes(9);
  for (const args of f.resolve.mock.calls) expect(args).toEqual(["account", f.spaceId]);
});

it("lists only offered model names after fresh session and Space membership admission", async () => {
  const f = fixture();
  f.admit();
  await expect(f.client().agents.models({ spaceId: f.spaceId })).resolves.toEqual([
    { modelId: "offered", name: "Offered model" },
  ]);
  expect(f.models).toHaveBeenCalledWith(expect.objectContaining({ spaceId: f.spaceId }));
  f.signOut();
  await expect(f.client().agents.models({ spaceId: f.spaceId })).rejects.toMatchObject({
    code: "UNAUTHORIZED",
  });
  expect(f.models).toHaveBeenCalledTimes(1);
});

it("takes account identity only from the session and protects creation with trusted Origin", async () => {
  const f = fixture();
  await f.client().spaces.list({});
  expect(f.list).toHaveBeenCalledWith("account");
  await f.client().spaces.create({ name: "Work" });
  expect(f.create).toHaveBeenCalledWith("account", { name: "Work" });
  await expect(
    f.client("https://untrusted.example.test").spaces.create({ name: "Work" }),
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
  await expect(
    f.client("https://untrusted.example.test").agents.create({ spaceId: f.spaceId, agent }),
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
  expect(f.resolve).not.toHaveBeenCalled();
  const forged = await f.app.request("/rpc/agents/create", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "https://web.example.test" },
    body: JSON.stringify({
      json: { spaceId: f.spaceId, agent, scope: { role: "owner" }, accountId: "another" },
    }),
  });
  expect(forged.status).toBe(400);
  f.signOut();
  await expect(f.client().spaces.list({})).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  await expect(f.client().agents.list({ spaceId: f.spaceId })).rejects.toMatchObject({
    code: "UNAUTHORIZED",
  });
});
