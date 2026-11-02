import { describe, expect, it } from "vite-plus/test";
import { accessForRole, accessForAssignedRoles, hasPermission } from "../src/access";

describe("account permissions", () => {
  it("composes Better Auth roles and denies unsupported assignments", () => {
    expect(accessForAssignedRoles("member,admin", "a")).toEqual(accessForRole("admin", "a"));
    for (const role of [undefined, "", "owner", "admin,owner"])
      expect(accessForAssignedRoles(role, "a")).toEqual(accessForRole("guest", null));
  });
  it("denies guests and unavailable access, including forged guest grants without identity", () => {
    expect(hasPermission(undefined, "configuration.read")).toBe(false);
    expect(hasPermission(accessForRole("guest", null), "tasks.read")).toBe(false);
    expect(
      hasPermission({ ...accessForRole("admin", "a"), accountId: null }, "configuration.read"),
    ).toBe(false);
  });

  it("gives members personal capabilities and reserves configuration for administrators", () => {
    const member = accessForRole("member", "m");
    const admin = accessForRole("admin", "a");
    expect(hasPermission(member, "automations.manage")).toBe(true);
    expect(hasPermission(member, "memory.manage")).toBe(true);
    expect(hasPermission(member, "approvals.read")).toBe(true);
    expect(hasPermission(member, "configuration.read")).toBe(false);
    expect(hasPermission(member, "configuration.update")).toBe(false);
    expect(admin.permissions).toEqual(expect.arrayContaining(member.permissions));
    expect(hasPermission(admin, "configuration.update")).toBe(true);
    admin.permissions.length = 0;
    expect(hasPermission(accessForRole("admin", "a"), "configuration.read")).toBe(true);
  });
});
