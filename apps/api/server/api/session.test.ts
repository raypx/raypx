import { describe, expect, it } from "vite-plus/test";

import { toRaypxSession } from "./session.js";

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
    expect(toRaypxSession(authSession())).toMatchObject({
      user: {
        id: "admin-1",
        email: "admin@example.com",
        displayName: "Admin",
        role: "admin",
      },
    });
  });

  it("rejects missing, invalid-role, and suspended sessions", () => {
    expect(toRaypxSession(null as never)).toBeNull();
    expect(toRaypxSession(authSession({ role: "unknown" }))).toBeNull();
    expect(toRaypxSession(authSession({ status: "suspended" }))).toBeNull();
  });
});
