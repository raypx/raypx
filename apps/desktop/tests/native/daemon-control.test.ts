import { expect, it, vi } from "vite-plus/test";
import { DaemonControlProxy } from "../../native/daemon-control";
import type { ApiClient } from "@raypx/client";
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
