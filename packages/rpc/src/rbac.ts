import { db } from "@raypx/database";
import { member } from "@raypx/database/schema/auth";
import { customPermission, DEFAULT_ROLE_PERMISSIONS } from "@raypx/database/schema/rbac";
import { and, eq } from "drizzle-orm";

type Role = keyof typeof DEFAULT_ROLE_PERMISSIONS;
type Resource = keyof (typeof DEFAULT_ROLE_PERMISSIONS)["owner"];
type Action = "create" | "read" | "update" | "delete" | "manage";

export interface PermissionCheckParams {
  userId: string;
  organizationId: string;
  resource: Resource;
  action: Action;
}

/**
 * Check if a user has permission to perform an action on a resource
 */
export async function hasPermission(params: PermissionCheckParams): Promise<boolean> {
  const { userId, organizationId, resource, action } = params;

  // Get the user's membership in the organization
  const membership = await db.query.member.findFirst({
    where: and(eq(member.userId, userId), eq(member.organizationId, organizationId)),
  });

  if (!membership) {
    return false;
  }

  const role = membership.role as Role;

  // Check for custom permission overrides
  const custom = await db.query.customPermission.findFirst({
    where: and(
      eq(customPermission.memberId, membership.id),
      eq(customPermission.resource, resource),
      eq(customPermission.action, action),
    ),
  });

  if (custom) {
    return custom.granted === "true";
  }

  // Check default role permissions
  const rolePermissions = DEFAULT_ROLE_PERMISSIONS[role];
  if (!rolePermissions) {
    return false;
  }

  const allowedActions = rolePermissions[resource] as readonly string[];
  if (!allowedActions) {
    return false;
  }

  // "manage" permission includes all other actions
  if (allowedActions.includes("manage")) {
    return true;
  }

  return allowedActions.includes(action);
}

/**
 * Get all permissions for a user in an organization
 */
export async function getUserPermissions(
  userId: string,
  organizationId: string,
): Promise<Record<Resource, Action[]>> {
  const membership = await db.query.member.findFirst({
    where: and(eq(member.userId, userId), eq(member.organizationId, organizationId)),
  });

  if (!membership) {
    return {} as Record<Resource, Action[]>;
  }

  const role = membership.role as Role;
  const rolePermissions = DEFAULT_ROLE_PERMISSIONS[role];

  // Get custom permissions
  const customPerms = await db.query.customPermission.findMany({
    where: eq(customPermission.memberId, membership.id),
  });

  // Build permissions object
  const permissions = { ...rolePermissions } as Record<Resource, string[]>;

  // Apply custom permission overrides
  for (const custom of customPerms) {
    const resource = custom.resource as Resource;
    const action = custom.action as Action;

    if (!permissions[resource]) {
      permissions[resource] = [];
    }

    if (custom.granted === "true") {
      if (!permissions[resource].includes(action)) {
        permissions[resource].push(action);
      }
    } else {
      permissions[resource] = permissions[resource].filter((a) => a !== action);
    }
  }

  return permissions as Record<Resource, Action[]>;
}

/**
 * Require a specific permission, throws if not allowed
 */
export async function requirePermission(params: PermissionCheckParams): Promise<void> {
  const allowed = await hasPermission(params);
  if (!allowed) {
    throw new Error(`Permission denied: ${params.action} on ${params.resource}`);
  }
}

/**
 * Get user's role in an organization
 */
export async function getUserRole(userId: string, organizationId: string): Promise<Role | null> {
  const membership = await db.query.member.findFirst({
    where: and(eq(member.userId, userId), eq(member.organizationId, organizationId)),
  });

  return membership?.role as Role | null;
}

/**
 * Check if user is owner of an organization
 */
export async function isOrganizationOwner(
  userId: string,
  organizationId: string,
): Promise<boolean> {
  const role = await getUserRole(userId, organizationId);
  return role === "owner";
}
