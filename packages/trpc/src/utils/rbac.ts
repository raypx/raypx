/**
 * RBAC (Role-Based Access Control) Utilities
 *
 * Provides generic permission checking utilities for tRPC procedures
 */

import type { UserRole } from "@raypx/auth";
import { hasPermission, type statement } from "@raypx/auth";
import { db, eq, schemas } from "@raypx/database";
import { TRPCError } from "@trpc/server";
import { Errors } from "../errors";

/**
 * Get user role from database
 */
export async function getUserRole(userId: string): Promise<UserRole | null> {
  const user = await db.query.user.findFirst({
    where: eq(schemas.user.id, userId),
    columns: { role: true },
  });
  return (user?.role as UserRole) || null;
}

/**
 * Check if user has permission for a resource and action
 */
export async function checkPermission(
  userId: string,
  resource: keyof typeof statement,
  action: (typeof statement)[keyof typeof statement][number],
): Promise<boolean> {
  const role = await getUserRole(userId);
  if (!role) return false;
  return hasPermission(role, resource, action);
}

/**
 * Assert that user has permission, throw error if not
 */
export async function assertPermission(
  userId: string,
  resource: keyof typeof statement,
  action: (typeof statement)[keyof typeof statement][number],
): Promise<void> {
  const hasAccess = await checkPermission(userId, resource, action);
  if (!hasAccess) {
    throw Errors.insufficientPermissions(action, resource);
  }
}

/**
 * Check if user has any of the specified roles
 */
export async function hasAnyRole(userId: string, roles: UserRole[]): Promise<boolean> {
  const userRole = await getUserRole(userId);
  if (!userRole) return false;
  return roles.includes(userRole);
}

/**
 * Assert that user has one of the specified roles
 */
export async function assertRole(userId: string, roles: UserRole[]): Promise<void> {
  const hasAccess = await hasAnyRole(userId, roles);
  if (!hasAccess) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: `Access denied. Required roles: ${roles.join(", ")}`,
    });
  }
}

/**
 * Check if user owns a resource (by userId field)
 */
export function isOwner(resourceUserId: string | null, currentUserId: string): boolean {
  return resourceUserId === currentUserId;
}

/**
 * Assert that user owns the resource
 */
export function assertOwnership(
  resourceUserId: string | null,
  currentUserId: string,
  resourceType: string,
  resourceId: string,
): void {
  if (!isOwner(resourceUserId, currentUserId)) {
    throw Errors.accessDenied(resourceType, resourceId);
  }
}

/**
 * Check if user can access resource (owner or has permission)
 */
export async function canAccessResource(
  userId: string,
  resourceUserId: string | null,
  resource: keyof typeof statement,
  action: (typeof statement)[keyof typeof statement][number],
): Promise<boolean> {
  // Owner can always access
  if (isOwner(resourceUserId, userId)) {
    return true;
  }
  // Check permission
  return checkPermission(userId, resource, action);
}

/**
 * Assert that user can access resource (owner or has permission)
 */
export async function assertResourceAccess(
  userId: string,
  resourceUserId: string | null,
  resource: keyof typeof statement,
  action: (typeof statement)[keyof typeof statement][number],
  resourceType: string,
  resourceId: string,
): Promise<void> {
  const hasAccess = await canAccessResource(userId, resourceUserId, resource, action);
  if (!hasAccess) {
    throw Errors.accessDenied(resourceType, String(resourceId));
  }
}
