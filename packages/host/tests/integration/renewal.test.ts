import { expect, it, vi } from "vite-plus/test";
import { hostFixtures } from "../helpers/control.js";
const { control } = hostFixtures();

it.each(["close", "error"] as const)(
  "backs off grants rejected through %s after successful renewal",
  async (trigger) => {
    let reject = false;
    const attempts: number[] = [];
    const renewGrant = vi.fn(
      async (_account: string, binding: { deviceId: string; epoch: number }) => {
        attempts.push(Date.now());
        return {
          ...binding,
          token: "renewed-" + crypto.randomUUID(),
          expiresAt: new Date(Date.now() + 600_000).toISOString(),
        };
      },
    );
    const f = await control({ renewGrant }, () => reject);
    const initialRequests = f.renew.mock.calls.length;
    reject = true;
    for (const peer of f.sockets) {
      if (trigger === "close") peer.close(4001, "Rejected grant");
      else peer.send({ type: "error", code: "AUTH_REQUIRED" });
    }
    await expect.poll(() => attempts.length, { timeout: 8000 }).toBeGreaterThanOrEqual(3);
    expect(attempts[1]! - attempts[0]!).toBeGreaterThanOrEqual(700);
    expect(attempts[2]! - attempts[1]!).toBeGreaterThanOrEqual(1400);
    expect(f.renew).toHaveBeenCalledTimes(initialRequests);
  },
  10_000,
);

it("finishes an in-flight command before replacing its socket for proactive renewal", async () => {
  const renewGrant = vi.fn(
    async (_account: string, binding: { deviceId: string; epoch: number }) => ({
      ...binding,
      token: "renewed-" + crypto.randomUUID(),
      expiresAt: new Date(Date.now() + 600_000).toISOString(),
    }),
  );
  const f = await control({ renewGrant }),
    original = f.request.getMockImplementation()!;
  let release!: () => void,
    started = false;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  f.request.mockImplementation(async (method, params) => {
    if (method === "agents.remote") {
      started = true;
      await gate;
      return { ok: true, value: {} };
    }
    return original(method, params);
  });
  const routeId = crypto.randomUUID();
  for (const peer of f.sockets)
    peer.send({
      type: "command",
      routeId,
      command: {
        id: crypto.randomUUID(),
        deviceId: f.grant.deviceId,
        expiresAt: new Date(Date.now() + 15_000).toISOString(),
        request: { method: "tasks.cancel", input: { id: crypto.randomUUID() } },
      },
    });
  await expect.poll(() => started).toBe(true);
  const pending = f.value.refreshGrant();
  await expect.poll(() => renewGrant.mock.calls.length).toBe(1);
  expect(f.frames.filter((frame) => frame.type === "auth")).toHaveLength(1);
  const deferredRoute = crypto.randomUUID();
  for (const peer of f.sockets)
    peer.send({
      type: "command",
      routeId: deferredRoute,
      command: {
        id: crypto.randomUUID(),
        deviceId: f.grant.deviceId,
        expiresAt: new Date(Date.now() + 15_000).toISOString(),
        request: { method: "tasks.cancel", input: { id: crypto.randomUUID() } },
      },
    });
  await expect
    .poll(() =>
      f.frames.find((frame) => frame.type === "result" && frame.routeId === deferredRoute),
    )
    .toMatchObject({ result: { ok: false, code: "REQUEST_CLOSED" } });
  expect(f.request.mock.calls.filter(([method]) => method === "agents.remote")).toHaveLength(1);
  release();
  expect(await pending).toBe(true);
  await expect.poll(() => f.frames.filter((frame) => frame.type === "auth").length).toBe(2);
  expect(f.frames.some((frame) => frame.type === "result" && frame.routeId === routeId)).toBe(true);
});

it("caps proactive renewal draining at its timeout without cancelling the in-flight task", async () => {
  const renewGrant = vi.fn(
    async (_account: string, binding: { deviceId: string; epoch: number }) => ({
      ...binding,
      token: "renewed-" + crypto.randomUUID(),
      expiresAt: new Date(Date.now() + 600_000).toISOString(),
    }),
  );
  // Shortened from the production ten seconds; the cap matters, not its length.
  const drainTimeoutMs = 1000;
  const f = await control({ renewGrant, drainTimeoutMs }),
    original = f.request.getMockImplementation()!;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  f.request.mockImplementation(async (method, params) =>
    method === "agents.remote"
      ? gate.then(() => ({ ok: true, value: {} }))
      : original(method, params),
  );
  for (const peer of f.sockets)
    peer.send({
      type: "command",
      routeId: crypto.randomUUID(),
      command: {
        id: crypto.randomUUID(),
        deviceId: f.grant.deviceId,
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        request: { method: "tasks.cancel", input: { id: crypto.randomUUID() } },
      },
    });
  await expect
    .poll(() => f.request.mock.calls.some(([method]) => method === "agents.remote"))
    .toBe(true);
  try {
    const started = Date.now();
    expect(await f.value.refreshGrant()).toBe(true);
    expect(Date.now() - started).toBeGreaterThanOrEqual(drainTimeoutMs - 100);
    expect(Date.now() - started).toBeLessThan(drainTimeoutMs + 3_000);
    await expect.poll(() => f.frames.filter((frame) => frame.type === "auth").length).toBe(2);
    expect(f.request.mock.calls.some(([method]) => method === "agents.detach")).toBe(false);
  } finally {
    release();
  }
}, 8_000);

it("renews a connection without cancelling tasks and disables execution after server revocation", async () => {
  const f = await control();
  await f.value.attach("account", f.base, {
    ...f.grant,
    token: "fresh-grant-" + crypto.randomUUID(),
    expiresAt: new Date(Date.now() + 59_000).toISOString(),
  });
  await expect.poll(() => f.value.info("account").connected).toBe(true);
  expect(f.renew).toHaveBeenCalled();
  expect(f.request.mock.calls.some(([method]) => method === "agents.detach")).toBe(false);
  for (const socket of f.sockets) socket.close(4003, "Revoked");
  await expect.poll(() => f.value.info("account").enabled).toBe(false);
  expect(f.request).toHaveBeenCalledWith("agents.detach", {
    binding: `account:${f.grant.deviceId}:1`,
  });
});

it("renews expiring grants entirely in Native without waking the renderer or detaching tasks", async () => {
  const renewGrant = vi.fn(
    async (_accountId: string, binding: { deviceId: string; epoch: number }) => ({
      ...binding,
      token: "native-renewed-token-" + crypto.randomUUID(),
      expiresAt: new Date(Date.now() + 600_000).toISOString(),
    }),
  );
  const f = await control({ renewGrant });
  f.renew.mockClear();
  await f.value.attach("account", f.base, {
    ...f.grant,
    expiresAt: new Date(Date.now() + 59_000).toISOString(),
  });
  await expect
    .poll(() =>
      f.frames.some(
        (frame) => frame.type === "auth" && frame.token.startsWith("native-renewed-token-"),
      ),
    )
    .toBe(true);
  await expect.poll(() => f.value.info("account").connected).toBe(true);
  expect(renewGrant).toHaveBeenCalledWith("account", { deviceId: f.grant.deviceId, epoch: 1 });
  expect(f.renew).not.toHaveBeenCalled();
  expect(f.request.mock.calls.some(([method]) => method === "agents.detach")).toBe(false);
});

it("does not reconnect a late native grant after logout and detaches on an expired account session", async () => {
  let complete!: (value: {
    deviceId: string;
    epoch: number;
    token: string;
    expiresAt: string;
  }) => void;
  const f = await control({
    renewGrant: () =>
      new Promise((resolve) => {
        complete = resolve;
      }),
  });
  const pending = f.value.refreshGrant();
  await f.value.detach();
  complete({ ...f.grant, token: "late-token" });
  expect(await pending).toBe(false);
  expect(f.value.info("account").connected).toBe(false);
  expect(f.frames.some((frame) => frame.type === "auth" && frame.token === "late-token")).toBe(
    false,
  );
  const expired = await control({
    renewGrant: async () => {
      throw Object.assign(new Error("AUTH_REQUIRED"), { code: "UNAUTHORIZED" });
    },
  });
  expect(await expired.value.refreshGrant()).toBe(false);
  expect(expired.value.info("account").connected).toBe(false);
  expect(expired.request).toHaveBeenCalledWith("agents.detach", {
    binding: `account:${expired.grant.deviceId}:1`,
  });
});

it("delegates terminal authorization loss to its owner", async () => {
  const lost = vi.fn(async () => {});
  const fixture = await control({
    renewGrant: async () => {
      throw Object.assign(new Error("expired"), { code: "UNAUTHORIZED" });
    },
    authorizationLost: lost,
  });
  expect(await fixture.value.refreshGrant()).toBe(false);
  expect(lost).toHaveBeenCalledExactlyOnceWith("AUTH_REQUIRED");
});

it("tries the preferred protocol again when explicitly attaching after an old-server connection", async () => {
  const fixture = await control({ protocolVersion: 3 });
  expect(fixture.value.info("account").terminalSupported).toBe(false);
  await fixture.value.attach("account", fixture.base, {
    ...fixture.grant,
    token: "new-grant-" + crypto.randomUUID(),
  });
  await expect.poll(() => fixture.frames.filter((frame) => frame.type === "auth").length).toBe(2);
  expect(fixture.frames.filter((frame) => frame.type === "auth").at(-1)).toMatchObject({
    protocolVersion: 3,
  });
});

it("recovers v3 after an old server is upgraded, on reconnect and grant renewal", async () => {
  let version: 2 | 3 = 2;
  const renewGrant = vi.fn(
    async (_account: string, binding: { deviceId: string; epoch: number }) => ({
      ...binding,
      token: "renewed-" + crypto.randomUUID(),
      expiresAt: new Date(Date.now() + 600_000).toISOString(),
    }),
  );
  const f = await control(
    { protocolVersion: 3, renewGrant },
    () => false,
    () => version,
  );
  const versions = () =>
    f.frames.filter((frame) => frame.type === "auth").map((frame) => frame.protocolVersion);
  expect(versions()).toEqual([3, 2]);
  expect(f.value.info("account").terminalSupported).toBe(false);
  version = 3;
  for (const socket of f.sockets) socket.close(1012, "Server upgraded");
  await expect.poll(() => f.value.info("account").terminalSupported).toBe(true);
  expect(versions()).toEqual([3, 2, 3]);
  // Roll back once, then upgrade again while renewing a credential. Neither
  // recovery requires a renderer attach or a daemon restart.
  version = 2;
  for (const socket of f.sockets) socket.close(1012, "Rolling deployment");
  await expect.poll(versions, { timeout: 8000 }).toEqual([3, 2, 3, 3, 2]);
  await expect.poll(() => f.value.info("account").connected).toBe(true);
  version = 3;
  expect(await f.value.refreshGrant()).toBe(true);
  await expect.poll(() => f.value.info("account").terminalSupported).toBe(true);
  expect(versions()).toEqual([3, 2, 3, 3, 2, 3]);
  expect(f.request.mock.calls.some(([method]) => method === "agents.detach")).toBe(false);
});
