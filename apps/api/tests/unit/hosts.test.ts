import { expect, it } from "vite-plus/test";
import { ControlService } from "../../server/control/service.js";
import { connected, controlAuth, memoryControlRepository } from "../helpers/control.js";
import { createApiClient } from "@raypx/client";
import { createApiApp } from "../../server/api.js";

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
    authorization = await service.authorizeHost(auth, fixture.grant);
  repository.validSession = false;
  await expect(
    service.authenticate("device", fixture.grant.token, crypto.randomUUID()),
  ).rejects.toThrow("AUTH_REQUIRED");
  const first = await service.hostGrant(authorization.credential);
  expect(first.accountId).toBe(auth.user.id);
  const actor = await service.authenticate("device", first.grant.token, crypto.randomUUID());
  await expect(service.validate(actor)).resolves.toBeUndefined();
  now += 20 * 60_000;
  await expect(service.validate(actor)).rejects.toThrow("AUTH_REQUIRED");
  const renewed = await service.hostGrant(authorization.credential);
  expect(renewed.grant.deviceId).toBe(fixture.grant.deviceId);
  expect(renewed.grant.token).not.toBe(first.grant.token);
  await expect(
    service.authenticate("viewer", renewed.grant.token, crypto.randomUUID()),
  ).rejects.toThrow("AUTH_REQUIRED");
  await service.revoke(auth.user.id, fixture.grant);
  await expect(service.hostGrant(authorization.credential)).rejects.toThrow("AUTH_REQUIRED");
});
it("revokes a host credential and its outstanding grants without relying on cookies", async () => {
  const service = new ControlService(memoryControlRepository()),
    fixture = await connected(service);
  const authorization = await service.authorizeHost(fixture.auth, fixture.grant),
    response = await service.hostGrant(authorization.credential);
  const actor = await service.authenticate("device", response.grant.token, crypto.randomUUID());
  const second = await service.authorizeHost(fixture.auth, fixture.grant);
  await service.revokeHost(authorization.credential);
  await expect(service.validate(actor)).rejects.toThrow("AUTH_REQUIRED");
  await expect(service.hostGrant(authorization.credential)).rejects.toThrow("AUTH_REQUIRED");
  await expect(service.hostGrant(second.credential)).rejects.toThrow("AUTH_REQUIRED");
  await expect(service.authorizeHost(controlAuth("other-user"), fixture.grant)).rejects.toThrow(
    "NOT_FOUND",
  );
});
