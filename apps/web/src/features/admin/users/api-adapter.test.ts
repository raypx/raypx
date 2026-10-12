import { describe, expect, it } from "vite-plus/test";

import { toAdminUser } from "./api-adapter";

describe("admin user API mapping", () => {
  it("maps API DTOs to the admin view model", () => {
    expect(
      toAdminUser({
        id: "user-1",
        displayName: "Ada Lovelace",
        email: "ada@example.com",
        role: "admin",
        status: "active",
        createdAt: new Date("2026-01-02T00:00:00.000Z"),
      }),
    ).toMatchObject({
      id: "user-1",
      name: "Ada Lovelace",
      email: "ada@example.com",
      role: "admin",
      status: "active",
      lastActive: { kind: "unknown" },
      joinedAt: new Date("2026-01-02T00:00:00.000Z"),
    });
  });
});
