import { expect, it, vi } from "vite-plus/test";
import { createHostVault, type HostBinding } from "../../../../src/runtime/daemon/vault";
import type { HostAuthorization } from "@raypx/contracts/terminal";

const binding: HostBinding = {
  apiUrl: "https://api.example.test",
  accountId: "account",
  deviceId: "eafca365-18bc-4f74-93eb-84bd717b4494",
  epoch: 1,
  expiresAt: "2099-01-01T00:00:00.000Z",
};
const authorization: HostAuthorization = {
  accountId: binding.accountId,
  deviceId: binding.deviceId,
  epoch: binding.epoch,
  expiresAt: binding.expiresAt,
  credential: "k".repeat(64),
};

it.each(["darwin", "win32"] as const)(
  "persists and restores a scoped host authorization with the %s secret service",
  async (platform) => {
    const values = new Map<string, string>();
    const secrets = {
      get: vi.fn(async ({ name }: { name: string }) => values.get(name) ?? null),
      set: vi.fn(async ({ name, value }: { name: string; value: string }) => {
        values.set(name, value);
      }),
      delete: vi.fn(async ({ name }: { name: string }) => values.delete(name)),
    };
    expect(await createHostVault({ platform, secrets }).set(binding, authorization)).toBe(true);
    expect(secrets.set).toHaveBeenCalledWith(
      expect.objectContaining({ service: "pro.raypx.daemon", persist: "local" }),
    );
    const restored = createHostVault({ platform, secrets });
    expect(await restored.get(binding)).toEqual(authorization);
    expect(
      await restored.get({ ...binding, apiUrl: "https://other.example.test" }),
    ).toBeUndefined();
    expect(await restored.get({ ...binding, accountId: "other" })).toBeUndefined();
    expect(await restored.get({ ...binding, epoch: 2 })).toBeUndefined();
    await restored.remove(binding);
    expect(await createHostVault({ platform, secrets }).get(binding)).toBeUndefined();
    expect(secrets.delete).toHaveBeenCalledOnce();
  },
);

it("uses memory without claiming persistence when Credential Manager is unavailable", async () => {
  const secrets = {
    get: vi.fn(async () => {
      throw new Error("unavailable");
    }),
    set: vi.fn(async () => {
      throw new Error("unavailable");
    }),
    delete: vi.fn(async () => {
      throw new Error("unavailable");
    }),
  };
  const vault = createHostVault({ platform: "win32", secrets });
  expect(await vault.get(binding)).toBeUndefined();
  expect(await vault.set(binding, authorization)).toBe(false);
  expect(await vault.get(binding)).toEqual(authorization);
  expect(await createHostVault({ platform: "win32", secrets }).get(binding)).toBeUndefined();
  await vault.remove(binding);
  expect(await vault.get(binding)).toBeUndefined();
});

it("rejects a secret whose binding does not match its storage key", async () => {
  const secrets = {
    get: vi.fn(async () => JSON.stringify({ ...authorization, accountId: "other-account" })),
    set: vi.fn(async () => {}),
    delete: vi.fn(async () => false),
  };
  expect(await createHostVault({ platform: "win32", secrets }).get(binding)).toBeUndefined();
});
