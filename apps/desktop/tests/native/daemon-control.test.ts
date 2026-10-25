import { expect, it, vi } from "vite-plus/test";
import { DaemonControlProxy } from "../../native/daemon-control";
import { createApiClient, type ApiClient } from "@raypx/client";
import type { DeviceGrant } from "@raypx/contracts/tasks";

it("revokes a late bootstrap credential when account selection changes", async () => {
  let finish!: (value: unknown) => void;
  const grant: DeviceGrant = {
    deviceId: crypto.randomUUID(),
    epoch: 1,
    token: "x".repeat(64),
    expiresAt: new Date(Date.now() + 60000).toISOString(),
  };
  const request = vi.fn(async (method: string) =>
    method === "host.info" ? { authorized: false } : true,
  );
  const revoke = vi.fn(async () => ({ revoked: true }));
  const authorize = vi.fn(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const api = {
    account: { get: async () => ({ id: "account-a" }) },
    hosts: { authorize, revoke },
  } as unknown as Pick<ApiClient, "account" | "hosts">;
  const control = new DaemonControlProxy({ request }, "https://api.example.test", api);
  const pending = control.attach("account-a", "https://api.example.test", grant);
  const rejected = pending.catch((error: unknown) => error);
  await expect.poll(() => authorize.mock.calls.length).toBe(1);
  await control.session(null);
  finish({ accountId: "account-a", ...grant, credential: "private-test-credential" });
  expect(await rejected).toMatchObject({ message: "AUTH_REQUIRED" });
  expect(revoke).toHaveBeenCalledWith({ credential: "private-test-credential" });
  expect(request.mock.calls.some(([method]) => method === "host.authorize")).toBe(false);
});

it("falls back to browser-renewed managed tasks only when the host endpoint is absent", async () => {
  const grant: DeviceGrant = {
    deviceId: crypto.randomUUID(),
    epoch: 1,
    token: "x".repeat(64),
    expiresAt: new Date(Date.now() + 600000).toISOString(),
  };
  const request = vi.fn(async (method: string) =>
    method === "host.info" ? { authorized: false } : true,
  );
  let status = 404;
  const api = createApiClient({
    baseUrl: "https://api.example.test",
    fetch: async (input) => {
      if (input.endsWith("/account/get"))
        return Response.json({
          json: { id: "account", email: "account@example.test", name: "Account" },
        });
      return status === 404
        ? Response.json({ error: { code: "NOT_FOUND" } }, { status: 404 })
        : Response.json(
            {
              json: {
                defined: false,
                code: "UNAUTHORIZED",
                message: "Unauthorized",
                data: { error: { code: "AUTH_REQUIRED" } },
              },
            },
            { status: 401 },
          );
    },
  });
  const control = new DaemonControlProxy({ request }, "https://api.example.test", api);
  await control.attach("account", "https://api.example.test", grant);
  expect(request).toHaveBeenCalledWith("host.legacy", {
    accountId: "account",
    apiUrl: "https://api.example.test",
    grant,
  });
  status = 401;
  request.mockClear();
  await expect(control.attach("account", "https://api.example.test", grant)).rejects.toMatchObject({
    code: "UNAUTHORIZED",
  });
  expect(request.mock.calls.some(([method]) => method === "host.legacy")).toBe(false);
  expect((await control.info("account")).error).toBe("AUTH_REQUIRED");
});
