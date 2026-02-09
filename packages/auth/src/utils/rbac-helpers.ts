/**
 * Client-side RBAC Helper Functions
 *
 * Provides utilities for checking permissions on the client side
 */

import type { UserRole } from "../permissions";
import { getUserPermissions, hasPermission, type statement } from "../permissions";

/**
 * Check if user has permission for a resource and action (client-side)
 */
export function checkPermissionClient(
  userRole: UserRole | null | undefined,
  resource: keyof typeof statement,
  action: (typeof statement)[keyof typeof statement][number],
): boolean {
  if (!userRole) return false;
  return hasPermission(userRole, resource, action);
}

/**
 * Get all permissions for a user role (client-side)
 */
export function getUserPermissionsClient(userRole: UserRole | null | undefined) {
  if (!userRole) return {};
  return getUserPermissions(userRole);
}

/**
 * Check if user has any of the specified roles
 */
export function hasAnyRoleClient(
  userRole: UserRole | null | undefined,
  roles: UserRole[],
): boolean {
  if (!userRole) return false;
  return roles.includes(userRole);
}

/**
 * Check if user has all of the specified roles
 */
export function hasAllRolesClient(
  userRole: UserRole | null | undefined,
  roles: UserRole[],
): boolean {
  if (!userRole) return false;
  return roles.every((role) => role === userRole);
}

/**
 * Check if user is admin (admin or superadmin)
 */
export function isAdminClient(userRole: UserRole | null | undefined): boolean {
  return hasAnyRoleClient(userRole, ["admin", "superadmin"]);
}

/**
 * Check if user is superadmin
 */
export function isSuperAdminClient(userRole: UserRole | null | undefined): boolean {
  return userRole === "superadmin";
}
