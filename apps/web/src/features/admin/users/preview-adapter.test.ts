import { describe, expect, it } from "vite-plus/test";

import { createPreviewUsersAdapter } from "./preview-adapter";

describe("preview users adapter", () => {
  it("filters by trimmed name/email query, status, and role", async () => {
    const adapter = createPreviewUsersAdapter([
      {
        id: "1",
        name: "Ada Lovelace",
        email: "ada@example.com",
        role: "user",
        status: "active",
        lastActive: { kind: "relative", value: 0, unit: "second" },
        joinedAt: new Date("2026-01-01T00:00:00.000Z"),
      },
      {
        id: "2",
        name: "Grace Hopper",
        email: "grace@example.com",
        role: "admin",
        status: "suspended",
        lastActive: { kind: "relative", value: -1, unit: "day" },
        joinedAt: new Date("2026-01-02T00:00:00.000Z"),
      },
    ]);

    await expect(
      adapter.listUsers({ query: "  ADA@EXAMPLE  ", status: "active" }),
    ).resolves.toMatchObject({
      items: [expect.objectContaining({ id: "1" })],
      total: 1,
      nextCursor: null,
    });
    await expect(adapter.listUsers({ status: "active" })).resolves.toMatchObject({
      items: [expect.anything()],
      total: 1,
    });
    await expect(adapter.listUsers({ role: "admin" })).resolves.toMatchObject({
      items: [expect.objectContaining({ id: "2" })],
    });
  });

  it("updates a copied preview record without mutating the fixture", async () => {
    const adapter = createPreviewUsersAdapter([
      {
        id: "1",
        name: "Ada Lovelace",
        email: "ada@example.com",
        role: "user",
        status: "active",
        lastActive: { kind: "relative", value: 0, unit: "second" },
        joinedAt: new Date("2026-01-01T00:00:00.000Z"),
      },
    ]);

    await expect(
      adapter.updateUserStatus({ userId: "1", status: "suspended" }),
    ).resolves.toMatchObject({
      status: "suspended",
    });
    await expect(adapter.listUsers({ status: "suspended" })).resolves.toMatchObject({
      items: [expect.anything()],
      total: 1,
    });
    await expect(
      adapter.updateUserStatus({ userId: "missing", status: "active" }),
    ).rejects.toMatchObject({ code: "USER_NOT_FOUND" });
  });
});
