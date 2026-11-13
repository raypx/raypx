import { expect, it, vi } from "vitest";
import { createApiClient } from "@raypx/client/api";
import { agentIdSchema } from "@raypx/core/agents";
import type { AuthSession } from "@raypx/core/auth";
import { SpaceNotFound, spaceIdSchema, spaceMemberSchema } from "@raypx/core/spaces";
import type { SpaceAccess } from "@raypx/spaces/server";
import type { RoutinesService } from "@raypx/jobs/routines";
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
  let admitted = false;
  const resolve = vi.fn<SpaceAccess["resolve"]>(async () => {
    if (!admitted) throw new SpaceNotFound();
    return {
      spaceId,
      member: spaceMemberSchema.parse({
        spaceId,
        accountId: "account",
        role: "owner",
        createdAt: new Date().toISOString(),
      }),
    } as Awaited<ReturnType<SpaceAccess["resolve"]>>;
  });
  const list = vi.fn<RoutinesService["list"]>().mockResolvedValue([]);
  const routines = new Proxy(
    { list },
    {
      get(target, key) {
        if (key === "list") return target.list;
        throw new Error(`Unexpected routine call ${String(key)}`);
      },
    },
  ) as unknown as RoutinesService;
  const readSession = vi.fn(async () => auth);
  const app = createApiApp({
    routines,
    spaces: {
      resolve,
      list: async () => [],
      create: async () => {
        throw new Error("unused");
      },
    },
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
    client,
    spaceId,
    resolve,
    readSession,
    list,
    admit() {
      admitted = true;
    },
    signOut() {
      auth = null;
    },
  };
}
const id = "10b7fce1-d771-42fb-a667-57b7f2569d4a";
const routine = {
  agentId: agentIdSchema.parse("agent"),
  name: "Routine",
  prompt: "Prompt",
  triggers: { webhook: true },
};
it("resolves fresh membership for every routine procedure including a deployment administrator", async () => {
  const f = fixture();
  const selected = { spaceId: f.spaceId, id };
  for (const request of [
    () => f.client().routines.list({ spaceId: f.spaceId }),
    () => f.client().routines.get(selected),
    () => f.client().routines.create({ spaceId: f.spaceId, routine }),
    () => f.client().routines.update({ ...selected, routine }),
    () => f.client().routines.pause(selected),
    () => f.client().routines.resume(selected),
    () => f.client().routines.delete(selected),
    () => f.client().routines.test({ ...selected, idempotencyKey: "manual" }),
    () => f.client().routines.history(selected),
    () => f.client().routines.events(selected),
    () => f.client().routines.rotateWebhookKey(selected),
  ])
    await expect(request()).rejects.toMatchObject({ code: "NOT_FOUND" });
  expect(f.resolve).toHaveBeenCalledTimes(11);
  expect(f.readSession).toHaveBeenCalledTimes(11);
  expect(f.list).not.toHaveBeenCalled();
  for (const args of f.resolve.mock.calls) expect(args).toEqual(["account", f.spaceId]);
});
it("requires trusted mutation Origin and stops access on the next signed-out request", async () => {
  const f = fixture();
  for (const request of [
    () =>
      f.client("https://untrusted.example.test").routines.create({ spaceId: f.spaceId, routine }),
    () =>
      f
        .client("https://untrusted.example.test")
        .routines.test({ spaceId: f.spaceId, id, idempotencyKey: "manual" }),
    () =>
      f
        .client("https://untrusted.example.test")
        .routines.rotateWebhookKey({ spaceId: f.spaceId, id }),
  ])
    await expect(request()).rejects.toMatchObject({ code: "FORBIDDEN" });
  expect(f.resolve).not.toHaveBeenCalled();
  f.admit();
  expect(await f.client().routines.list({ spaceId: f.spaceId })).toEqual([]);
  expect(f.list).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({ spaceId: f.spaceId }),
    undefined,
    50,
  );
  f.signOut();
  await expect(f.client().routines.list({ spaceId: f.spaceId })).rejects.toMatchObject({
    code: "UNAUTHORIZED",
  });
  expect(f.list).toHaveBeenCalledTimes(1);
});
