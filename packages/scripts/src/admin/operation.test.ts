import { describe, expect, it, vi } from "vite-plus/test";

import { databaseEnvironment, user, userRepository as repository } from "../test-fixtures.js";
import { resolveAdminCreateInput, runCreateAdmin } from "./operation.js";

const environment = () =>
  databaseEnvironment({
    ADMIN_EMAIL: "configured@example.com",
    ADMIN_DISPLAY_NAME: "Configured Admin",
  });

describe("admin create", () => {
  it("prefers flags before configured and seed defaults", () => {
    const env = environment();

    expect(resolveAdminCreateInput({ email: "flag@example.com", name: undefined }, env)).toEqual({
      email: "flag@example.com",
      displayName: "Configured Admin",
    });
  });

  it("normalizes email and closes the connection", async () => {
    const close = vi.fn(async () => undefined);
    const ensureAdmin = vi.fn(async () =>
      user({
        id: "admin-id",
        email: "admin@example.com",
        displayName: "Admin",
      }),
    );

    await runCreateAdmin({ email: "ADMIN@EXAMPLE.COM", displayName: "Admin" }, environment(), {
      createAdministration: () => ({ ensureAdmin }),
      log: vi.fn(),
      openUsers: () => ({ close, users: repository() }),
    });

    expect(ensureAdmin).toHaveBeenCalledWith({
      email: "admin@example.com",
      displayName: "Admin",
    });
    expect(close).toHaveBeenCalledOnce();
  });

  it("closes the connection after administration failures", async () => {
    const close = vi.fn(async () => undefined);

    await expect(
      runCreateAdmin({ email: "admin@example.com", displayName: "Admin" }, environment(), {
        createAdministration: () => ({
          ensureAdmin: vi.fn(async () => {
            throw new Error("create failed");
          }),
        }),
        log: vi.fn(),
        openUsers: () => ({ close, users: repository() }),
      }),
    ).rejects.toThrow("create failed");
    expect(close).toHaveBeenCalledOnce();
  });
});
