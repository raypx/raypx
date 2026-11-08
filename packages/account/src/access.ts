import type { AccountAccess, AccountPermission, AccountRole } from "@raypx/contracts/api";
import { assignedRoles, permissionsForRoles } from "@raypx/auth/access";

export type { AccountAccess, AccountPermission, AccountRole } from "@raypx/contracts/api";

/** Return a fresh projection so callers cannot mutate the shared role policy. */
export function accessForRole(role: AccountRole, accountId: string | null): AccountAccess {
  return { role, accountId, permissions: permissionsForRoles(role === "guest" ? [] : [role]) };
}

export function accessForAssignedRoles(
  value: string | null | undefined,
  accountId: string,
): AccountAccess {
  const roles = assignedRoles(value);
  if (!roles.length) return accessForRole("guest", null);
  return {
    role: roles.includes("admin") ? "admin" : "member",
    accountId,
    permissions: permissionsForRoles(roles),
  };
}

/** Missing or unavailable access never grants private capabilities. */
export function hasPermission(
  access: AccountAccess | null | undefined,
  permission: AccountPermission,
): boolean {
  return Boolean(access?.accountId && access.permissions.includes(permission));
}
