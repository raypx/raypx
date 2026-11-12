import { expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { ControlService } from "@raypx/control";
import {
  connected,
  controlAuth,
  memoryControlRepository,
  observed,
  running,
} from "@raypx/control/testing";
import { createApiClient } from "@raypx/client/api";
import { createApiApp } from "./api.js";

it("limits host grants before credential lookup without retaining bearer secrets", async () => {
  const hostGrant = vi.fn(),
    rateLimit = vi.fn(async (_key: string, _rule: { window: number; max: number }) => false);
  const app = createApiApp({
    control: { hostGrant } as unknown as ControlService,
    rateLimit,
    clientIpHeader: "cf-connecting-ip",
    allowedOrigins: [],
    readSession: async () => null,
    authHandler: async () => new Response(null),
  });
  const credential = "synthetic-host-secret-".repeat(3);
  const api = createApiClient({
    baseUrl: "https://api.example.test",
    headers: { "cf-connecting-ip": "203.0.113.7", "x-raypx-client-ip": "forged" },
    fetch: async (input, init) => app.fetch(new Request(input, init)),
  });
  await expect(api.hosts.grant({ credential })).rejects.toMatchObject({
    code: "TOO_MANY_REQUESTS",
    data: { error: { code: "RATE_LIMITED" } },
  });
  expect(hostGrant).not.toHaveBeenCalled();
  expect(rateLimit).toHaveBeenCalledTimes(1);
  expect(rateLimit).toHaveBeenNthCalledWith(
    1,
    `rpc:hosts.grant:peer:${createHash("sha256").update("203.0.113.7").digest("hex")}`,
    { window: 60, max: 120 },
  );
  rateLimit.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
  await expect(api.hosts.grant({ credential })).rejects.toMatchObject({
    code: "TOO_MANY_REQUESTS",
  });
  expect(rateLimit.mock.calls[2]?.[0]).toMatch(/^rpc:hosts.grant:credential:[a-f0-9]{64}$/);
  expect(JSON.stringify(rateLimit.mock.calls)).not.toContain(credential);
  expect(hostGrant).not.toHaveBeenCalled();
});
it("rejects credentials missing bootstrap attribution before grants or relay access", async () => {
  const repository = memoryControlRepository(),
    service = new ControlService(repository),
    host = await connected(service);
  const key = await service.credentials.authorizeHost(host.auth, host.grant),
    grant = await service.credentials.hostGrant(key.credential);
  const actor = await service.credentials.authenticate(
    "device",
    grant.grant.token,
    crypto.randomUUID(),
  );
  await repository.transaction(host.auth.user.id, async (tx) => {
    for (const row of await tx.list("credential")) {
      delete row.bootstrapSessionId;
      await tx.put("credential", row);
    }
  });
  await expect(service.credentials.hostGrant(key.credential)).rejects.toThrow("AUTH_REQUIRED");
  await expect(service.credentials.validate(actor)).rejects.toThrow("AUTH_REQUIRED");
  const fresh = await service.credentials.authorizeHost(host.auth, host.grant);
  await expect(service.credentials.hostGrant(fresh.credential)).resolves.toHaveProperty(
    "accountId",
    host.auth.user.id,
  );
});
it("purges only the revoked device's terminal content and preserves managed history", async () => {
  const repository = memoryControlRepository(),
    service = new ControlService(repository),
    first = await connected(service),
    second = await connected(service, first.auth);
  for (const host of [first, second]) {
    await running(service, host);
    await service.observed.observed(host.actor, observed(host.input.projectId).frame);
  }
  await service.credentials.revoke(first.auth.user.id, first.grant);
  await repository.read(first.auth.user.id, async (tx) => {
    for (const kind of ["observed_session", "observed_request"] as const) {
      expect(await tx.list(kind, first.grant.deviceId)).toEqual([]);
      expect(await tx.list(kind, second.grant.deviceId)).toHaveLength(1);
    }
    expect(await tx.list("task")).toHaveLength(2);
  });
  await service.credentials.revoke(first.auth.user.id, first.grant);
});

it("requires a trusted origin before cookie-backed host authorization", async () => {
  const service = new ControlService(memoryControlRepository()),
    fixture = await connected(service);
  const app = createApiApp({
    control: service,
    allowedOrigins: ["views://main"],
    readSession: async () => fixture.auth,
    authHandler: async () => new Response(null),
  });
  const client = (origin?: string) =>
    createApiClient({
      baseUrl: "https://api.example.test",
      headers: origin ? { origin } : {},
      fetch: async (input, init) => app.fetch(new Request(input, init)),
    });
  for (const origin of [undefined, "https://untrusted.example.test"])
    await expect(client(origin).hosts.authorize(fixture.grant)).rejects.toMatchObject({
      code: "FORBIDDEN",
      data: { error: { code: "ORIGIN_REJECTED" } },
    });
  const authorization = await client("views://main").hosts.authorize(fixture.grant);
  expect(authorization.accountId).toBe(fixture.auth.user.id);
  expect((await client().hosts.grant({ credential: authorization.credential })).accountId).toBe(
    fixture.auth.user.id,
  );
});

it("limits independent host credentials to one account/device and renews after the browser session ends", async () => {
  const repository = memoryControlRepository();
  let now = Date.now();
  const service = new ControlService(repository, () => now),
    auth = controlAuth();
  const fixture = await connected(service, auth),
    authorization = await service.credentials.authorizeHost(auth, fixture.grant);
  repository.validSession = false;
  await expect(
    service.credentials.authenticate("device", fixture.grant.token, crypto.randomUUID()),
  ).rejects.toThrow("AUTH_REQUIRED");
  const first = await service.credentials.hostGrant(authorization.credential);
  expect(first.accountId).toBe(auth.user.id);
  const actor = await service.credentials.authenticate(
    "device",
    first.grant.token,
    crypto.randomUUID(),
  );
  await expect(service.credentials.validate(actor)).resolves.toBeUndefined();
  now += 20 * 60_000;
  await expect(service.credentials.validate(actor)).rejects.toThrow("AUTH_REQUIRED");
  const renewed = await service.credentials.hostGrant(authorization.credential);
  expect(renewed.grant.deviceId).toBe(fixture.grant.deviceId);
  expect(renewed.grant.token).not.toBe(first.grant.token);
  await expect(
    service.credentials.authenticate("viewer", renewed.grant.token, crypto.randomUUID()),
  ).rejects.toThrow("AUTH_REQUIRED");
  await service.credentials.revoke(auth.user.id, fixture.grant);
  await expect(service.credentials.hostGrant(authorization.credential)).rejects.toThrow(
    "AUTH_REQUIRED",
  );
});
it("revokes a host credential and its outstanding grants without relying on cookies", async () => {
  const service = new ControlService(memoryControlRepository()),
    fixture = await connected(service);
  const authorization = await service.credentials.authorizeHost(fixture.auth, fixture.grant),
    response = await service.credentials.hostGrant(authorization.credential);
  const actor = await service.credentials.authenticate(
    "device",
    response.grant.token,
    crypto.randomUUID(),
  );
  const second = await service.credentials.authorizeHost(fixture.auth, fixture.grant);
  await expect(service.credentials.hostGrant(authorization.credential)).rejects.toThrow(
    "AUTH_REQUIRED",
  );
  await service.credentials.revokeHost(second.credential);
  await expect(service.credentials.validate(actor)).rejects.toThrow("AUTH_REQUIRED");
  await expect(service.credentials.hostGrant(authorization.credential)).rejects.toThrow(
    "AUTH_REQUIRED",
  );
  await expect(service.credentials.hostGrant(second.credential)).rejects.toThrow("AUTH_REQUIRED");
  await expect(
    service.credentials.authorizeHost(controlAuth("other-user"), fixture.grant),
  ).rejects.toThrow("NOT_FOUND");
});

it("replaces lost host keys atomically instead of exhausting an eight-key allowance", async () => {
  const service = new ControlService(memoryControlRepository()),
    host = await connected(service);
  const keys = await Promise.all(
    Array.from({ length: 12 }, () => service.credentials.authorizeHost(host.auth, host.grant)),
  );
  for (const key of keys.slice(0, -1))
    await expect(service.credentials.hostGrant(key.credential)).rejects.toThrow("AUTH_REQUIRED");
  expect((await service.credentials.hostGrant(keys.at(-1)!.credential)).accountId).toBe(
    host.auth.user.id,
  );
});
it("revokes only credentials bootstrapped by the selected browser session", async () => {
  const service = new ControlService(memoryControlRepository());
  const first = await connected(service);
  const other = controlAuth(first.auth.user.id);
  other.session.id = crypto.randomUUID();
  const second = await connected(service, other);
  const firstKey = await service.credentials.authorizeHost(first.auth, first.grant);
  const secondKey = await service.credentials.authorizeHost(other, second.grant);
  const firstGrant = await service.credentials.hostGrant(firstKey.credential);
  const secondGrant = await service.credentials.hostGrant(secondKey.credential);
  const firstActor = await service.credentials.authenticate(
    "device",
    firstGrant.grant.token,
    crypto.randomUUID(),
  );
  const secondActor = await service.credentials.authenticate(
    "device",
    secondGrant.grant.token,
    crypto.randomUUID(),
  );
  await service.credentials.revokeHostAuthorizations(first.auth.user.id, first.auth.session.id);
  await expect(service.credentials.hostGrant(firstKey.credential)).rejects.toThrow("AUTH_REQUIRED");
  await expect(service.credentials.validate(firstActor)).rejects.toThrow("AUTH_REQUIRED");
  await expect(service.credentials.hostGrant(secondKey.credential)).resolves.toHaveProperty(
    "accountId",
    other.user.id,
  );
  await expect(service.credentials.validate(secondActor)).resolves.toBeUndefined();
  // A no-op session revocation must not change the security epoch or surviving keys.
  await service.credentials.revokeHostAuthorizations(first.auth.user.id, "unknown-session");
  await expect(service.credentials.validate(secondActor)).resolves.toBeUndefined();
  await service.credentials.revokeHostAuthorizations(first.auth.user.id);
  await expect(service.credentials.hostGrant(secondKey.credential)).rejects.toThrow(
    "AUTH_REQUIRED",
  );
});
it("requires a recent session for bootstrap and invalidates grants after password/security revocation", async () => {
  const repository = memoryControlRepository(),
    service = new ControlService(repository),
    host = await connected(service);
  await expect(
    service.credentials.authorizeHost(
      {
        ...host.auth,
        session: { ...host.auth.session, createdAt: new Date(Date.now() - 3600_000) },
      },
      host.grant,
    ),
  ).rejects.toThrow("AUTH_REQUIRED");
  const key = await service.credentials.authorizeHost(host.auth, host.grant),
    grant = await service.credentials.hostGrant(key.credential);
  const actor = await service.credentials.authenticate(
    "device",
    grant.grant.token,
    crypto.randomUUID(),
  );
  repository.securityVersion = "password changed";
  await expect(service.credentials.hostGrant(key.credential)).rejects.toThrow("AUTH_REQUIRED");
  await expect(service.credentials.validate(actor)).rejects.toThrow("AUTH_REQUIRED");
  const replacement = await service.credentials.authorizeHost(host.auth, host.grant);
  await service.credentials.revokeHostAuthorizations(host.auth.user.id);
  await expect(service.credentials.hostGrant(replacement.credential)).rejects.toThrow(
    "AUTH_REQUIRED",
  );
  // The old cookie cannot mint another key in the interval before auth deletes sessions.
  await expect(service.credentials.authorizeHost(host.auth, host.grant)).rejects.toThrow(
    "AUTH_REQUIRED",
  );
});
