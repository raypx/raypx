import { expect, it, vi } from "vitest";
import type { DeviceConnectorRegistry } from "@raypx/computers/server";
import { createDeviceConnectorRoutes } from "./device-connector.js";

function fixture(options: Parameters<typeof createDeviceConnectorRoutes>[1] = {}) {
  const claim = vi.fn(async (_input: unknown) => ({
    claimId: "claim",
    claimToken: "a".repeat(64),
    accountId: "member",
    accountLabel: "Member",
    spaceId: "space",
    spaceLabel: "Space",
    expiresAt: "2100-01-01T00:00:00Z",
  }));
  const authenticate = vi.fn(async (_credential: string) => ({
    deviceId: "device",
    accountId: "member",
    credentialRevision: 1,
  }));
  const grant = vi.fn(async (_identity: unknown, _input: unknown) => ({
    id: "grant",
    deviceId: "device",
    spaceId: "space",
    directory: "/granted",
    revision: 1,
  }));
  const refresh = vi.fn(async () => {});
  const registry = {
    repository: { claim, authenticate, grant },
    refresh,
  } as unknown as DeviceConnectorRegistry;
  const app = createDeviceConnectorRoutes(registry, options);
  const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
    app.request(path, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
    });
  return { app, claim, authenticate, grant, refresh, post };
}
it("denies browser Origins and unsupported pairing versions before credential possession", async () => {
  const f = fixture();
  const body = {
    protocolVersion: 1,
    code: "paircode1234",
    deviceName: "My machine",
    platform: "darwin",
  };
  const browser = await f.post("/device/pairing/claim", body, { origin: "http://127.0.0.1:3000" });
  expect(browser.status).toBe(403);
  expect(browser.headers.get("cache-control")).toBe("no-store");
  expect(f.claim).not.toHaveBeenCalled();
  const unsupported = await f.post("/device/pairing/claim", { ...body, protocolVersion: 0 });
  expect(unsupported.status).toBe(400);
  expect(f.claim).not.toHaveBeenCalled();
  const accepted = await f.post("/device/pairing/claim", body);
  expect(accepted.status).toBe(200);
  expect(f.claim).toHaveBeenCalledExactlyOnceWith(body);
});
it("requires credential possession and rejects a caller-selected different device", async () => {
  const f = fixture();
  const body = {
    protocolVersion: 1,
    deviceId: "another-device",
    spaceId: "space",
    directory: "/granted",
  };
  expect((await f.post("/device/grants/confirm", body)).status).toBe(403);
  expect(f.authenticate).not.toHaveBeenCalled();
  expect(
    (await f.post("/device/grants/confirm", body, { authorization: "Bearer " + "b".repeat(64) }))
      .status,
  ).toBe(400);
  expect(f.grant).not.toHaveBeenCalled();
  const response = await f.post(
    "/device/grants/confirm",
    { ...body, deviceId: "device" },
    { authorization: "Bearer " + "b".repeat(64) },
  );
  expect(response.status).toBe(200);
  expect(f.grant).toHaveBeenCalledOnce();
  expect(f.refresh).toHaveBeenCalledOnce();
});
it("bounds malformed and streamed oversized bodies and returns safe errors", async () => {
  const f = fixture();
  const invalid = await f.app.request("/device/pairing/claim", { method: "POST", body: "{" });
  expect(invalid.status).toBe(400);
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode("x".repeat(16_385)));
      controller.close();
    },
  });
  const oversized = await f.app.request("/device/pairing/claim", { method: "POST", body: stream });
  expect(oversized.status).toBe(413);
  expect(f.claim).not.toHaveBeenCalled();
  f.claim.mockRejectedValueOnce(new Error("private-credential"));
  const failed = await f.post("/device/pairing/claim", {
    protocolVersion: 1,
    code: "paircode1234",
    deviceName: "My machine",
  });
  expect(await failed.text()).toBe('{"error":"ACCESS_DENIED"}');
});

it("keeps the pairing IP quota when an attacker rotates unrelated bearer headers", async () => {
  const counts = new Map<string, number>();
  const rateLimit = vi.fn(async (key: string, rule: { window: number; max: number }) => {
    const count = (counts.get(key) ?? 0) + 1;
    counts.set(key, count);
    return count <= rule.max;
  });
  const f = fixture({ rateLimit, clientIpHeader: "x-owned-client-ip" });
  const body = { protocolVersion: 1, code: "paircode1234", deviceName: "Fixture machine" };
  for (let index = 0; index < 20; index++)
    expect(
      (
        await f.post("/device/pairing/claim", body, {
          authorization: `Bearer ${crypto.randomUUID()}`,
          "x-owned-client-ip": "127.0.0.1",
        })
      ).status,
    ).toBe(200);
  const blocked = await f.post("/device/pairing/claim", body, {
    authorization: `Bearer ${crypto.randomUUID()}`,
    "x-owned-client-ip": "127.0.0.1",
  });
  expect(blocked.status).toBe(429);
  expect(f.claim).toHaveBeenCalledTimes(20);
  expect(counts.size).toBe(1);
  const oversized = await f.post("/device/pairing/claim", body, {
    authorization: "Bearer " + "x".repeat(521),
  });
  expect(oversized.status).toBe(403);
  expect(f.claim).toHaveBeenCalledTimes(20);
});
it("counts authenticated possession requests against both IP and credential quotas", async () => {
  const rateLimit = vi.fn(async (_key: string, _rule: { window: number; max: number }) => true);
  const f = fixture({ rateLimit });
  const body = { protocolVersion: 1, deviceId: "device", spaceId: "space", directory: "/granted" };
  expect(
    (await f.post("/device/grants/confirm", body, { authorization: "Bearer " + "a".repeat(64) }))
      .status,
  ).toBe(200);
  expect(rateLimit).toHaveBeenCalledTimes(2);
  expect(rateLimit.mock.calls[0]?.[0]).toContain("device-connector:ip:");
  expect(rateLimit.mock.calls[1]?.[0]).toContain("device-connector:credential:");
});
