import { describe, expect, it } from "vite-plus/test";

import { toVoidmixSession } from "./session.js";

const authSession = (overrides: Record<string, unknown> = {}) =>
  ({
    user: {
      id: "admin-1",
      email: "admin@example.com",
      name: "Admin",
      role: "admin",
      status: "active",
      ...overrides,
    },
    session: { expiresAt: new Date("2026-08-23T00:00:00.000Z") },
  }) as never;

describe("Better Auth session adapter", () => {
  it("maps an active Better Auth user to the shared session shape", () => {
    expect(toVoidmixSession(authSession())).toMatchObject({
      user: {
        id: "admin-1",
        email: "admin@example.com",
        displayName: "Admin",
        role: "admin",
      },
    });
  });

  it("rejects missing, invalid-role, and suspended sessions", () => {
    expect(toVoidmixSession(null as never)).toBeNull();
    expect(toVoidmixSession(authSession({ role: "unknown" }))).toBeNull();
    expect(toVoidmixSession(authSession({ status: "suspended" }))).toBeNull();
  });
});
