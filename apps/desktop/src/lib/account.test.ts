import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const { createApiClient } = vi.hoisted(() => ({ createApiClient: vi.fn() }));
vi.mock("@voidmix/client", () => ({ createApiClient }));

import { loadAccount } from "./account";

describe("desktop account loader", () => {
  beforeEach(() => createApiClient.mockReset());

  it("reports missing configuration without inventing an account", async () => {
    await expect(loadAccount(undefined)).resolves.toEqual({ status: "unconfigured" });
    expect(createApiClient).not.toHaveBeenCalled();
  });

  it("loads the signed-in account through the typed client", async () => {
    const profile = { id: "user-1", email: "user@example.com", displayName: "User" };
    createApiClient.mockReturnValue({ account: { get: vi.fn(async () => profile) } });

    await expect(loadAccount("https://api.example.test")).resolves.toEqual({
      status: "signed_in",
      profile,
    });
    expect(createApiClient).toHaveBeenCalledWith(
      expect.objectContaining({ baseUrl: "https://api.example.test", fetch: expect.any(Function) }),
    );
  });

  it("distinguishes an unauthenticated account from an unavailable API", async () => {
    createApiClient.mockReturnValue({
      account: { get: vi.fn(async () => Promise.reject({ code: "UNAUTHORIZED" })) },
    });
    await expect(loadAccount("https://api.example.test")).resolves.toEqual({
      status: "signed_out",
    });

    createApiClient.mockReturnValue({
      account: { get: vi.fn(async () => Promise.reject(new Error("offline"))) },
    });
    await expect(loadAccount("https://api.example.test")).resolves.toEqual({
      status: "unavailable",
    });
  });
});
