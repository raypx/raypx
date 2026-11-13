import { expect, it, vi } from "vitest";
import { createApiClient } from "@raypx/client/api";
import { SpaceNotFound, spaceIdSchema, spaceSchema, spaceMemberSchema } from "@raypx/core/spaces";
import { conversationIdSchema, agentIdSchema } from "@raypx/core/agents";
import type { AuthSession } from "@raypx/core/auth";
import type { SpaceAccess, SpaceManagement } from "@raypx/spaces/server";
import type { RateLimiter } from "../../rate-limit/types.js";
import { createApiApp } from "../../../tests/helpers/app.js";

function fixture(rateLimit?: RateLimiter, spaceManagement?: SpaceManagement) {
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
  const computers = {
    get: vi.fn(async () => ({ status: "not-configured" as const })),
    start: vi.fn(async () => ({ status: "not-configured" as const })),
    stop: vi.fn(async () => ({ status: "not-configured" as const })),
    listDirectory: vi.fn(async () => ({ status: "not-configured" as const })),
    readFile: vi.fn(async () => ({ status: "not-configured" as const })),
  };
  const app = createApiApp({
    computers,
    spaces: { resolve, list, create },
    ...(spaceManagement ? { spaceManagement } : {}),
    conversationModels: { list: models },
    readSession,
    allowedOrigins: ["https://web.example.test"],
    ...(rateLimit ? { rateLimit } : {}),
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
    computers,
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
    () => f.client().spaces.get({ spaceId: f.spaceId }),
    () => f.client().spaces.members({ spaceId: f.spaceId }),
    () => f.client().spaces.audit({ spaceId: f.spaceId }),
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
  expect(f.resolve).toHaveBeenCalledTimes(12);
  expect(f.readSession).toHaveBeenCalledTimes(12);
  for (const args of f.resolve.mock.calls) expect(args).toEqual(["account", f.spaceId]);
});

it("rate limits invitation creation, preview and acceptance before using the token", async () => {
  const rateLimit = vi.fn<RateLimiter>(async () => false);
  const used = vi.fn();
  const management = new Proxy({} as SpaceManagement, { get: () => used });
  const f = fixture(rateLimit, management);
  f.admit();
  for (const invoke of [
    () => f.client().spaces.createInvitation({ spaceId: f.spaceId }),
    () => f.client().spaces.previewInvitation({ token: "ab".repeat(32) }),
    () => f.client().spaces.acceptInvitation({ token: "ab".repeat(32) }),
  ])
    await expect(invoke()).rejects.toMatchObject({
      code: "TOO_MANY_REQUESTS",
      data: { error: { code: "RATE_LIMITED" } },
    });
  expect(used).not.toHaveBeenCalled();
  expect(f.resolve).not.toHaveBeenCalled();
  expect(rateLimit.mock.calls).toEqual([
    ["rpc:account:spaces.createInvitation", { window: 60, max: 10 }],
    ["rpc:account:spaces.previewInvitation", { window: 60, max: 30 }],
    ["rpc:account:spaces.acceptInvitation", { window: 60, max: 20 }],
  ]);
  f.signOut();
  await expect(
    f.client().spaces.previewInvitation({ token: "ab".repeat(32) }),
  ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
});

it("checks trusted Origin for every new Space mutation", async () => {
  const f = fixture();
  const client = f.client("https://untrusted.example.test");
  const selection = { spaceId: f.spaceId };
  for (const invoke of [
    () => client.spaces.rename({ ...selection, name: "Renamed" }),
    () => client.spaces.delete(selection),
    () => client.spaces.leave(selection),
    () => client.spaces.updateMemberRole({ ...selection, accountId: "target", role: "owner" }),
    () => client.spaces.removeMember({ ...selection, accountId: "target" }),
    () => client.spaces.createInvitation(selection),
    () => client.spaces.cancelInvitation({ ...selection, id: "invite" }),
    () => client.spaces.cancelInvitations(selection),
    () => client.spaces.acceptInvitation({ token: "ab".repeat(32) }),
    () => client.spaces.setApprovalOverride({ ...selection, mode: "never" }),
    () => client.spaces.clearApprovalOverride(selection),
  ])
    await expect(invoke()).rejects.toMatchObject({
      code: "FORBIDDEN",
      data: { error: { code: "ORIGIN_REJECTED" } },
    });
  expect(f.resolve).not.toHaveBeenCalled();
});

it("lists only offered model names after fresh session and Space membership admission", async () => {
  const f = fixture();
  f.admit();
  await expect(f.client().agents.models({ spaceId: f.spaceId })).resolves.toEqual([
    { modelId: "offered", name: "Offered model", source: "deployment" },
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

it("refuses non-members on every Computer procedure and requires trusted mutation Origin", async () => {
  const f = fixture();
  for (const procedure of ["get", "start", "stop"] as const) {
    await expect(f.client().computers[procedure]({ spaceId: f.spaceId })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expect(f.computers[procedure]).not.toHaveBeenCalled();
  }
  f.admit();
  expect(await f.client().computers.get({ spaceId: f.spaceId })).toEqual({
    status: "not-configured",
  });
  for (const procedure of ["start", "stop"] as const) {
    await expect(
      f.client("https://untrusted.example.test").computers[procedure]({ spaceId: f.spaceId }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(await f.client().computers[procedure]({ spaceId: f.spaceId })).toEqual({
      status: "not-configured",
    });
    expect(f.computers[procedure]).toHaveBeenCalledWith(
      expect.objectContaining({ spaceId: f.spaceId }),
    );
  }
  f.signOut();
  await expect(f.client().computers.get({ spaceId: f.spaceId })).rejects.toMatchObject({
    code: "UNAUTHORIZED",
  });
});

it("admits file reads only for fresh Space members, with bounded inputs and read quotas", async () => {
  const rateLimit = vi.fn<RateLimiter>(async () => true);
  const f = fixture(rateLimit);
  for (const request of [
    () => f.client().computers.listDirectory({ spaceId: f.spaceId }),
    () => f.client().computers.readFile({ spaceId: f.spaceId, path: "note" }),
  ])
    await expect(request()).rejects.toMatchObject({ code: "NOT_FOUND" });
  expect(f.computers.listDirectory).not.toHaveBeenCalled();
  expect(f.computers.readFile).not.toHaveBeenCalled();
  f.admit();
  expect(await f.client().computers.listDirectory({ spaceId: f.spaceId })).toEqual({
    status: "not-configured",
  });
  expect(await f.client().computers.readFile({ spaceId: f.spaceId, path: "note" })).toEqual({
    status: "not-configured",
  });
  expect(f.computers.listDirectory).toHaveBeenCalledWith(
    expect.objectContaining({ spaceId: f.spaceId }),
    ".",
    100,
  );
  expect(f.computers.readFile).toHaveBeenCalledWith(
    expect.objectContaining({ spaceId: f.spaceId }),
    "note",
    65536,
  );
  expect(rateLimit.mock.calls.slice(-2)).toEqual([
    ["rpc:account:computers.listDirectory", { window: 60, max: 60 }],
    ["rpc:account:computers.readFile", { window: 60, max: 60 }],
  ]);
  await expect(
    f.client().computers.listDirectory({ spaceId: f.spaceId, limit: 201 }),
  ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  await expect(
    f.client().computers.readFile({ spaceId: f.spaceId, path: "note", maxBytes: 65537 }),
  ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  rateLimit.mockResolvedValue(false);
  await expect(
    f.client().computers.readFile({ spaceId: f.spaceId, path: "note" }),
  ).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS", data: { error: { code: "RATE_LIMITED" } } });
  expect(f.computers.readFile).toHaveBeenCalledTimes(1);
});
