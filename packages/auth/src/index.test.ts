import { describe, expect, it } from "vite-plus/test";
import { hasPermission, type Session } from "./index";

const session = (role: Session["user"]["role"]): Session => ({
  user: {
    id: "usr_1",
    email: "person@voidmix.local",
    displayName: "Person",
    role,
  },
  expiresAt: new Date("2030-01-01T00:00:00.000Z"),
});

describe("hasPermission", () => {
  it("grants administrative access to admins", () => {
    expect(hasPermission(session("admin"), "admin.users.write")).toBe(true);
  });

  it("denies administrative access to regular users", () => {
    expect(hasPermission(session("user"), "admin.users.read")).toBe(false);
  });

  it.each(["admin", "owner"] as const)("grants the active admin surface to %s", (role) => {
    for (const permission of [
      "admin.users.read",
      "admin.users.write",
      "admin.audit.read",
      "admin.runs.read",
      "admin.usage.read",
    ] as const)
      expect(hasPermission(session(role), permission)).toBe(true);
  });
  it.each(["admin.runs.read", "admin.usage.read"] as const)(
    "denies %s without an administrator grant",
    (permission) => {
      expect(hasPermission(session("user"), permission)).toBe(false);
      expect(hasPermission(null, permission)).toBe(false);
    },
  );
});
