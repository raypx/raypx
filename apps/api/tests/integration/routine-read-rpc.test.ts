import { expect, it, vi } from "vitest";
import { createApiClient } from "@raypx/client/api";
import type { AuthSession } from "@raypx/core/auth";
import { routineSchema } from "@raypx/core/routines";
import { spaceIdSchema, spaceMemberSchema } from "@raypx/core/spaces";
import { resolveSpaceScope } from "@raypx/spaces/server";
import { createRoutinesService, type RoutinesRepository } from "@raypx/jobs/routines";
import { getApiEnvironment } from "../../src/env.js";
import { createApiApp } from "../helpers/app.js";

function fixture(authUrl?: string) {
  const environment = getApiEnvironment(authUrl ? { AUTH_URL: authUrl } : {});
  const accountId = `routine-reader-${crypto.randomUUID()}`;
  const spaceId = spaceIdSchema.parse(`routine-read-${crypto.randomUUID()}`);
  const id = crypto.randomUUID();
  const instant = "2026-11-14T00:00:00.000Z";
  const scope = resolveSpaceScope(
    spaceMemberSchema.parse({ spaceId, accountId, role: "member", createdAt: instant }),
    accountId,
    spaceId,
  );
  const routine = routineSchema.parse({
    id,
    spaceId,
    ownerAccountId: accountId,
    agentId: "routine-read-agent",
    name: "Receive updates",
    prompt: "Inspect updates",
    enabled: true,
    triggers: {
      webhook: true,
      repository: { events: ["push"] },
      email: { allowedSender: "sender@example.test" },
    },
    emailAddress: `${id}@routines.example.test`,
    nextDueAt: null,
    createdAt: instant,
    updatedAt: instant,
  });
  const list = vi.fn<RoutinesRepository["list"]>(async (current) => {
    expect(current).toBe(scope);
    return [routine];
  });
  const get = vi.fn<RoutinesRepository["get"]>(async (current, selected) => {
    expect(current).toBe(scope);
    expect(selected).toBe(id);
    return routine;
  });
  const open = vi.fn();
  const routines = createRoutinesService({ list, get } as unknown as RoutinesRepository, {
    dispatch() {},
    secrets: { seal: vi.fn(), open },
    emailDomain: "routines.example.test",
    ...(environment.publicApiOrigin ? { publicApiOrigin: environment.publicApiOrigin } : {}),
  });
  const auth: AuthSession = {
    user: { id: accountId, name: "Reader", email: "reader@example.test", emailVerified: true },
    session: {
      id: crypto.randomUUID(),
      userId: accountId,
      expiresAt: new Date(Date.now() + 60_000),
    },
  };
  const resolve = vi.fn(async (owner: string, selected: typeof spaceId) => {
    expect(owner).toBe(accountId);
    expect(selected).toBe(spaceId);
    return scope;
  });
  const app = createApiApp({
    routines,
    spaces: {
      resolve,
      list: async () => [],
      create: async () => {
        throw new Error("Unused Space creation");
      },
    },
    readSession: async () => auth,
    allowedOrigins: ["https://web.example.test"],
  });
  const client = createApiClient({
    baseUrl: "https://api.example.test",
    headers: { origin: "https://web.example.test" },
    fetch: async (url, init) => app.fetch(new Request(url, init)),
  });
  return { client, accountId, spaceId, id, routine, list, get, resolve, open };
}

it.each([undefined, "https://ingress.example.test/"])(
  "returns server-owned ingress metadata through both scoped routine read procedures (%s)",
  async (authUrl) => {
    const f = fixture(authUrl);
    const expected = {
      webhook: {
        url: authUrl ? `${authUrl}routines/${f.id}/webhook` : null,
        unavailableReason: authUrl ? null : "PUBLIC_API_ORIGIN_NOT_CONFIGURED",
      },
      repository: {
        url: authUrl ? `${authUrl}routines/${f.id}/repository` : null,
        unavailableReason: authUrl ? null : "PUBLIC_API_ORIGIN_NOT_CONFIGURED",
      },
      email: { address: f.routine.emailAddress, unavailableReason: null },
    };
    const listed = await f.client.routines.list({
      spaceId: f.spaceId,
      agentId: f.routine.agentId,
      limit: 25,
    });
    const selected = await f.client.routines.get({ spaceId: f.spaceId, id: f.id });
    expect(listed).toEqual([{ ...f.routine, ingress: expected }]);
    expect(selected).toEqual({ ...f.routine, ingress: expected });
    expect(f.list).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ spaceId: f.spaceId }),
      f.routine.agentId,
      25,
    );
    expect(f.get).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ spaceId: f.spaceId }),
      f.id,
    );
    expect(f.resolve.mock.calls).toEqual([
      [f.accountId, f.spaceId],
      [f.accountId, f.spaceId],
    ]);
    expect(f.open).not.toHaveBeenCalled();
    for (const key of ["webhookKey", "repositorySecret", "secret", "webhookDigest"])
      expect(selected).not.toHaveProperty(key);
  },
);
