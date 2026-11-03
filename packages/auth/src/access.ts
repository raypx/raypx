import { createAccessControl } from "better-auth/plugins/access";
import { defaultStatements } from "better-auth/plugins/admin/access";
import { applicationPermissions, type AuthRole } from "@raypx/core/permissions";
export { applicationPermissions } from "@raypx/core/permissions";

/** The same ACL powers Better Auth administration and Raypx's permission projection. */
export const accountAccessControl = createAccessControl({
  ...defaultStatements,
  raypx: applicationPermissions,
});

export const accountRoles = {
  member: accountAccessControl.newRole({
    raypx: [
      "projects.read",
      "tasks.read",
      "approvals.read",
      "automations.manage",
      "memory.manage",
      "account.manage",
    ],
    user: [],
    session: [],
  }),
  admin: accountAccessControl.newRole({
    raypx: [...applicationPermissions],
    user: ["list", "get", "set-role"],
    session: [],
  }),
} satisfies Record<AuthRole, unknown>;
export type { AuthRole } from "@raypx/core/permissions";

/** Better Auth stores multiple assigned roles as comma-separated names. Unknown roles fail closed. */
export function assignedRoles(value: string | null | undefined): AuthRole[] {
  if (!value) return [];
  const roles = value.split(",");
  return roles.every((role): role is AuthRole => Object.hasOwn(accountRoles, role)) ? roles : [];
}

export function permissionsForRoles(roles: readonly AuthRole[]) {
  return applicationPermissions.filter((permission) =>
    roles.some((role) => accountRoles[role].authorize({ raypx: [permission] }).success),
  );
}
